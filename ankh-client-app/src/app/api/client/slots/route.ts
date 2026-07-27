import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'
import { generateSlots, DEFAULT_BUSINESS_TZ } from '@/lib/slots'

// GET /api/client/slots?from=ISO&to=ISO — bookable 30-minute slots.
// Server-side derivation only; the client never receives raw reservation or
// instructor data — just slot times + open/waitlist state (small response).
export async function GET(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : now
    const defaultTo = new Date(now.getTime() + 14 * 86400000)
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : defaultTo
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }
    // Cap the range server-side to keep response size and query cost bounded.
    const cappedTo = new Date(Math.min(to.getTime(), from.getTime() + 31 * 86400000))

    const [templates, reservations, blocks] = await Promise.all([
      prisma.availabilityTemplate.findMany({
        select: { instructorId: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true }
      }),
      prisma.reservation.findMany({
        where: { scheduledAt: { gte: from, lte: cappedTo }, status: 'CONFIRMED' },
        select: { instructorId: true, scheduledAt: true, durationMinutes: true, status: true }
      }),
      prisma.unavailabilityBlock.findMany({
        where: { startDate: { lte: cappedTo }, endDate: { gte: from }, instructorId: { not: null } },
        select: { instructorId: true, customerId: true, startDate: true, endDate: true }
      })
    ])

    const slots = generateSlots({
      templates, reservations, blocks,
      from: from > now ? from : now, // never offer past slots
      to: cappedTo,
      tz: process.env.BUSINESS_TZ || DEFAULT_BUSINESS_TZ
    })

    return NextResponse.json({
      slots: slots.filter(s => s.state !== 'unavailable').map(s => ({
        startsAt: s.startsAt.toISOString(),
        durationMinutes: s.durationMinutes,
        state: s.state
      }))
    })
  } catch (error) {
    console.error('Client slots error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
