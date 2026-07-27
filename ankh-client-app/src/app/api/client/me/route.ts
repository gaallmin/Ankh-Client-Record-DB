import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClient } from '@/lib/clientAuth'

// GET /api/client/me — the client's own profile + linked customer's lesson info.
// Strictly scoped: a client only ever sees the Customer row their account is
// linked to. Lesson info exposed = lesson history summary (this database has no
// credit/package/expiration fields — documented assumption, nothing invented).
export async function GET(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const account = await prisma.clientAccount.findUnique({
      where: { id: auth.clientAccountId },
      select: {
        id: true, username: true, phone: true, email: true,
        customerId: true, linkVerifiedAt: true,
        notifyByPush: true,
        customer: {
          select: {
            id: true, firstName: true, lastName: true, company: true,
            lessonParticipants: {
              orderBy: { lesson: { createdAt: 'desc' } },
              take: 10,
              select: {
                id: true, status: true,
                lesson: {
                  select: {
                    id: true, lessonType: true, createdAt: true,
                    instructor: { select: { firstName: true, lastName: true } },
                    location: { select: { name: true } }
                  }
                }
              }
            }
          }
        }
      }
    })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    return NextResponse.json({ account })
  } catch (error) {
    console.error('Client me error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/client/me — notification preferences only (opt-in/out).
export async function PUT(request: NextRequest) {
  try {
    const auth = requireClient(request)
    if ('error' in auth) return auth.error

    const { notifyByPush } = await request.json()
    const account = await prisma.clientAccount.update({
      where: { id: auth.clientAccountId },
      data: {
        ...(typeof notifyByPush === 'boolean' ? { notifyByPush } : {})
      },
      select: { id: true, notifyByPush: true }
    })
    return NextResponse.json({ account })
  } catch (error) {
    console.error('Client me update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
