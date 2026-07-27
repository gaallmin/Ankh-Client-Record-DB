import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { setClientSession } from '@/lib/clientAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const RegisterSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._@-]+$/),
  password: z.string().min(8).max(200),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email().optional()
})

// POST /api/client/auth/register — public, rate-limited.
// Creates an UNLINKED client account. Linking to an existing Customer record is
// a separate, staff-confirmed step (never automatic) so ambiguous matches are
// impossible and no duplicate Customer rows are ever created here.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`register:${clientIp(request)}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const parsed = RegisterSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }
    const { username, password, phone, email } = parsed.data

    const existing = await prisma.clientAccount.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 12)
    const account = await prisma.clientAccount.create({
      data: { username, password: hashed, phone: phone || null, email: email || null },
      select: { id: true, username: true, customerId: true }
    })

    await prisma.auditLog.create({
      data: {
        actorType: 'CLIENT', actorId: account.id,
        action: 'CLIENT_ACCOUNT_CREATED', targetType: 'ClientAccount', targetId: account.id,
        detail: { username }
      }
    })

    return setClientSession(NextResponse.json({ account }, { status: 201 }), account.id)
  } catch (error) {
    console.error('Client register error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
