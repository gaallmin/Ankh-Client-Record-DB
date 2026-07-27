// 30-minute slot generation from AvailabilityTemplate rules.
// Pure functions — no Prisma imports — so they are unit-testable.
//
// Time-zone model: templates store business-local wall-clock times ("09:00")
// per weekday (0=Mon..6=Sun). Slots are materialized to UTC instants using the
// business time zone (BUSINESS_TZ env, default Asia/Seoul). Offsets are
// resolved per-date via Intl, so zones with DST (if the business ever moves)
// get the correct offset on both sides of a transition; Asia/Seoul itself has
// no DST. All comparisons/storage stay in UTC.

export interface TemplateRule {
  instructorId: string
  dayOfWeek: number // 0=Mon .. 6=Sun
  startTime: string // "09:00" business-local
  endTime: string
  slotMinutes: number
}

export interface ExistingReservation {
  instructorId: string | null
  scheduledAt: Date
  durationMinutes: number
  status: string
}

export interface BlockedRange {
  instructorId: string | null
  customerId: string | null
  startDate: Date
  endDate: Date
}

export interface Slot {
  startsAt: Date // UTC instant
  durationMinutes: number
  capacity: number // instructors whose template covers this slot and are not blocked
  confirmedCount: number
  state: 'open' | 'waitlist' | 'unavailable'
}

export const DEFAULT_BUSINESS_TZ = 'Asia/Seoul'

// Offset (minutes east of UTC) of `tz` at the given UTC instant.
export function tzOffsetMinutes(tz: string, utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  })
  const parts = Object.fromEntries(dtf.formatToParts(utcInstant).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  )
  return Math.round((asUtc - utcInstant.getTime()) / 60000)
}

// UTC instant for business-local wall clock (y, m0, d, hh, mm) in `tz`.
// Two-pass offset resolution handles dates near DST transitions.
export function businessLocalToUtc(tz: string, y: number, m0: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m0, d, hh, mm))
  const offset1 = tzOffsetMinutes(tz, guess)
  const candidate = new Date(guess.getTime() - offset1 * 60000)
  const offset2 = tzOffsetMinutes(tz, candidate)
  return offset2 === offset1 ? candidate : new Date(guess.getTime() - offset2 * 60000)
}

// Mon-based weekday (0=Mon..6=Sun) of a UTC instant as seen in `tz`.
export function businessWeekday(tz: string, utcInstant: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(utcInstant)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd)
}

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number)
  return { h, m }
}

function overlaps(aStart: Date, aMinutes: number, bStart: Date, bMinutes: number): boolean {
  const aEnd = aStart.getTime() + aMinutes * 60000
  const bEnd = bStart.getTime() + bMinutes * 60000
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd
}

/**
 * Generate slots between `from` and `to` (UTC instants).
 *
 * State rules (preserves the existing reservation model's semantics):
 * - capacity = number of instructors with a covering template rule minus those
 *   fully blocked by an UnavailabilityBlock for that slot's date range
 * - confirmedCount = CONFIRMED reservations overlapping the slot
 * - open: confirmedCount < capacity
 * - waitlist: capacity > 0 but fully booked
 * - unavailable: capacity 0 (no template covers it / all instructors blocked)
 *
 * Existing hourly reservations (60-minute durations) remain valid: overlap is
 * interval-based, so a legacy 60-minute booking simply occupies two 30-minute
 * slots.
 */
export function generateSlots(opts: {
  templates: TemplateRule[]
  reservations: ExistingReservation[]
  blocks: BlockedRange[]
  from: Date
  to: Date
  tz?: string
  stepMinutes?: number
}): Slot[] {
  const tz = opts.tz || DEFAULT_BUSINESS_TZ
  const step = opts.stepMinutes || 30
  const slots = new Map<number, Slot>()

  // Iterate business-local dates covering [from, to]
  const cursor = new Date(opts.from.getTime() - 24 * 3600000)
  const end = new Date(opts.to.getTime() + 24 * 3600000)
  for (let dayMs = cursor.getTime(); dayMs <= end.getTime(); dayMs += 24 * 3600000) {
    const probe = new Date(dayMs)
    const weekday = businessWeekday(tz, probe)
    // Resolve the business-local calendar date of this probe instant
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    const [y, m, d] = dtf.format(probe).split('-').map(Number)

    for (const rule of opts.templates) {
      if (rule.dayOfWeek !== weekday) continue
      const { h: sh, m: sm } = parseHHMM(rule.startTime)
      const { h: eh, m: em } = parseHHMM(rule.endTime)
      const windowStart = businessLocalToUtc(tz, y, m - 1, d, sh, sm)
      const windowEnd = businessLocalToUtc(tz, y, m - 1, d, eh, em)

      for (let t = windowStart.getTime(); t + step * 60000 <= windowEnd.getTime(); t += step * 60000) {
        const startsAt = new Date(t)
        if (startsAt < opts.from || startsAt >= opts.to) continue

        const instructorBlocked = opts.blocks.some(b =>
          b.instructorId === rule.instructorId &&
          startsAt >= b.startDate && startsAt <= b.endDate
        )
        if (instructorBlocked) continue

        const existing = slots.get(t) || { startsAt, durationMinutes: step, capacity: 0, confirmedCount: 0, state: 'unavailable' as const }
        existing.capacity += 1
        slots.set(t, existing)
      }
    }
  }

  // Count confirmed occupancy per slot (interval overlap so legacy 60-min rows count correctly)
  const confirmed = opts.reservations.filter(r => r.status === 'CONFIRMED')
  for (const slot of slots.values()) {
    slot.confirmedCount = confirmed.filter(r =>
      overlaps(slot.startsAt, slot.durationMinutes, r.scheduledAt, r.durationMinutes)
    ).length
    slot.state = slot.capacity === 0 ? 'unavailable' : slot.confirmedCount < slot.capacity ? 'open' : 'waitlist'
  }

  return [...slots.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

// Would a new reservation for this instructor at this time conflict with an
// existing CONFIRMED one? (Server-side check; the partial unique DB index
// reservations_confirmed_slot_key is the last line of defense under races.)
export function hasInstructorConflict(
  reservations: ExistingReservation[],
  instructorId: string,
  scheduledAt: Date,
  durationMinutes: number
): boolean {
  return reservations.some(r =>
    r.instructorId === instructorId &&
    r.status === 'CONFIRMED' &&
    overlaps(scheduledAt, durationMinutes, r.scheduledAt, r.durationMinutes)
  )
}
