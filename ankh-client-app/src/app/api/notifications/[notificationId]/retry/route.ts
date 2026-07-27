import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { attemptPushSend } from '@/lib/notifications'
import { requireStaff } from '@/lib/staffAuth'

// POST /api/notifications/[notificationId]/retry — staff retry of a FAILED send.
// Reuses the SAME notification row (same dedupeKey), so a retry can never
// produce a duplicate event — it only re-attempts delivery.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { notificationId } = await params
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        clientDevice: true,
      }
    })
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    if (notification.status === 'SENT') {
      return NextResponse.json({ error: 'Already sent — retry refused (idempotency)' }, { status: 409 })
    }

    if (notification.channel !== 'PUSH') {
      return NextResponse.json({ error: 'SMS delivery is not supported' }, { status: 409 })
    }
    if (!notification.clientDevice || notification.clientDevice.revokedAt) {
      return NextResponse.json({ error: 'No active device is associated with this notification' }, { status: 409 })
    }

    const ok = await attemptPushSend(
      notificationId,
      notification.clientDevice,
      notification.title,
      notification.body
    )
    const updated = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, status: true, attempts: true, error: true, sentAt: true }
    })
    return NextResponse.json({ notification: updated, delivered: ok })
  } catch (error) {
    console.error('Notification retry error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
