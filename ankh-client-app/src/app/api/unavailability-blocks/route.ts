import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/lib/staffAuth'

const VALID_CATEGORIES = ['BUSINESS_TRIP', 'TRAINING', 'OTHER']

// GET /api/unavailability-blocks?instructorId=...&customerId=...
export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const instructorId = searchParams.get('instructorId')
    const customerId = searchParams.get('customerId')
    const scopedInstructorId = auth.role === 'INSTRUCTOR' ? auth.userId : instructorId || undefined

    const blocks = await prisma.unavailabilityBlock.findMany({
      where: {
        ...(scopedInstructorId ? { instructorId: scopedInstructorId } : {}),
        ...(customerId ? { customerId } : {})
      },
      orderBy: { startDate: 'asc' }
    })

    return NextResponse.json({ blocks })
  } catch (error) {
    console.error('Error fetching unavailability blocks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/unavailability-blocks — exactly one of customerId / instructorId must be set.
// Instructors may only block their own time; managers may block anyone's.
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const body = await request.json()
    const { customerId, instructorId, startDate, endDate, category, notes } = body

    if (!!customerId === !!instructorId) {
      return NextResponse.json({ error: 'Exactly one of customerId or instructorId is required' }, { status: 400 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
    }
    if (auth.role === 'INSTRUCTOR' && (customerId || instructorId !== auth.userId)) {
      return NextResponse.json({ error: 'Instructors may only block their own time' }, { status: 403 })
    }

    const parsedStart = new Date(startDate)
    const parsedEnd = new Date(endDate)
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedStart > parsedEnd) {
      return NextResponse.json({ error: 'startDate must be a valid date on or before endDate' }, { status: 400 })
    }

    const block = await prisma.unavailabilityBlock.create({
      data: {
        customerId: customerId || null,
        instructorId: instructorId || null,
        startDate: parsedStart,
        endDate: parsedEnd,
        category,
        notes: notes || null
      }
    })

    return NextResponse.json({ block }, { status: 201 })
  } catch (error) {
    console.error('Error creating unavailability block:', error)
    if (error instanceof Error && error.message.includes('Foreign key constraint failed')) {
      return NextResponse.json({ error: 'Invalid customerId or instructorId' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
