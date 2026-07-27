import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/lib/staffAuth'

export async function GET(request: NextRequest) {
  const auth = requireStaff(request)
  if ('error' in auth) return auth.error

  try {
    const instructors = await prisma.user.findMany({
      where: { role: 'INSTRUCTOR', isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    })

    return NextResponse.json(
      { results: instructors },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    )
  } catch (error) {
    console.error('Error fetching instructors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch instructors', results: [] },
      { status: 500 }
    )
  }
}
