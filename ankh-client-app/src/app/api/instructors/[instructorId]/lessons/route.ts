import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/instructors/[instructorId]/lessons
// Returns all lessons taught by a specific instructor (as primary or additional instructor).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instructorId: string }> }
) {
  try {
    const { instructorId } = await params

    if (!instructorId) {
      return NextResponse.json({ error: 'Instructor ID is required' }, { status: 400 })
    }

    const instructor = await prisma.user.findUnique({
      where: { id: instructorId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true }
    })

    if (!instructor) {
      return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        OR: [
          { instructorId },
          { additionalInstructors: { some: { userId: instructorId } } }
        ]
      },
      select: {
        id: true,
        lessonType: true,
        lessonContent: true,
        groupParticipantCount: true,
        groupCompany: true,
        createdAt: true,
        location: { select: { name: true } },
        lessonParticipants: {
          where: { customer: { deletedAt: null } },
          select: {
            id: true,
            customerSymptoms: true,
            customerImprovements: true,
            status: true,
            customer: {
              select: { id: true, firstName: true, lastName: true, company: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ instructor, lessons })
  } catch (error) {
    console.error('Error fetching instructor lessons:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
