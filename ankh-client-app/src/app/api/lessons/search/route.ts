import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {

    const { searchParams } = new URL(request.url)
    const location = searchParams.get('location')
    const take = parseInt(searchParams.get('take') || '20', 10) // default 20
    const skip = parseInt(searchParams.get('skip') || '0', 10) // default 0

    if (!location) {
      return NextResponse.json(
        { error: 'Location parameter is required' },
        { status: 400 }
      )
    }

    // Search for lessons by location name with pagination
    const lessons = await prisma.lesson.findMany({
      where: {
        location: {
          name: {
            contains: location,
            mode: 'insensitive'
          }
        }
      },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        location: {
          select: {
            id: true,
            name: true
          }
        },
        lessonParticipants: {
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        id: 'desc'
      },
      take,
      skip
    })

    return NextResponse.json({
      message: lessons.length === 0 ? 'No lessons found at this location' : 'Lessons found',
      lessons
    })

  } catch (error) {
    console.error('Lesson search error:', error)
    return NextResponse.json(
      { error: 'Internal server error during lesson search' },
      { status: 500 }
    )
  }
}
