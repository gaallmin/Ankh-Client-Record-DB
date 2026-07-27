import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'
import { prisma } from '@/lib/prisma'
import { notifyCustomer, reservationEventKey } from '@/lib/notifications'
import { isReservationOverlapError } from '@/lib/reservationConflicts'


const requireStaff = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string; role?: string }
    if (decoded.role !== 'MANAGER' && decoded.role !== 'INSTRUCTOR') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true, userId: decoded.userId, role: decoded.role }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

const VALID_STATUSES = ['CONFIRMED', 'WAITLISTED', 'PENDING', 'CANCELLED']

// PUT /api/reservations/[reservationId]
// Handles reschedule (scheduledAt/instructorId), instructor-assignment from the unassigned
// queue (instructorId + status:'CONFIRMED'), and cancellation (status:'CANCELLED').
// MANAGER may update any reservation. INSTRUCTOR may only update reservations already
// assigned to themselves, and cannot reassign to a different instructor.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { reservationId } = await params
    if (!reservationId) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 })
    }

    const existing = await prisma.reservation.findUnique({ where: { id: reservationId } })
    if (!existing) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    if (auth.role === 'INSTRUCTOR' && existing.instructorId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { instructorId, scheduledAt, status, notes } = body

    if (auth.role === 'INSTRUCTOR' && instructorId !== undefined && instructorId !== auth.userId) {
      return NextResponse.json({ error: 'Instructors cannot reassign a reservation to another instructor' }, { status: 403 })
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    let parsedScheduledAt: Date | undefined
    if (scheduledAt !== undefined) {
      parsedScheduledAt = new Date(scheduledAt)
      if (Number.isNaN(parsedScheduledAt.getTime())) {
        return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
      }
    }

    // Assigning an instructor from the unassigned queue confirms the reservation, unless the
    // caller explicitly requests a different status.
    const nextInstructorId = instructorId !== undefined ? instructorId : existing.instructorId
    const nextStatus = status !== undefined
      ? status
      : (instructorId !== undefined && !existing.instructorId && nextInstructorId ? 'CONFIRMED' : existing.status)

    const reservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        ...(instructorId !== undefined ? { instructorId: instructorId || null } : {}),
        ...(parsedScheduledAt ? { scheduledAt: parsedScheduledAt } : {}),
        ...(nextStatus !== existing.status ? { status: nextStatus } : {}),
        ...(notes !== undefined ? { notes } : {}),
        // Position only makes sense while WAITLISTED — clear it on any other transition.
        ...(nextStatus !== 'WAITLISTED' ? { waitlistPosition: null } : {})
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, company: true } },
        instructor: { select: { id: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true } }
      }
    })

    // ── Customer notifications on state transitions ──────────────────────────
    // Idempotent per (event, target status): duplicate PUTs cannot double-send.
    const timeLabel = reservation.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')
    if (nextStatus === 'CONFIRMED' && existing.status === 'WAITLISTED') {
      // Waiting-list promotion — required to reach the customer's phone.
      await notifyCustomer({
        type: 'WAITLIST_CONFIRMED',
        dedupeKey: reservationEventKey('WAITLIST_CONFIRMED', reservationId),
        customerId: reservation.customerId,
        reservationId,
        title: 'Your waitlisted session is confirmed! (대기 예약 확정)',
        body: `A spot opened up — your session on ${timeLabel} is now confirmed.`
      })
    } else if (nextStatus === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      await notifyCustomer({
        type: 'RESERVATION_CONFIRMED',
        dedupeKey: reservationEventKey('RESERVATION_CONFIRMED', reservationId),
        customerId: reservation.customerId,
        reservationId,
        title: 'Reservation confirmed (예약 확정)',
        body: `Your session on ${timeLabel} is confirmed${reservation.instructor ? ` with ${reservation.instructor.firstName} ${reservation.instructor.lastName}` : ''}.`
      })
    } else if (nextStatus === 'CANCELLED' && existing.status !== 'CANCELLED') {
      await notifyCustomer({
        type: 'RESERVATION_CANCELLED',
        dedupeKey: reservationEventKey('RESERVATION_CANCELLED', reservationId),
        customerId: reservation.customerId,
        reservationId,
        title: 'Reservation cancelled (예약 취소)',
        body: `Your session on ${timeLabel} has been cancelled.`
      })
    } else if (parsedScheduledAt && parsedScheduledAt.getTime() !== existing.scheduledAt.getTime()) {
      await notifyCustomer({
        type: 'RESERVATION_CHANGED',
        dedupeKey: reservationEventKey('RESERVATION_CHANGED', reservationId, parsedScheduledAt.toISOString()),
        customerId: reservation.customerId,
        reservationId,
        title: 'Reservation changed (예약 변경)',
        body: `Your session was moved to ${timeLabel}.`
      })
    }

    return NextResponse.json({ reservation })
  } catch (error) {
    console.error('Error updating reservation:', error)
    if (error instanceof Error && error.message.includes('Foreign key constraint failed')) {
      return NextResponse.json({ error: 'Invalid instructorId' }, { status: 400 })
    }
    // Partial unique index reservations_confirmed_slot_key: the instructor
    // already has a CONFIRMED session at this exact time (race lost).
    if (isReservationOverlapError(error)) {
      return NextResponse.json({ error: 'That instructor already has a confirmed session overlapping this time' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
