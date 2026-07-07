import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Shared lightweight customer select - only what the list view needs.
// Full lesson history is loaded on-demand via the customer detail endpoint.
const CUSTOMER_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  company: true,
  createdAt: true,
  deletedAt: true,
  lessonParticipants: {
    take: 1, // Only the most recent lesson for the list view
    orderBy: {
      lesson: { createdAt: 'desc' as const }
    },
    select: {
      id: true,
      status: true,
      lesson: {
        select: {
          id: true,
          lessonType: true,
          createdAt: true,
          instructor: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  }
} as const

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1',  10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const skip  = (page - 1) * limit

    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName:  { contains: search, mode: 'insensitive' as const } },
            { email:     { contains: search, mode: 'insensitive' as const } }
          ],
          deletedAt: null
        }
      : { deletedAt: null }

    // Run count + data fetch in parallel — cuts latency roughly in half
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        select: CUSTOMER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      })
    ])

    return NextResponse.json(
      { customers, total, page, limit, totalPages: Math.ceil(total / limit) },
      {
        headers: {
          // Allow browsers/CDN to serve a slightly stale list for 10s
          // while revalidating in the background — makes navigation instant.
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'
        }
      }
    )
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Internal server error while fetching customers' },
      { status: 500 }
    ) 
  }
}