import { describe, it, expect } from 'vitest'
import {
  generateSlots, hasInstructorConflict, businessLocalToUtc, tzOffsetMinutes, businessWeekday,
  type TemplateRule, type ExistingReservation
} from '../slots'

const SEOUL = 'Asia/Seoul'
const NY = 'America/New_York'

// Mon 2026-08-03 is a Monday.
const mondayTemplate: TemplateRule = {
  instructorId: 'i1', dayOfWeek: 0, startTime: '09:00', endTime: '11:00', slotMinutes: 30
}

function seoul(y: number, m0: number, d: number, hh: number, mm = 0): Date {
  return businessLocalToUtc(SEOUL, y, m0, d, hh, mm)
}

describe('30-minute slot generation', () => {
  it('generates 30-minute slots across a template window', () => {
    const from = seoul(2026, 7, 3, 0)
    const to = seoul(2026, 7, 4, 0)
    const slots = generateSlots({ templates: [mondayTemplate], reservations: [], blocks: [], from, to, tz: SEOUL })
    // 09:00–11:00 → 09:00, 09:30, 10:00, 10:30 (11:00 excluded — slot must END within window)
    expect(slots).toHaveLength(4)
    expect(slots.every(s => s.durationMinutes === 30)).toBe(true)
    expect(slots[0].startsAt.getTime()).toBe(seoul(2026, 7, 3, 9).getTime())
    expect(slots[3].startsAt.getTime()).toBe(seoul(2026, 7, 3, 10, 30).getTime())
  })

  it('only generates slots on the template weekday', () => {
    // Tue 2026-08-04 — Monday template must produce nothing
    const from = seoul(2026, 7, 4, 0)
    const to = seoul(2026, 7, 5, 0)
    const slots = generateSlots({ templates: [mondayTemplate], reservations: [], blocks: [], from, to, tz: SEOUL })
    expect(slots).toHaveLength(0)
  })

  it('marks a slot waitlist when confirmed bookings reach capacity, open otherwise', () => {
    const from = seoul(2026, 7, 3, 0)
    const to = seoul(2026, 7, 4, 0)
    const confirmed: ExistingReservation = {
      instructorId: 'i1', scheduledAt: seoul(2026, 7, 3, 9), durationMinutes: 30, status: 'CONFIRMED'
    }
    const slots = generateSlots({ templates: [mondayTemplate], reservations: [confirmed], blocks: [], from, to, tz: SEOUL })
    expect(slots[0].state).toBe('waitlist') // 09:00 full (capacity 1)
    expect(slots[1].state).toBe('open')     // 09:30 free
  })

  it('a legacy 60-minute reservation blocks BOTH 30-minute slots it spans', () => {
    const from = seoul(2026, 7, 3, 0)
    const to = seoul(2026, 7, 4, 0)
    const legacyHourly: ExistingReservation = {
      instructorId: 'i1', scheduledAt: seoul(2026, 7, 3, 9), durationMinutes: 60, status: 'CONFIRMED'
    }
    const slots = generateSlots({ templates: [mondayTemplate], reservations: [legacyHourly], blocks: [], from, to, tz: SEOUL })
    expect(slots[0].state).toBe('waitlist') // 09:00
    expect(slots[1].state).toBe('waitlist') // 09:30 — covered by the same 60-min booking
    expect(slots[2].state).toBe('open')     // 10:00
  })

  it('capacity aggregates across instructors and instructor blocks reduce it', () => {
    const t2: TemplateRule = { ...mondayTemplate, instructorId: 'i2' }
    const from = seoul(2026, 7, 3, 0)
    const to = seoul(2026, 7, 4, 0)
    const withBoth = generateSlots({ templates: [mondayTemplate, t2], reservations: [], blocks: [], from, to, tz: SEOUL })
    expect(withBoth[0].capacity).toBe(2)

    const blocked = generateSlots({
      templates: [mondayTemplate, t2], reservations: [],
      blocks: [{ instructorId: 'i2', customerId: null, startDate: seoul(2026, 7, 3, 0), endDate: seoul(2026, 7, 4, 0) }],
      from, to, tz: SEOUL
    })
    expect(blocked[0].capacity).toBe(1)
  })
})

describe('time zones and DST', () => {
  it('Asia/Seoul is UTC+9 with no DST (both midsummer and midwinter)', () => {
    expect(tzOffsetMinutes(SEOUL, new Date('2026-07-01T00:00:00Z'))).toBe(540)
    expect(tzOffsetMinutes(SEOUL, new Date('2026-01-01T00:00:00Z'))).toBe(540)
  })

  it('business-local 09:00 in Seoul is 00:00 UTC', () => {
    const d = businessLocalToUtc(SEOUL, 2026, 7, 3, 9, 0)
    expect(d.toISOString()).toBe('2026-08-03T00:00:00.000Z')
  })

  it('handles a DST spring-forward boundary (America/New_York, 2026-03-08)', () => {
    // Before transition: EST (UTC-5). After: EDT (UTC-4).
    const before = businessLocalToUtc(NY, 2026, 2, 7, 9, 0)  // Sat Mar 7 09:00 EST
    const after = businessLocalToUtc(NY, 2026, 2, 9, 9, 0)   // Mon Mar 9 09:00 EDT
    expect(before.toISOString()).toBe('2026-03-07T14:00:00.000Z')
    expect(after.toISOString()).toBe('2026-03-09T13:00:00.000Z')
  })

  it('weekday resolution respects the business time zone across the date line', () => {
    // 2026-08-02T23:00Z is already Monday 08:00 in Seoul
    expect(businessWeekday(SEOUL, new Date('2026-08-02T23:00:00Z'))).toBe(0)
    // ...but still Sunday in New York
    expect(businessWeekday(NY, new Date('2026-08-02T23:00:00Z'))).toBe(6)
  })
})

describe('overlap / conflict detection', () => {
  const base: ExistingReservation = {
    instructorId: 'i1', scheduledAt: new Date('2026-08-03T00:00:00Z'), durationMinutes: 30, status: 'CONFIRMED'
  }

  it('detects exact and partial overlaps for the same instructor', () => {
    expect(hasInstructorConflict([base], 'i1', new Date('2026-08-03T00:00:00Z'), 30)).toBe(true)
    expect(hasInstructorConflict([base], 'i1', new Date('2026-08-03T00:15:00Z'), 30)).toBe(true)
  })

  it('adjacent slots do not conflict (half-open intervals)', () => {
    expect(hasInstructorConflict([base], 'i1', new Date('2026-08-03T00:30:00Z'), 30)).toBe(false)
    expect(hasInstructorConflict([base], 'i1', new Date('2026-08-02T23:30:00Z'), 30)).toBe(false)
  })

  it('other instructors and non-confirmed statuses never conflict', () => {
    expect(hasInstructorConflict([base], 'i2', new Date('2026-08-03T00:00:00Z'), 30)).toBe(false)
    const waitlisted = { ...base, status: 'WAITLISTED' }
    expect(hasInstructorConflict([waitlisted], 'i1', new Date('2026-08-03T00:00:00Z'), 30)).toBe(false)
  })
})
