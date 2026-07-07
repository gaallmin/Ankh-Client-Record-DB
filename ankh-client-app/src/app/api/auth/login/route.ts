import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
// 🔑 NEW: Retrieve your secret key from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only'; 

export async function POST(request: NextRequest) {
  try {
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
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' })

    // Return user data (excluding password)
    const { password: _, ...userData } = user
    
    return NextResponse.json({
      message: 'Login successful',
      user: userData,
      token
    }, { status: 200 })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    )
  }
}
