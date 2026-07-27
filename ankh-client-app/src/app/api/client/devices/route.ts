import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'

// POST /api/client/devices — register/refresh a push token for this account.
// Token refresh: same token re-registered updates lastSeenAt / un-revokes.
// A token previously owned by a different account is re-assigned to the current
// one (device changed hands / user logged into a new account on the device).
export async function POST(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { token, platform } = await request.json()
    if (!token || typeof token !== 'string' || !['android', 'ios', 'web'].includes(platform)) {
      return NextResponse.json({ error: 'token and platform (android|ios|web) are required' }, { status: 400 })
    }

    const device = await prisma.clientDevice.upsert({
      where: { token },
      update: { clientAccountId: auth.clientAccountId, platform, lastSeenAt: new Date(), revokedAt: null },
      create: { clientAccountId: auth.clientAccountId, platform, token },
      select: { id: true, platform: true, createdAt: true }
    })

    return NextResponse.json({ device }, { status: 201 })
  } catch (error) {
    console.error('Client device register error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/client/devices — revoke a token (logout / notifications disabled).
export async function DELETE(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

    await prisma.clientDevice.updateMany({
      where: { token, clientAccountId: auth.clientAccountId },
      data: { revokedAt: new Date() }
    })

    return NextResponse.json({ message: 'Device revoked' })
  } catch (error) {
    console.error('Client device revoke error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
