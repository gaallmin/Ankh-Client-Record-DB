import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/lib/staffAuth'

// DELETE /api/unavailability-blocks/[blockId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
) {
  try {
    const auth = requireStaff(request)
    if ('error' in auth) return auth.error

    const { blockId } = await params
    if (!blockId) {
      return NextResponse.json({ error: 'Block ID is required' }, { status: 400 })
    }

    const existing = await prisma.unavailabilityBlock.findUnique({ where: { id: blockId } })
    if (!existing) {
      return NextResponse.json({ error: 'Unavailability block not found' }, { status: 404 })
    }
    if (auth.role === 'INSTRUCTOR' && existing.instructorId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.unavailabilityBlock.delete({ where: { id: blockId } })

    return NextResponse.json({ message: 'Unavailability block removed' })
  } catch (error) {
    console.error('Error deleting unavailability block:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
