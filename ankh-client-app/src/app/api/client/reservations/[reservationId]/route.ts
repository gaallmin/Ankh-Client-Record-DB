import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'
import { notifyCustomer, reservationEventKey } from '@/lib/notifications'

// PUT /api/client/reservations/[reservationId]
// Clients may cancel their own upcoming reservations, or reschedule (which is
// modeled as cancel + the client making a new booking — keeps slot validation
// in one place). Only the reservation's own linked customer can act on it.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { reservationId } = await params
    const { action } = await request.json()
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Unsupported action — to reschedule, cancel and book a new slot' }, { status: 400 })
    }

    const account = await prisma.clientAccount.findUnique({
      where: { id: auth.clientAccountId }, select: { customerId: true }
    })
    if (!account?.customerId) return NextResponse.json({ error: 'Account not linked' }, { status: 403 })

    const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } })
    if (!reservation || reservation.customerId !== account.customerId) {
      // 404 (not 403) so clients can't probe other clients' reservation ids
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }
    if (!['PENDING', 'CONFIRMED', 'WAITLISTED'].includes(reservation.status)) {
      return NextResponse.json({ error: 'This reservation can no longer be cancelled' }, { status: 409 })
    }

    const updated = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', waitlistPosition: null },
      select: { id: true, status: true, scheduledAt: true }
    })

    await notifyCustomer({
      type: 'RESERVATION_CANCELLED',
      dedupeKey: reservationEventKey('RESERVATION_CANCELLED', reservationId),
      customerId: account.customerId,
      reservationId,
      title: 'Reservation cancelled (예약 취소)',
      body: `Your reservation for ${updated.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} has been cancelled.`
    })

    return NextResponse.json({ reservation: updated })
  } catch (error) {
    console.error('Client reservation cancel error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
