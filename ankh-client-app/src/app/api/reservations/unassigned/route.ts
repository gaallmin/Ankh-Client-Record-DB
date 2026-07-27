import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

// GET /api/reservations/unassigned — the "unassigned queue": requests with no instructor
// picked yet. Manager-only, matches the Ops Schedule manager view's sidebar.
export async function GET(request: NextRequest) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const reservations = await prisma.reservation.findMany({
      where: { instructorId: null, status: 'PENDING' },
      select: {
        id: true,
        scheduledAt: true,
        source: true,
        notes: true,
        createdAt: true,
        customer: { select: { id: true, firstName: true, lastName: true, company: true } }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json({ reservations })
  } catch (error) {
    console.error('Error fetching unassigned reservations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
