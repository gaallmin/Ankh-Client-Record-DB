import { NextRequest, NextResponse } from 'next/server'
import { clearStaffSessionCookie, requireStaff } from '@/lib/staffAuth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = requireStaff(request)
  if ('error' in auth) return auth.error

  const user = await prisma.user.findFirst({
    where: { id: auth.userId, isActive: true },
    select: {
      id: true,
      username: true,
      role: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  })

  if (!user) {
    const response = NextResponse.json({ error: 'Session user is inactive or missing' }, { status: 401 })
    clearStaffSessionCookie(response)
    return response
  }

  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } })
}
