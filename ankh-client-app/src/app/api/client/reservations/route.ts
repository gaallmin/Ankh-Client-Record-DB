import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'
import { rateLimit } from '@/lib/rateLimit'
import { notifyCustomer, reservationEventKey } from '@/lib/notifications'
import { generateSlots, DEFAULT_BUSINESS_TZ } from '@/lib/slots'

const CreateSchema = z.object({
  scheduledAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
  waitlistOk: z.boolean().optional()
})

// GET /api/client/reservations — the client's own reservations only.
export async function GET(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const account = await prisma.clientAccount.findUnique({
      where: { id: auth.clientAccountId }, select: { customerId: true }
    })
    if (!account?.customerId) return NextResponse.json({ reservations: [], linked: false })

    const reservations = await prisma.reservation.findMany({
      where: { customerId: account.customerId },
      select: {
        id: true, scheduledAt: true, durationMinutes: true, status: true,
        waitlistPosition: true, notes: true, createdAt: true,
        instructor: { select: { firstName: true, lastName: true } },
        location: { select: { name: true } }
      },
      orderBy: { scheduledAt: 'desc' },
      take: 50
    })

    return NextResponse.json({ reservations, linked: true })
  } catch (error) {
    console.error('Client reservations GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/client/reservations — book a 30-minute slot.
// Open slot   → PENDING, unassigned (enters the manager's unassigned queue —
//               this preserves the existing staff assignment workflow exactly).
// Full slot   → WAITLISTED with a global per-slot position (existing rule).
// Runs in a transaction so concurrent bookings can't corrupt waitlist positions.
export async function POST(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    if (!rateLimit(`book:${auth.clientAccountId}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many booking attempts. Try again later.' }, { status: 429 })
    }

    const parsed = CreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const account = await prisma.clientAccount.findUnique({
      where: { id: auth.clientAccountId }, select: { customerId: true, linkVerifiedAt: true }
    })
    if (!account?.customerId) {
      return NextResponse.json(
        { error: 'Your account is not yet linked to a customer record. Please contact the studio.' },
        { status: 403 }
      )
    }

    const scheduledAt = new Date(parsed.data.scheduledAt)
    if (scheduledAt <= new Date()) {
      return NextResponse.json({ error: 'Cannot book a past time' }, { status: 400 })
    }

    // Validate the requested time actually corresponds to a template-derived slot.
    const windowFrom = new Date(scheduledAt.getTime() - 1)
    const windowTo = new Date(scheduledAt.getTime() + 30 * 60000)
    const [templates, confirmed, blocks] = await Promise.all([
      prisma.availabilityTemplate.findMany({
        select: { instructorId: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true }
      }),
      prisma.reservation.findMany({
        where: { scheduledAt: { gte: new Date(scheduledAt.getTime() - 2 * 3600000), lte: windowTo }, status: 'CONFIRMED' },
        select: { instructorId: true, scheduledAt: true, durationMinutes: true, status: true }
      }),
      prisma.unavailabilityBlock.findMany({
        where: { startDate: { lte: windowTo }, endDate: { gte: windowFrom }, instructorId: { not: null } },
        select: { instructorId: true, customerId: true, startDate: true, endDate: true }
      })
    ])
    const slots = generateSlots({
      templates, reservations: confirmed, blocks,
      from: windowFrom, to: windowTo,
      tz: process.env.BUSINESS_TZ || DEFAULT_BUSINESS_TZ
    })
    const slot = slots.find(s => s.startsAt.getTime() === scheduledAt.getTime())
    if (!slot || slot.state === 'unavailable') {
      return NextResponse.json({ error: 'That time is not available for booking' }, { status: 409 })
    }
    if (slot.state === 'waitlist' && !parsed.data.waitlistOk) {
      return NextResponse.json({ error: 'Slot is full', waitlistAvailable: true }, { status: 409 })
    }

    const customerId = account.customerId
    const reservation = await prisma.$transaction(async tx => {
      const duplicate = await tx.reservation.findFirst({
        where: { customerId, scheduledAt, status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] } }
      })
      if (duplicate) throw new Error('DUPLICATE_BOOKING')

      if (slot.state === 'waitlist') {
        const position = await tx.reservation.count({ where: { scheduledAt, status: 'WAITLISTED' } })
        return tx.reservation.create({
          data: {
            customerId, scheduledAt, durationMinutes: 30,
            status: 'WAITLISTED', source: 'CLIENT', waitlistPosition: position + 1,
            notes: parsed.data.notes || null
          },
          select: { id: true, scheduledAt: true, status: true, waitlistPosition: true }
        })
      }
      return tx.reservation.create({
        data: {
          customerId, scheduledAt, durationMinutes: 30,
          status: 'PENDING', source: 'CLIENT',
          notes: parsed.data.notes || null
        },
        select: { id: true, scheduledAt: true, status: true, waitlistPosition: true }
      })
    })

    await notifyCustomer({
      type: 'RESERVATION_REQUESTED',
      dedupeKey: reservationEventKey('RESERVATION_REQUESTED', reservation.id),
      customerId,
      reservationId: reservation.id,
      title: 'Reservation received (예약 접수)',
      body: `Your request for ${scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} was received${reservation.status === 'WAITLISTED' ? ` — waitlist #${reservation.waitlistPosition}` : ' and is awaiting confirmation'}.`
    })

    return NextResponse.json({ reservation }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_BOOKING') {
      return NextResponse.json({ error: 'You already have a reservation at this time' }, { status: 409 })
    }
    console.error('Client reservations POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
