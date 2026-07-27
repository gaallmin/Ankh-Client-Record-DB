import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import { getJwtSecret } from '@/lib/jwtSecret'
import { setStaffSessionCookie } from '@/lib/staffAuth'
import { clientIp, rateLimit } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`staff-login:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const { username, password } = await request.json()

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Find user by username or email (instructors imported from Excel have auto-generated usernames)
    const user = await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ username }, { email: username }]
      },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
        email: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Compare password first, then sign token
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    const payload = { userId: user.id, username: user.username, role: user.role }
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '1d', audience: 'staff' })

    // Return user data (excluding password)
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    }
    
    const response = NextResponse.json({
      message: 'Login successful',
      user: userData,
    }, { status: 200 })
    setStaffSessionCookie(response, token)
    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    )
  }
}
