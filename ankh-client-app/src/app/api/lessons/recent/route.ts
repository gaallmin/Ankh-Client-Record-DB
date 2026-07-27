import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/lib/staffAuth'

export async function GET(request: NextRequest) {
  const auth = requireStaff(request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '8'), 20)

    const recentParticipants = await prisma.lessonParticipant.findMany({
      where: {
        customer: { deletedAt: null }
      },
      orderBy: {
        lesson: { createdAt: 'desc' }
      },
      take: limit,
      select: {
        id: true,
        customerSymptoms: true,
        customerImprovements: true,
        status: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        lesson: {
          select: {
            id: true,
            lessonType: true,
            lessonContent: true,
            createdAt: true,
            instructor: {
              select: { firstName: true, lastName: true }
            },
            location: {
              select: { name: true }
            }
          }
        }
      }
    })

    return NextResponse.json({ lessons: recentParticipants })
  } catch (error) {
    console.error('Error fetching recent lessons:', error)
    return NextResponse.json({ error: 'Failed to fetch recent lessons' }, { status: 500 })
  }
}
