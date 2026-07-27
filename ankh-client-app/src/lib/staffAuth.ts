import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { getJwtSecret } from '@/lib/jwtSecret'

export const STAFF_SESSION_COOKIE = 'ankh-staff-session'
export const STAFF_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export type StaffRole = 'MANAGER' | 'INSTRUCTOR'
export type StaffSession = {
  userId: string
  username?: string
  role: StaffRole
}

type StaffAuthResult =
  | ({ ok: true } & StaffSession)
  | { error: NextResponse }

function bearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  return token && token !== 'undefined' && token !== 'null' ? token : null
}

export function staffSessionToken(request: NextRequest): string | null {
  return request.cookies.get(STAFF_SESSION_COOKIE)?.value || bearerToken(request)
}

export function requireStaff(
  request: NextRequest,
  allowedRoles: readonly StaffRole[] = ['MANAGER', 'INSTRUCTOR']
): StaffAuthResult {
  const token = staffSessionToken(request)
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { audience: 'staff' }) as Partial<StaffSession>
    if (!decoded.userId || !decoded.role || !allowedRoles.includes(decoded.role)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return {
      ok: true,
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  }
}

export function requireManager(request: NextRequest): StaffAuthResult {
  return requireStaff(request, ['MANAGER'])
}

export function setStaffSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: STAFF_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  })
}

export function clearStaffSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: STAFF_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}
