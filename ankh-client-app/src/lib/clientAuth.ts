// Client-account authentication — a SEPARATE identity system from staff Users.
// Client JWTs carry aud:'client' and a clientAccountId claim, never a staff
// role, so a client token can never pass the staff routes' role checks and a
// staff token (no aud) never passes requireClient.

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'

const CLIENT_AUDIENCE = 'client'
export const CLIENT_SESSION_COOKIE = 'ankh-client-session'
const CLIENT_SESSION_SECONDS = 60 * 60 * 24 * 30

export function signClientToken(clientAccountId: string): string {
  return jwt.sign({ clientAccountId }, getJwtSecret(), { audience: CLIENT_AUDIENCE, expiresIn: CLIENT_SESSION_SECONDS })
}

export function setClientSession(response: NextResponse, clientAccountId: string): NextResponse {
  response.cookies.set({
    name: CLIENT_SESSION_COOKIE,
    value: signClientToken(clientAccountId),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CLIENT_SESSION_SECONDS,
  })
  return response
}

export function clearClientSession(response: NextResponse): NextResponse {
  response.cookies.set({
    name: CLIENT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return response
}

export function requireClient(request: NextRequest):
  | { clientAccountId: string }
  | { error: NextResponse } {
  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const token = request.cookies.get(CLIENT_SESSION_COOKIE)?.value || bearerToken
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { audience: CLIENT_AUDIENCE }) as { clientAccountId?: string }
    if (!decoded.clientAccountId) {
      return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
    }
    return { clientAccountId: decoded.clientAccountId }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}
