import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only'

const requireAuth = (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER' && decoded.role !== 'INSTRUCTOR') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true, role: decoded.role }
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
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; customerId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if ('error' in auth) return auth.error

    const { lessonId, customerId } = await params

    if (!lessonId || !customerId) {
      return NextResponse.json(
        { error: 'Lesson ID and Customer ID are required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { customerSymptoms, customerImprovements, status } = body

    const updatedParticipant = await prisma.lessonParticipant.update({
      where: {
        customerId_lessonId: {
          customerId: customerId,
          lessonId: lessonId
        }
      },
      data: {
        ...(customerSymptoms !== undefined ? { customerSymptoms } : {}),
        ...(customerImprovements !== undefined ? { customerImprovements } : {}),
        ...(status !== undefined ? { status } : {})
      }
    })

    return NextResponse.json({ participant: updatedParticipant }, { status: 200 })

  } catch (error) {
    console.error('Lesson participant update error:', error)

    if (error instanceof Error && error.message.includes('Record to update does not exist')) {
      return NextResponse.json(
        { error: 'Lesson participant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error during lesson participant update' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; customerId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { lessonId, customerId } = await params

    if (!lessonId || !customerId) {
      return NextResponse.json(
        { error: 'Lesson ID and Customer ID are required' },
        { status: 400 }
      )
    }

    // Delete lesson participant record
    await prisma.lessonParticipant.delete({
      where: {
        customerId_lessonId: {
          customerId: customerId,
          lessonId: lessonId
        }
      }
    })

    return NextResponse.json(
      { message: 'Lesson participant deleted successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Lesson participant deletion error:', error)

    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json(
        { error: 'Lesson participant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error during lesson participant deletion' },
      { status: 500 }
    )
  }
}
