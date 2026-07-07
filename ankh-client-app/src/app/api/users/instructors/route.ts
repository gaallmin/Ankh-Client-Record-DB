import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  try {
    const instructors = await prisma.user.findMany({
      where: { role: { in: ['INSTRUCTOR', 'MANAGER'] }, isActive: true },
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to fetch instructors', details: errorMessage, results: [] },
      { status: 500 }
    )
  }
}