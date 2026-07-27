export const ANALYTICS_MONTH_OPTIONS = [3, 6, 12, 24] as const
export type AnalyticsMonthOption = typeof ANALYTICS_MONTH_OPTIONS[number]

export type MonthlyMetric = {
  month: string
  attended: number
  cancelled: number
  noShows: number
  uniqueCustomers: number
}

function calendarParts(value: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return { year: Number(byType.year), month: Number(byType.month) }
}

function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const representedAsUtc = Date.UTC(
    Number(byType.year), Number(byType.month) - 1, Number(byType.day),
    Number(byType.hour) % 24, Number(byType.minute), Number(byType.second)
  )
  return Math.round((representedAsUtc - instant.getTime()) / 60_000)
}

function businessMonthStartUtc(timeZone: string, year: number, monthIndex: number): Date {
  const normalized = new Date(Date.UTC(year, monthIndex, 1))
  const wallClockGuess = new Date(Date.UTC(
    normalized.getUTCFullYear(), normalized.getUTCMonth(), 1
  ))
  const firstOffset = timeZoneOffsetMinutes(timeZone, wallClockGuess)
  const candidate = new Date(wallClockGuess.getTime() - firstOffset * 60_000)
  const secondOffset = timeZoneOffsetMinutes(timeZone, candidate)
  return secondOffset === firstOffset
    ? candidate
    : new Date(wallClockGuess.getTime() - secondOffset * 60_000)
}

export function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

export function parseAnalyticsMonths(value: string | null): AnalyticsMonthOption {
  const parsed = Number(value || 12)
  return ANALYTICS_MONTH_OPTIONS.includes(parsed as AnalyticsMonthOption)
    ? parsed as AnalyticsMonthOption
    : 12
}

export function analyticsDateRange(
  months: AnalyticsMonthOption,
  now = new Date(),
  timeZone = 'UTC'
): { from: Date; to: Date } {
  const current = calendarParts(now, timeZone)
  const from = businessMonthStartUtc(timeZone, current.year, current.month - months)
  return { from, to: now }
}

export function monthKeys(from: Date, months: number, timeZone = 'UTC'): string[] {
  const first = calendarParts(from, timeZone)
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(first.year, first.month - 1 + index, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export function fillMonthlyMetrics(from: Date, months: number, rows: MonthlyMetric[], timeZone = 'UTC') {
  const byMonth = new Map(rows.map(row => [row.month, row]))
  return monthKeys(from, months, timeZone).map(month => {
    const row = byMonth.get(month) || { month, attended: 0, cancelled: 0, noShows: 0, uniqueCustomers: 0 }
    const attendanceBase = row.attended + row.noShows
    const finalized = attendanceBase + row.cancelled
    return {
      ...row,
      finalized,
      attendanceRate: percentage(row.attended, attendanceBase),
      cancellationRate: percentage(row.cancelled, finalized),
    }
  })
}
