import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { GET as getCustomer } from '@/app/api/customers/[customerId]/route'
import { prisma } from '@/lib/prisma'
import { STAFF_SESSION_COOKIE } from '@/lib/staffAuth'

describe('staff web-data search access', () => {
  it('allows an authenticated instructor to load a customer lesson-history detail', async () => {
    const secret = 'staff-search-access-test-secret-longer-than-thirty-two-characters'
    process.env.JWT_SECRET = secret
    const token = jwt.sign({ userId: 'instructor-1', role: 'INSTRUCTOR' }, secret, { audience: 'staff' })
    const request = new NextRequest('https://staging.example.test/api/customers/customer-1', {
      headers: { cookie: `${STAFF_SESSION_COOKIE}=${token}` },
    })
    const customer = {
      id: 'customer-1',
      firstName: 'Test',
      lastName: 'Customer',
      email: null,
      phone: null,
      company: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      lessonParticipants: [],
    }
    const findCustomer = vi.spyOn(prisma.customer, 'findUnique').mockResolvedValue(customer as never)

    try {
      const response = await getCustomer(request, {
        params: Promise.resolve({ customerId: 'customer-1' }),
      })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        customer: { id: 'customer-1', firstName: 'Test', lastName: 'Customer' },
      })
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    } finally {
      findCustomer.mockRestore()
    }
  })
})
