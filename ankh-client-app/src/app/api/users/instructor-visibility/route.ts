import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

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
