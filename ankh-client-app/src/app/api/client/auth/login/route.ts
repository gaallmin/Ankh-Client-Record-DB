import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { setClientSession } from '@/lib/clientAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// POST /api/client/auth/login — public, rate-limited.
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`clogin:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const { username, password } = await request.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const account = await prisma.clientAccount.findUnique({ where: { username } })
    if (!account || !account.isActive) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }
    const valid = await bcrypt.compare(password, account.password)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    return setClientSession(NextResponse.json({
      account: { id: account.id, username: account.username, customerId: account.customerId }
    }), account.id)
  } catch (error) {
    console.error('Client login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
