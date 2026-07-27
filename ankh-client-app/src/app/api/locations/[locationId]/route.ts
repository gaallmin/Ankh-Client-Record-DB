import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'
import { prisma } from '@/lib/prisma'


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

// PUT /api/locations/[locationId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { locationId } = await params

    if (!locationId) {
      return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })
    }

    const { name } = await request.json()

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Location name is required' }, { status: 400 })
    }

    const locationExists = await prisma.location.findFirst({
      where: { id: locationId, deletedAt: null }
    })

    if (!locationExists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const nameConflict = await prisma.location.findFirst({
      where: { name: name.trim(), deletedAt: null, NOT: { id: locationId } }
    })

    if (nameConflict) {
      return NextResponse.json(
        { error: 'Location with this name already exists' },
        { status: 409 }
      )
    }

    const updatedLocation = await prisma.location.update({
      where: { id: locationId },
      data: { name: name.trim() },
      select: { id: true, name: true, createdAt: true }
    })

    return NextResponse.json({ location: updatedLocation })
  } catch (error) {
    console.error('Error updating location:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/locations/[locationId] — soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { locationId } = await params

    if (!locationId) {
      return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })
    }

    const locationExists = await prisma.location.findFirst({
      where: { id: locationId, deletedAt: null }
    })

    if (!locationExists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    await prisma.location.update({
      where: { id: locationId },
      data: { deletedAt: new Date() }
    })

    return NextResponse.json({ message: 'Location deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('Error deleting location:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
