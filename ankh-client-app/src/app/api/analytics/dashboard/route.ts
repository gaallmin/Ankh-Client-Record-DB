import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'
import {
  analyticsDateRange,
  fillMonthlyMetrics,
  parseAnalyticsMonths,
  percentage,
  type MonthlyMetric,
} from '@/lib/analytics'
import { DEFAULT_BUSINESS_TZ } from '@/lib/slots'

type CustomerMetricRow = {
  customerId: string
  firstName: string
  lastName: string
  company: string | null
  attended: number
  cancelled: number
  noShows: number
  matchingCustomerCount: number
}

type InstructorRebookingRow = {
  instructorId: string
  instructorFirstName: string
  instructorLastName: string
  customerId: string
  customerFirstName: string
  customerLastName: string
  lessonCount: number
  firstLessonAt: Date
  latestLessonAt: Date
}

const finalizedEventsSql = (from: Date, to: Date) => Prisma.sql`
  WITH finalized_events AS (
    SELECT
      lp."customerId" AS customer_id,
      l."createdAt" AS event_at,
      CASE
        WHEN lower(trim(lp.status)) IN ('attended', 'completed') THEN 'ATTENDED'
        WHEN lower(trim(lp.status)) IN ('cancelled', 'canceled') THEN 'CANCELLED'
        WHEN lower(trim(lp.status)) IN ('no_show', 'no-show', 'no show', 'absent') THEN 'NO_SHOW'
        ELSE NULL
      END AS event_type
    FROM public.lesson_participants lp
    JOIN public.lessons l ON l.id = lp."lessonId"
    JOIN public.customers c ON c.id = lp."customerId" AND c."deletedAt" IS NULL
    WHERE l."createdAt" >= ${from}
      AND l."createdAt" < ${to}

    UNION ALL

    SELECT
      r."customerId" AS customer_id,
      r."scheduledAt" AS event_at,
      CASE
        WHEN r.status = 'COMPLETED' AND r."lessonId" IS NULL THEN 'ATTENDED'
        WHEN r.status = 'CANCELLED' THEN 'CANCELLED'
        WHEN r.status = 'NO_SHOW' THEN 'NO_SHOW'
        ELSE NULL
      END AS event_type
    FROM public.reservations r
    JOIN public.customers c ON c.id = r."customerId" AND c."deletedAt" IS NULL
    WHERE r."scheduledAt" >= ${from}
      AND r."scheduledAt" < ${to}
      AND r.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
  )
`

// GET /api/analytics/dashboard?months=3|6|12|24
// Manager-only. Lessons use the canonical PRIMARY LessonInstructor assignment;
// unlinked COMPLETED reservations use their single reservation instructor.
export async function GET(request: NextRequest) {
  const auth = requireManager(request)
  if ('error' in auth) return auth.error

  const months = parseAnalyticsMonths(new URL(request.url).searchParams.get('months'))
  const businessTimeZone = process.env.BUSINESS_TZ || DEFAULT_BUSINESS_TZ
  const { from, to } = analyticsDateRange(months, new Date(), businessTimeZone)

  try {
    const [customerRows, monthlyRows, rebookingRows] = await Promise.all([
      prisma.$queryRaw<CustomerMetricRow[]>(Prisma.sql`
        ${finalizedEventsSql(from, to)}
        SELECT
          c.id AS "customerId",
          c."firstName" AS "firstName",
          c."lastName" AS "lastName",
          c.company,
          count(*) FILTER (WHERE e.event_type = 'ATTENDED')::int AS attended,
          count(*) FILTER (WHERE e.event_type = 'CANCELLED')::int AS cancelled,
          count(*) FILTER (WHERE e.event_type = 'NO_SHOW')::int AS "noShows",
          count(*) OVER()::int AS "matchingCustomerCount"
        FROM finalized_events e
        JOIN public.customers c ON c.id = e.customer_id
        WHERE e.event_type IS NOT NULL
        GROUP BY c.id, c."firstName", c."lastName", c.company
        ORDER BY
          (count(*) FILTER (WHERE e.event_type = 'CANCELLED')) DESC,
          (count(*) FILTER (WHERE e.event_type = 'NO_SHOW')) DESC,
          (count(*) FILTER (WHERE e.event_type = 'ATTENDED')) DESC,
          c."lastName", c."firstName"
        LIMIT 1000
      `),
      prisma.$queryRaw<MonthlyMetric[]>(Prisma.sql`
        ${finalizedEventsSql(from, to)}
        SELECT
          to_char(e.event_at AT TIME ZONE ${businessTimeZone}, 'YYYY-MM') AS month,
          count(*) FILTER (WHERE e.event_type = 'ATTENDED')::int AS attended,
          count(*) FILTER (WHERE e.event_type = 'CANCELLED')::int AS cancelled,
          count(*) FILTER (WHERE e.event_type = 'NO_SHOW')::int AS "noShows",
          count(DISTINCT e.customer_id)::int AS "uniqueCustomers"
        FROM finalized_events e
        WHERE e.event_type IS NOT NULL
        -- Group by the selected expression position so the parameterized time zone
        -- is bound only once. Repeating it here creates a different PostgreSQL bind
        -- parameter, which PostgreSQL does not consider the same grouped expression.
        GROUP BY 1
        ORDER BY 1
      `),
      prisma.$queryRaw<InstructorRebookingRow[]>(Prisma.sql`
        WITH completed_events AS (
          SELECT
            li."userId" AS instructor_id,
            lp."customerId" AS customer_id,
            l."createdAt" AS event_at
          FROM public.lesson_instructors li
          JOIN public.lessons l ON l.id = li."lessonId"
          JOIN public.lesson_participants lp ON lp."lessonId" = l.id
          JOIN public.customers c ON c.id = lp."customerId" AND c."deletedAt" IS NULL
          WHERE li.assignment = 'PRIMARY'
            AND lower(trim(lp.status)) IN ('attended', 'completed')
            AND l."createdAt" >= ${from}
            AND l."createdAt" < ${to}

          UNION ALL

          SELECT
            r."instructorId" AS instructor_id,
            r."customerId" AS customer_id,
            r."scheduledAt" AS event_at
          FROM public.reservations r
          JOIN public.customers c ON c.id = r."customerId" AND c."deletedAt" IS NULL
          WHERE r.status = 'COMPLETED'
            AND r."lessonId" IS NULL
            AND r."instructorId" IS NOT NULL
            AND r."scheduledAt" >= ${from}
            AND r."scheduledAt" < ${to}
        ),
        rebooked AS (
          SELECT
            instructor_id,
            customer_id,
            count(*)::int AS lesson_count,
            min(event_at) AS first_lesson_at,
            max(event_at) AS latest_lesson_at
          FROM completed_events
          GROUP BY instructor_id, customer_id
          HAVING count(*) >= 2
        )
        SELECT
          u.id AS "instructorId",
          u."firstName" AS "instructorFirstName",
          u."lastName" AS "instructorLastName",
          c.id AS "customerId",
          c."firstName" AS "customerFirstName",
          c."lastName" AS "customerLastName",
          r.lesson_count AS "lessonCount",
          r.first_lesson_at AS "firstLessonAt",
          r.latest_lesson_at AS "latestLessonAt"
        FROM rebooked r
        JOIN public.users u ON u.id = r.instructor_id AND u.role = 'INSTRUCTOR'
        JOIN public.customers c ON c.id = r.customer_id
        ORDER BY u."lastName", u."firstName", r.lesson_count DESC, c."lastName", c."firstName"
      `),
    ])

    const customers = customerRows.map(row => {
      const attendanceBase = row.attended + row.noShows
      const finalized = attendanceBase + row.cancelled
      return {
        customerId: row.customerId,
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
        attended: row.attended,
        cancelled: row.cancelled,
        noShows: row.noShows,
        finalized,
        attendanceRate: percentage(row.attended, attendanceBase),
        cancellationRate: percentage(row.cancelled, finalized),
      }
    })

    const monthly = fillMonthlyMetrics(from, months, monthlyRows, businessTimeZone)
    const attended = monthly.reduce((sum, row) => sum + row.attended, 0)
    const cancelled = monthly.reduce((sum, row) => sum + row.cancelled, 0)
    const noShows = monthly.reduce((sum, row) => sum + row.noShows, 0)

    const instructorMap = new Map<string, {
      instructorId: string
      firstName: string
      lastName: string
      customers: Array<{
        customerId: string
        firstName: string
        lastName: string
        lessonCount: number
        firstLessonAt: Date
        latestLessonAt: Date
      }>
    }>()
    for (const row of rebookingRows) {
      const instructor = instructorMap.get(row.instructorId) || {
        instructorId: row.instructorId,
        firstName: row.instructorFirstName,
        lastName: row.instructorLastName,
        customers: [],
      }
      instructor.customers.push({
        customerId: row.customerId,
        firstName: row.customerFirstName,
        lastName: row.customerLastName,
        lessonCount: row.lessonCount,
        firstLessonAt: row.firstLessonAt,
        latestLessonAt: row.latestLessonAt,
      })
      instructorMap.set(row.instructorId, instructor)
    }

    const instructorRebookings = Array.from(instructorMap.values())
      .map(instructor => ({
        ...instructor,
        rebookedCustomerCount: instructor.customers.length,
        completedLessonCount: instructor.customers.reduce((sum, customer) => sum + customer.lessonCount, 0),
      }))
      .sort((a, b) => b.rebookedCustomerCount - a.rebookedCustomerCount || a.lastName.localeCompare(b.lastName))

    return NextResponse.json({
      range: { months, from: from.toISOString(), to: to.toISOString(), timeZone: businessTimeZone },
      definitions: {
        attendance: 'attended / (attended + no-show)',
        cancellation: 'cancelled / (attended + no-show + cancelled)',
        rebooking: 'at least two attended/completed sessions with the same primary instructor',
      },
      summary: {
        uniqueCustomers: customerRows[0]?.matchingCustomerCount || 0,
        attended,
        cancelled,
        noShows,
        finalized: attended + cancelled + noShows,
        attendanceRate: percentage(attended, attended + noShows),
        cancellationRate: percentage(cancelled, attended + cancelled + noShows),
        rebookedCustomers: new Set(rebookingRows.map(row => row.customerId)).size,
      },
      customers,
      customersTruncated: (customerRows[0]?.matchingCustomerCount || 0) > customerRows.length,
      monthly,
      instructorRebookings,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Analytics dashboard error:', error)
    return NextResponse.json({ error: 'Unable to load analytics from the database' }, { status: 500 })
  }
}
