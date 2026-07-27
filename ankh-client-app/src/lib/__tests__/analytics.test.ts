import { describe, expect, it } from 'vitest'
import {
  analyticsDateRange,
  fillMonthlyMetrics,
  monthKeys,
  parseAnalyticsMonths,
  percentage,
} from '../analytics'

describe('analytics calculations', () => {
  it('calculates percentages safely and rounds to one decimal place', () => {
    expect(percentage(0, 0)).toBe(0)
    expect(percentage(2, 3)).toBe(66.7)
    expect(percentage(1, -1)).toBe(0)
  })

  it('only accepts supported reporting periods', () => {
    expect(parseAnalyticsMonths('3')).toBe(3)
    expect(parseAnalyticsMonths('24')).toBe(24)
    expect(parseAnalyticsMonths('13')).toBe(12)
    expect(parseAnalyticsMonths(null)).toBe(12)
  })

  it('starts at the first day of the first business-local month', () => {
    const now = new Date('2026-07-27T12:00:00.000Z')
    expect(analyticsDateRange(12, now, 'UTC').from.toISOString()).toBe('2025-08-01T00:00:00.000Z')
    expect(analyticsDateRange(12, now, 'Asia/Seoul').from.toISOString()).toBe('2025-07-31T15:00:00.000Z')
  })

  it('uses business-local month keys when the UTC boundary is in the prior month', () => {
    const from = new Date('2025-07-31T15:00:00.000Z')
    expect(monthKeys(from, 3, 'Asia/Seoul')).toEqual(['2025-08', '2025-09', '2025-10'])
  })

  it('fills missing months and applies the documented denominators', () => {
    const rows = [{ month: '2026-06', attended: 8, noShows: 2, cancelled: 2, uniqueCustomers: 7 }]
    const result = fillMonthlyMetrics(new Date('2026-05-01T00:00:00.000Z'), 2, rows)

    expect(result[0]).toMatchObject({ month: '2026-05', finalized: 0, attendanceRate: 0, cancellationRate: 0 })
    expect(result[1]).toMatchObject({
      month: '2026-06',
      finalized: 12,
      attendanceRate: 80,
      cancellationRate: 16.7,
    })
  })
})
