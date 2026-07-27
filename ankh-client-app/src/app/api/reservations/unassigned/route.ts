import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'
import { prisma } from '@/lib/prisma'


const requireManager = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { role?: string }
    if (decoded.role !== 'MANAGER') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

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
