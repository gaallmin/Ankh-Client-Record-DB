import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'

// GET /api/client/notifications — the client's own notification history.
export async function GET(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') || '20', 10)))
    const skip = Math.max(0, parseInt(searchParams.get('skip') || '0', 10))

    const notifications = await prisma.notification.findMany({
      where: { clientAccountId: auth.clientAccountId, status: { in: ['SENT', 'PENDING', 'FAILED'] } },
      select: { id: true, type: true, channel: true, status: true, title: true, body: true, createdAt: true, sentAt: true },
      orderBy: { createdAt: 'desc' },
      take, skip
    })

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error('Client notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
