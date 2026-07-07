import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only'

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

// GET /api/customers/[customerId]
// Returns the full customer record including ALL lesson history.
// This is intentionally the "expensive" endpoint — it's only called when
// the user opens the customer detail modal, not on every list render.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deletedAt: null },
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
          // Full history — ordered newest first
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
                },
                location: {
                  select: { name: true }
                }
              }
            }
          }
        }
      }
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    return NextResponse.json({ customer })
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/customers/[customerId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { customerId } = await params

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { firstName, lastName, email, phone, company } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'First name and last name are required' },
        { status: 400 }
      )
    }

    const customerExists = await prisma.customer.findUnique({
      where: { id: customerId, deletedAt: null }
    })

    if (!customerExists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: { firstName, lastName, email: email?.trim() || null, phone: phone || null, company: company || null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        company: true,
        createdAt: true,
        deletedAt: true
      }
    })

    return NextResponse.json({ customer: updatedCustomer })
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/customers/[customerId]  — soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const auth = requireManager(request)
    if ('error' in auth) return auth.error

    const { customerId } = await params

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 })
    }

    const customerExists = await prisma.customer.findUnique({
      where: { id: customerId, deletedAt: null }
    })

    if (!customerExists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { deletedAt: new Date() }
    })

    return NextResponse.json({ message: 'Customer deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } 
}