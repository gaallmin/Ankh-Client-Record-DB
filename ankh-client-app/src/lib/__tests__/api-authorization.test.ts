import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { STAFF_SESSION_COOKIE } from '@/lib/staffAuth'
import { GET as getUsers, POST as createUser } from '@/app/api/users/route'
import { GET as getCustomers } from '@/app/api/customers/route'
import { GET as searchCustomers } from '@/app/api/customers/search/route'
import { GET as getCustomer } from '@/app/api/customers/[customerId]/route'
import { GET as exportCsv } from '@/app/api/export-csv/route'
import { GET as databaseHealth } from '@/app/api/health/db/route'
import { POST as startImport } from '@/app/api/import/start/route'
import { POST as legacyImport } from '@/app/api/import-csv/route'
import { GET as importStatus } from '@/app/api/import/status/[jobId]/route'
import { GET as instructorLessons } from '@/app/api/instructors/[instructorId]/lessons/route'
import { GET as searchInstructors } from '@/app/api/instructors/search/route'
import { POST as createLesson } from '@/app/api/lessons/new/route'
import { GET as recentLessons } from '@/app/api/lessons/recent/route'
import { GET as searchLessons } from '@/app/api/lessons/search/route'
import { GET as listInstructors } from '@/app/api/users/instructors/route'
import { GET as getSettings } from '@/app/api/settings/route'
import { GET as getLocations } from '@/app/api/locations/route'

const request = (path: string, method = 'GET') => new NextRequest(`https://staging.example.test${path}`, { method })

function instructorRequest(path: string, method = 'GET') {
  const secret = 'api-authorization-test-secret-longer-than-thirty-two-characters'
  process.env.JWT_SECRET = secret
  const token = jwt.sign({ userId: 'instructor-1', role: 'INSTRUCTOR' }, secret, { audience: 'staff' })
  return new NextRequest(`https://staging.example.test${path}`, {
    method,
    headers: { cookie: `${STAFF_SESSION_COOKIE}=${token}` },
  })
}

const protectedRoutes: Array<{ name: string; invoke: () => Promise<Response> }> = [
  { name: 'GET /api/users', invoke: () => getUsers(request('/api/users')) },
  { name: 'POST /api/users', invoke: () => createUser(request('/api/users', 'POST')) },
  { name: 'GET /api/customers', invoke: () => getCustomers(request('/api/customers')) },
  { name: 'GET /api/customers/search', invoke: () => searchCustomers(request('/api/customers/search?name=a')) },
  {
    name: 'GET /api/customers/:id',
    invoke: () => getCustomer(request('/api/customers/customer-1'), {
      params: Promise.resolve({ customerId: 'customer-1' }),
    }),
  },
  { name: 'GET /api/export-csv', invoke: () => exportCsv(request('/api/export-csv')) },
  { name: 'GET /api/health/db', invoke: () => databaseHealth(request('/api/health/db')) },
  { name: 'POST /api/import/start', invoke: () => startImport(request('/api/import/start', 'POST')) },
  { name: 'POST /api/import-csv', invoke: () => legacyImport(request('/api/import-csv', 'POST')) },
  {
    name: 'GET /api/import/status/:id',
    invoke: () => importStatus(request('/api/import/status/job-1'), { params: Promise.resolve({ jobId: 'job-1' }) }),
  },
  {
    name: 'GET /api/instructors/:id/lessons',
    invoke: () => instructorLessons(request('/api/instructors/instructor-1/lessons'), {
      params: Promise.resolve({ instructorId: 'instructor-1' }),
    }),
  },
  { name: 'GET /api/instructors/search', invoke: () => searchInstructors(request('/api/instructors/search?name=a')) },
  { name: 'POST /api/lessons/new', invoke: () => createLesson(request('/api/lessons/new', 'POST')) },
  { name: 'GET /api/lessons/recent', invoke: () => recentLessons(request('/api/lessons/recent')) },
  { name: 'GET /api/lessons/search', invoke: () => searchLessons(request('/api/lessons/search?location=a')) },
  { name: 'GET /api/users/instructors', invoke: () => listInstructors(request('/api/users/instructors')) },
  { name: 'GET /api/settings', invoke: () => getSettings(request('/api/settings')) },
  { name: 'GET /api/locations', invoke: () => getLocations(request('/api/locations')) },
]

describe('legacy staff API authorization', () => {
  it.each(protectedRoutes)('rejects anonymous access to $name before reading input or querying data', async ({ invoke }) => {
    const response = await invoke()
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  it.each([
    { name: 'GET /api/users', invoke: () => getUsers(instructorRequest('/api/users')) },
    { name: 'POST /api/users', invoke: () => createUser(instructorRequest('/api/users', 'POST')) },
    { name: 'GET /api/health/db', invoke: () => databaseHealth(instructorRequest('/api/health/db')) },
    { name: 'POST /api/import/start', invoke: () => startImport(instructorRequest('/api/import/start', 'POST')) },
    { name: 'POST /api/import-csv', invoke: () => legacyImport(instructorRequest('/api/import-csv', 'POST')) },
    {
      name: 'GET /api/import/status/:id',
      invoke: () => importStatus(instructorRequest('/api/import/status/job-1'), {
        params: Promise.resolve({ jobId: 'job-1' }),
      }),
    },
  ])('rejects instructor access to manager-only route $name', async ({ invoke }) => {
    const response = await invoke()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'Forbidden' })
  })
})
