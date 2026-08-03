import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { POST as clientLogin } from '@/app/api/client/auth/login/route'
import { PUT as updateClientReservation } from '@/app/api/client/reservations/[reservationId]/route'

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === '1' && !!process.env.TEST_DATABASE_URL
const describeDb = enabled ? describe : describe.skip

describeDb('reservation authorization and database concurrency', () => {
  const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
  const suffix = randomUUID()
  const ids = {
    instructor: `test-instructor-${suffix}`,
    customerA: `test-customer-a-${suffix}`,
    customerB: `test-customer-b-${suffix}`,
    accountA: `test-account-a-${suffix}`,
    accountB: `test-account-b-${suffix}`,
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret-that-is-longer-than-thirty-two-characters'
    const password = await bcrypt.hash('integration-password', 4)
    await prisma.user.create({
      data: {
        id: ids.instructor,
        username: `integration-${suffix}`,
        email: `integration-${suffix}@example.invalid`,
        password,
        role: 'INSTRUCTOR',
        firstName: 'Integration',
        lastName: 'Instructor',
      },
    })
    await prisma.customer.createMany({
      data: [
        { id: ids.customerA, firstName: 'Client', lastName: 'A', email: `client-a-${suffix}@example.invalid` },
        { id: ids.customerB, firstName: 'Client', lastName: 'B', email: `client-b-${suffix}@example.invalid` },
      ],
    })
    await prisma.clientAccount.createMany({
      data: [
        { id: ids.accountA, username: `client-a-${suffix}`, password, customerId: ids.customerA, linkVerifiedAt: new Date() },
        { id: ids.accountB, username: `client-b-${suffix}`, password, customerId: ids.customerB, linkVerifiedAt: new Date() },
      ],
    })
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { customerId: { in: [ids.customerA, ids.customerB] } } })
    await prisma.reservation.deleteMany({ where: { customerId: { in: [ids.customerA, ids.customerB] } } })
    await prisma.clientAccount.deleteMany({ where: { id: { in: [ids.accountA, ids.accountB] } } })
    await prisma.customer.deleteMany({ where: { id: { in: [ids.customerA, ids.customerB] } } })
    await prisma.user.delete({ where: { id: ids.instructor } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('allows only one of two concurrent overlapping confirmations', async () => {
    const startsAt = new Date('2030-01-02T09:00:00.000Z')
    const attempts = await Promise.allSettled([
      prisma.reservation.create({
        data: { customerId: ids.customerA, instructorId: ids.instructor, scheduledAt: startsAt, durationMinutes: 60, status: 'CONFIRMED', source: 'MANAGER' },
      }),
      prisma.reservation.create({
        data: { customerId: ids.customerB, instructorId: ids.instructor, scheduledAt: new Date('2030-01-02T09:30:00.000Z'), durationMinutes: 30, status: 'CONFIRMED', source: 'MANAGER' },
      }),
    ])
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
  })

  it('allows adjacent half-open intervals', async () => {
    const day = new Date('2030-01-03T09:00:00.000Z')
    const first = await prisma.reservation.create({
      data: { customerId: ids.customerA, instructorId: ids.instructor, scheduledAt: day, durationMinutes: 30, status: 'CONFIRMED', source: 'MANAGER' },
    })
    const second = await prisma.reservation.create({
      data: { customerId: ids.customerB, instructorId: ids.instructor, scheduledAt: new Date('2030-01-03T09:30:00.000Z'), durationMinutes: 30, status: 'CONFIRMED', source: 'MANAGER' },
    })
    expect(first.id).not.toBe(second.id)
  })

  it('authenticates with an HttpOnly cookie and hides another client reservation', async () => {
    const otherReservation = await prisma.reservation.create({
      data: {
        customerId: ids.customerB,
        scheduledAt: new Date('2030-01-04T09:00:00.000Z'),
        durationMinutes: 30,
        status: 'PENDING',
        source: 'CLIENT',
      },
    })
    const loginRequest = new NextRequest('http://localhost/api/client/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `client-a-${suffix}`, password: 'integration-password' }),
    })
    const loginResponse = await clientLogin(loginRequest)
    expect(loginResponse.status).toBe(200)
    const loginBody = await loginResponse.clone().json() as Record<string, unknown>
    expect(loginBody).not.toHaveProperty('token')
    const cookie = (loginResponse.headers.get('set-cookie') || '').split(';')[0]

    const cancelRequest = new NextRequest(`http://localhost/api/client/reservations/${otherReservation.id}`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    const cancelResponse = await updateClientReservation(cancelRequest, {
      params: Promise.resolve({ reservationId: otherReservation.id }),
    })
    expect(cancelResponse.status).toBe(404)
    const unchanged = await prisma.reservation.findUniqueOrThrow({ where: { id: otherReservation.id } })
    expect(unchanged.status).toBe('PENDING')
  })
})
