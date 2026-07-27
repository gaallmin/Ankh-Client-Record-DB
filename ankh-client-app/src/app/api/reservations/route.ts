import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyCustomer, reservationEventKey } from '@/lib/notifications'
import { isReservationOverlapError } from '@/lib/reservationConflicts'
import { requireStaff } from '@/lib/staffAuth'

const RESERVATION_SELECT = {
  id: true,
  customerId: true,
  instructorId: true,
  locationId: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  source: true,
  isInstructorAdded: true,
  waitlistPosition: true,
  lessonId: true,
  notes: true,
  createdAt: true,
  customer: { select: { id: true, firstName: true, lastName: true, company: true } },
  instructor: { select: { id: true, firstName: true, lastName: true } },
  location: { select: { id: true, name: true } }
} as const

// GET /api/reservations?from=ISO&to=ISO&instructorId=...&includeCancelled=true
// MANAGER: all reservations (optionally filtered by instructorId). INSTRUCTOR: always scoped to self.
export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const instructorIdFilter = searchParams.get('instructorId')
    const includeCancelled = searchParams.get('includeCancelled') === 'true'

    const scopedInstructorId = auth.role === 'INSTRUCTOR'
      ? auth.userId
      : (instructorIdFilter && instructorIdFilter !== 'all' ? instructorIdFilter : undefined)

    const statusFilter = searchParams.get('status')
    const withNotifications = searchParams.get('withNotifications') === 'true'

    const reservations = await prisma.reservation.findMany({
      where: {
        ...(scopedInstructorId ? { instructorId: scopedInstructorId } : {}),
        ...(from || to ? { scheduledAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
        ...(statusFilter && statusFilter !== 'all'
          ? { status: statusFilter as 'CONFIRMED' | 'WAITLISTED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' }
          : includeCancelled ? {} : { status: { not: 'CANCELLED' } })
      },
      select: {
        ...RESERVATION_SELECT,
        // Single query with a bounded nested select — avoids N+1 per reservation.
        ...(withNotifications ? {
          notifications: {
            select: { id: true, channel: true, status: true, type: true, createdAt: true },
            orderBy: { createdAt: 'desc' as const },
            take: 4
          }
        } : {})
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500
    })

    return NextResponse.json({ reservations })
  } catch (error) {
    console.error('Error fetching reservations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/reservations — create a reservation.
// instructorId omitted/null → PENDING (unassigned queue). Otherwise: CONFIRMED, unless the
// instructor already has a CONFIRMED reservation at that exact scheduledAt, in which case the
// new one is WAITLISTED — waitlist position is counted globally per exact scheduledAt (across
// all instructors), per the global-per-slot waitlist decision.
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const body = await request.json()
    const { customerId, instructorId, locationId, scheduledAt, durationMinutes, notes } = body

    if (!customerId || !scheduledAt) {
      return NextResponse.json({ error: 'customerId and scheduledAt are required' }, { status: 400 })
    }

    const parsedScheduledAt = new Date(scheduledAt)
    if (Number.isNaN(parsedScheduledAt.getTime())) {
      return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
    }
    const parsedDurationMinutes = durationMinutes === undefined ? 30 : Number(durationMinutes)
    if (!Number.isInteger(parsedDurationMinutes) || parsedDurationMinutes < 1 || parsedDurationMinutes > 480) {
      return NextResponse.json({ error: 'durationMinutes must be an integer between 1 and 480' }, { status: 400 })
    }

    // Instructors may only log bookings for themselves (flagged instructor-added).
    const effectiveInstructorId = auth.role === 'INSTRUCTOR' ? auth.userId : (instructorId || null)
    const source = auth.role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'MANAGER'
    const isInstructorAdded = source === 'INSTRUCTOR'

    let status: 'CONFIRMED' | 'PENDING' | 'WAITLISTED' = 'PENDING'
    let waitlistPosition: number | null = null

    if (effectiveInstructorId) {
      const requestedEnd = new Date(parsedScheduledAt.getTime() + parsedDurationMinutes * 60000)
      const conflicts = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "reservations"
        WHERE "instructorId" = ${effectiveInstructorId}
          AND "status" = 'CONFIRMED'
          AND "scheduledAt" < ${requestedEnd}
          AND "scheduledAt" + ("durationMinutes" * INTERVAL '1 minute') > ${parsedScheduledAt}
        LIMIT 1
      `
      const conflict = conflicts[0]
      if (conflict) {
        status = 'WAITLISTED'
        const waitlistedAtSlot = await prisma.reservation.count({
          where: { scheduledAt: parsedScheduledAt, status: 'WAITLISTED' }
        })
        waitlistPosition = waitlistedAtSlot + 1
      } else {
        status = 'CONFIRMED'
      }
    }

    const reservation = await prisma.reservation.create({
      data: {
        customerId,
        instructorId: effectiveInstructorId,
        locationId: locationId || null,
        scheduledAt: parsedScheduledAt,
        durationMinutes: parsedDurationMinutes,
        status,
        source,
        isInstructorAdded,
        waitlistPosition,
        notes: notes || null
      },
      select: RESERVATION_SELECT
    })

    const timeLabel = parsedScheduledAt.toISOString().slice(0, 16).replace('T', ' ')
    await notifyCustomer({
      type: status === 'CONFIRMED' ? 'RESERVATION_CONFIRMED' : 'RESERVATION_REQUESTED',
      dedupeKey: reservationEventKey(status === 'CONFIRMED' ? 'RESERVATION_CONFIRMED' : 'RESERVATION_REQUESTED', reservation.id),
      customerId,
      reservationId: reservation.id,
      title: status === 'CONFIRMED' ? 'Reservation confirmed (예약 확정)' : 'Reservation received (예약 접수)',
      body: status === 'CONFIRMED'
        ? `Your session on ${timeLabel} is confirmed.`
        : `Your reservation request for ${timeLabel} was received${status === 'WAITLISTED' ? ` — waitlist #${waitlistPosition}` : ''}.`
    })

    return NextResponse.json({ reservation }, { status: 201 })
  } catch (error) {
    console.error('Error creating reservation:', error)
    if (error instanceof Error && error.message.includes('Foreign key constraint failed')) {
      return NextResponse.json({ error: 'Invalid customerId, instructorId, or locationId' }, { status: 400 })
    }
    // Partial unique index: lost a race for this instructor+time — surface as conflict.
    if (isReservationOverlapError(error)) {
      return NextResponse.json({ error: 'That instructor already has a confirmed session overlapping this time' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
