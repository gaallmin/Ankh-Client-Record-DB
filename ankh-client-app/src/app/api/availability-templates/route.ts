import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'
import { prisma } from '@/lib/prisma'


const requireStaff = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string; role?: string }
    if (decoded.role !== 'MANAGER' && decoded.role !== 'INSTRUCTOR') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true, userId: decoded.userId, role: decoded.role }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

const requireManager = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { role?: string }
    if (decoded.role !== 'MANAGER') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validateTemplateBody(body: { instructorId?: string; dayOfWeek?: number; startTime?: string; endTime?: string; slotMinutes?: number }) {
  const { instructorId, dayOfWeek, startTime, endTime, slotMinutes } = body
  if (!instructorId) return 'instructorId is required'
  if (dayOfWeek === undefined || dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) return 'dayOfWeek must be 0 (Mon) through 6 (Sun)'
  if (!startTime || !TIME_RE.test(startTime)) return 'startTime must be in HH:mm format'
  if (!endTime || !TIME_RE.test(endTime)) return 'endTime must be in HH:mm format'
  if (startTime >= endTime) return 'startTime must be before endTime'
  if (slotMinutes !== undefined && slotMinutes !== null && slotMinutes < 5) return 'slotMinutes must be at least 5'
  return null
}

// GET /api/availability-templates?instructorId=...
// MANAGER: sees all, or filtered by instructorId. INSTRUCTOR: always scoped to self.
export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const instructorIdFilter = searchParams.get('instructorId')
    const scopedInstructorId = auth.role === 'INSTRUCTOR' ? auth.userId : instructorIdFilter || undefined

    const templates = await prisma.availabilityTemplate.findMany({
      where: scopedInstructorId ? { instructorId: scopedInstructorId } : {},
      orderBy: [{ instructorId: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }]
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching availability templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/availability-templates — manager only
export async function POST(request: NextRequest) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const body = await request.json()
    const validationError = validateTemplateBody(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const template = await prisma.availabilityTemplate.create({
      data: {
        instructorId: body.instructorId,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        slotMinutes: body.slotMinutes ?? 60
      }
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Error creating availability template:', error)
    if (error instanceof Error && error.message.includes('Foreign key constraint failed')) {
      return NextResponse.json({ error: 'Invalid instructorId' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
