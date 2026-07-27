import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import {
  CLIENT_SESSION_COOKIE,
  requireClient,
  setClientSession,
  signClientToken,
} from '../clientAuth'
import { getJwtSecret } from '../jwtSecret'
import {
  STAFF_SESSION_COOKIE,
  requireManager,
  requireStaff,
  setStaffSessionCookie,
} from '../staffAuth'

const ORIGINAL_SECRET = process.env.JWT_SECRET
const TEST_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters-long'

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = ORIGINAL_SECRET
})

describe('fail-closed JWT configuration', () => {
  it('rejects missing, short, and placeholder secrets', () => {
    delete process.env.JWT_SECRET
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/)
    process.env.JWT_SECRET = 'short'
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/)
    process.env.JWT_SECRET = 'your_fallback_secret_for_dev_only'
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/)
  })

  it('accepts a strong configured secret', () => {
    process.env.JWT_SECRET = TEST_SECRET
    expect(getJwtSecret()).toBe(TEST_SECRET)
  })
})

describe('client session isolation', () => {
  it('authenticates from an HttpOnly cookie without exposing the token in JSON', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const response = setClientSession(NextResponse.json({ account: { id: 'client-1' } }), 'client-1')
    const setCookie = response.headers.get('set-cookie') || ''
    expect(setCookie).toContain(`${CLIENT_SESSION_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=strict')

    const cookie = setCookie.split(';')[0]
    const request = new NextRequest('http://localhost/api/client/me', { headers: { cookie } })
    expect(requireClient(request)).toEqual({ clientAccountId: 'client-1' })
  })

  it('rejects a staff JWT because it does not have the client audience', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const staffToken = jwt.sign({ userId: 'staff-1', role: 'MANAGER' }, TEST_SECRET)
    const request = new NextRequest('http://localhost/api/client/me', {
      headers: { authorization: `Bearer ${staffToken}` },
    })
    expect(requireClient(request)).toHaveProperty('error')
  })

  it('signs client tokens with the required audience', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const decoded = jwt.verify(signClientToken('client-2'), TEST_SECRET, { audience: 'client' }) as { clientAccountId: string }
    expect(decoded.clientAccountId).toBe('client-2')
  })
})

describe('staff HttpOnly sessions', () => {
  it('authenticates a staff JWT from a protected cookie', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const token = jwt.sign(
      { userId: 'staff-1', username: 'manager', role: 'MANAGER' },
      TEST_SECRET,
      { audience: 'staff', expiresIn: '1d' },
    )
    const response = NextResponse.json({ user: { id: 'staff-1' } })
    setStaffSessionCookie(response, token)

    const setCookie = response.headers.get('set-cookie') || ''
    expect(setCookie).toContain(`${STAFF_SESSION_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=strict')

    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: { cookie: setCookie.split(';')[0] },
    })
    expect(requireStaff(request)).toMatchObject({
      ok: true,
      userId: 'staff-1',
      username: 'manager',
      role: 'MANAGER',
    })
  })

  it('enforces manager-only access', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const token = jwt.sign(
      { userId: 'staff-2', role: 'INSTRUCTOR' },
      TEST_SECRET,
      { audience: 'staff' },
    )
    const request = new NextRequest('http://localhost/api/settings', {
      headers: { cookie: `${STAFF_SESSION_COOKIE}=${token}` },
    })
    const result = requireManager(request)
    expect(result).toHaveProperty('error')
    if ('error' in result) expect(result.error.status).toBe(403)
  })

  it('rejects a client JWT because it does not have the staff audience', () => {
    process.env.JWT_SECRET = TEST_SECRET
    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: { cookie: `${STAFF_SESSION_COOKIE}=${signClientToken('client-3')}` },
    })
    const result = requireStaff(request)
    expect(result).toHaveProperty('error')
    if ('error' in result) expect(result.error.status).toBe(401)
  })
})
