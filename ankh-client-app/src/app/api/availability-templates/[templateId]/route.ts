import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// PUT /api/availability-templates/[templateId] — manager only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { templateId } = await params
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const existing = await prisma.availabilityTemplate.findUnique({ where: { id: templateId } })
    if (!existing) {
      return NextResponse.json({ error: 'Availability template not found' }, { status: 404 })
    }

    const body = await request.json()
    const { dayOfWeek, startTime, endTime, slotMinutes } = body

    if (dayOfWeek !== undefined && (dayOfWeek < 0 || dayOfWeek > 6)) {
      return NextResponse.json({ error: 'dayOfWeek must be 0 (Mon) through 6 (Sun)' }, { status: 400 })
    }
    if (startTime !== undefined && !TIME_RE.test(startTime)) {
      return NextResponse.json({ error: 'startTime must be in HH:mm format' }, { status: 400 })
    }
    if (endTime !== undefined && !TIME_RE.test(endTime)) {
      return NextResponse.json({ error: 'endTime must be in HH:mm format' }, { status: 400 })
    }
    const nextStart = startTime ?? existing.startTime
    const nextEnd = endTime ?? existing.endTime
    if (nextStart >= nextEnd) {
      return NextResponse.json({ error: 'startTime must be before endTime' }, { status: 400 })
    }

    const template = await prisma.availabilityTemplate.update({
      where: { id: templateId },
      data: {
        ...(dayOfWeek !== undefined ? { dayOfWeek } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(slotMinutes !== undefined ? { slotMinutes } : {})
      }
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error updating availability template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/availability-templates/[templateId] — manager only, hard delete (a template row is just a schedule rule, not historical data)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { templateId } = await params
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const existing = await prisma.availabilityTemplate.findUnique({ where: { id: templateId } })
    if (!existing) {
      return NextResponse.json({ error: 'Availability template not found' }, { status: 404 })
    }

    await prisma.availabilityTemplate.delete({ where: { id: templateId } })

    return NextResponse.json({ message: 'Availability template deleted successfully' })
  } catch (error) {
    console.error('Error deleting availability template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
