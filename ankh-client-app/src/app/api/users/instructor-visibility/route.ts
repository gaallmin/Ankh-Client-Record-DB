import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only'

function requireManager(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

// GET — return all instructors/managers with their isActive status
export async function GET(request: NextRequest) {
  const auth = requireManager(request)
  if ('error' in auth) return auth.error

  try {
    const instructors = await prisma.user.findMany({
      where: { role: { in: ['INSTRUCTOR', 'MANAGER'] } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    })
    return NextResponse.json({ instructors })
  } catch (error) {
    console.error('Error fetching instructor visibility:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — batch update isActive for multiple users
export async function PATCH(request: NextRequest) {
  const auth = requireManager(request)
  if ('error' in auth) return auth.error

  try {
    const { updates } = await request.json() as { updates: { id: string; isActive: boolean }[] }
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates array is required' }, { status: 400 })
    }

    await Promise.all(
      updates.map(({ id, isActive }) =>
        prisma.user.update({ where: { id }, data: { isActive } })
      )
    )

    return NextResponse.json({ success: true, updated: updates.length })
  } catch (error) {
    console.error('Error updating instructor visibility:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
