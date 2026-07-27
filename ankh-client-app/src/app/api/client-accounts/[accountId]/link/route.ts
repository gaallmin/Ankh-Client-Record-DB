import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

// PUT /api/client-accounts/[accountId]/link — staff-confirmed link/unlink.
// Body: { customerId: string } to link, { customerId: null } to unlink.
// One account ↔ exactly one customer (DB-unique both directions). Never merges
// records; never creates a Customer. Every change is audit-logged.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { accountId } = await params
    const { customerId } = await request.json()

    const account = await prisma.clientAccount.findUnique({ where: { id: accountId } })
    if (!account) return NextResponse.json({ error: 'Client account not found' }, { status: 404 })

    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } })
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

      const alreadyLinked = await prisma.clientAccount.findUnique({ where: { customerId } })
      if (alreadyLinked && alreadyLinked.id !== accountId) {
        return NextResponse.json(
          { error: 'That customer record is already linked to another client account' },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.clientAccount.update({
      where: { id: accountId },
      data: { customerId: customerId || null, linkVerifiedAt: customerId ? new Date() : null },
      select: { id: true, username: true, customerId: true, linkVerifiedAt: true }
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: auth.userId,
        action: customerId ? 'CLIENT_ACCOUNT_LINKED' : 'CLIENT_ACCOUNT_UNLINKED',
        targetType: 'ClientAccount',
        targetId: accountId,
        detail: { customerId: customerId || account.customerId, previousCustomerId: account.customerId }
      }
    })

    return NextResponse.json({ account: updated })
  } catch (error) {
    console.error('Client account link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
