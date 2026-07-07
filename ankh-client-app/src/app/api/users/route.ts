import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { username, password, role, firstName, lastName, email } = await request.json()

    // Validate input
    if (!username || !password || !role || !firstName || !email) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Validate role
    if (!['MANAGER', 'INSTRUCTOR'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be MANAGER or INSTRUCTOR' },
        { status: 400 }
      )
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      )
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email }
    })

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role as 'MANAGER' | 'INSTRUCTOR',
        firstName,
        lastName,
        email
      },
      select: {
        id: true,
        username: true,
        role: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      message: 'User created successfully',
      user: newUser
    }, { status: 201 })

  } catch (error) {
    console.error('User creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error during user creation' },
      { status: 500 }
    )
  }
}

// GET route to fetch all users (for management purposes)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
  const role = searchParams.get('role');

    const users = await prisma.user.findMany({
      where: search
        ? role
          ? {
              role: role as 'MANAGER' | 'INSTRUCTOR',
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
              ]
            }
          : {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        : role
          ? { role: role as 'MANAGER' | 'INSTRUCTOR' }
          : {},
      select: {
        id: true,
        username: true,
        role: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
        lessons: {
          include: {
            lessonParticipants: {
              include: {
                customer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching users' },
      { status: 500 }
    );
  }
}
