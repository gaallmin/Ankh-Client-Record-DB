import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Maximum lessons returned in search results list.
// Full history is loaded on-demand when the customer detail modal opens.
const SEARCH_LESSON_PREVIEW_LIMIT = 5

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')
    const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') || '20', 10)))
    const skip = Math.max(0, parseInt(searchParams.get('skip') || '0', 10))

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name parameter is required' },
        { status: 400 }
      )
    }

    const where = {
      OR: [
        { firstName: { contains: name.trim(), mode: 'insensitive' as const } },
        { lastName:  { contains: name.trim(), mode: 'insensitive' as const } },
        { email:     { contains: name.trim(), mode: 'insensitive' as const } }
      ],
      deletedAt: null
    }

    // Run count + data fetch in parallel — halves DB round-trip time
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          company: true,
          createdAt: true,
          deletedAt: true,
          lessonParticipants: {
            // Cap at preview limit — full history loads in the detail modal
            take: SEARCH_LESSON_PREVIEW_LIMIT,
            orderBy: { lesson: { createdAt: 'desc' } },
            select: {
              id: true,
              customerSymptoms: true,
              customerImprovements: true,
              status: true,
              lesson: {
                select: {
                  id: true,
                  lessonType: true,
                  lessonContent: true,
                  createdAt: true,
                  instructor: {
                    select: { firstName: true, lastName: true }
                  }
                }
              }
            }
          }
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take,
        skip
      })
    ])

    return NextResponse.json({
      message: customers.length === 0 ? 'No customers found' : 'Customers found',
      customers,
      total
    })
  } catch (error) {
    console.error('Customer search error:', error)
    return NextResponse.json(
      { error: 'Internal server error during customer search' },
      { status: 500 }
    )
  }
}