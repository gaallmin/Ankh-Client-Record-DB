import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json(
        { error: 'Name parameter is required' },
        { status: 400 }
      )
    }

    const instructors = await prisma.user.findMany({
      where: {
        role: 'INSTRUCTOR',
        OR: [
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } },
          { email: { contains: name, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        lessons: {
          select: {
            id: true,
            lessonType: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5
        }
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' }
      ]
    })

    if (instructors.length === 0) {
      return NextResponse.json({
        message: 'No instructors found',
        instructors: []
      })
    }

    return NextResponse.json({
      message: 'Instructors found',
      instructors
    })

  } catch (error) {
    console.error('Instructor search error:', error)
    return NextResponse.json(
      { error: 'Internal server error during instructor search' },
      { status: 500 }
    )
  }
}
