import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

// GET /api/client-accounts — staff (manager) view of client accounts and their
// link state, so unlinked registrations can be verified and linked.
export async function GET(request: NextRequest) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const unlinkedOnly = searchParams.get('unlinked') === 'true'

    const accounts = await prisma.clientAccount.findMany({
      where: unlinkedOnly ? { customerId: null } : {},
      select: {
        id: true, username: true, phone: true, email: true,
        customerId: true, linkVerifiedAt: true, isActive: true, createdAt: true,
        customer: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Client accounts list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
