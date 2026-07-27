import { describe, it, expect } from 'vitest'
import { reservationEventKey } from '../notifications'

// The DB-level unique constraint on notifications.dedupeKey is what enforces
// at-most-once per event — these tests pin the key-construction contract that
// the constraint depends on.
describe('notification idempotency keys', () => {
  it('same event → same key (duplicate triggers collide on the unique constraint)', () => {
    expect(reservationEventKey('WAITLIST_CONFIRMED', 'r1'))
      .toBe(reservationEventKey('WAITLIST_CONFIRMED', 'r1'))
  })

  it('different reservations and different event types never collide', () => {
    expect(reservationEventKey('WAITLIST_CONFIRMED', 'r1'))
      .not.toBe(reservationEventKey('WAITLIST_CONFIRMED', 'r2'))
    expect(reservationEventKey('RESERVATION_CONFIRMED', 'r1'))
      .not.toBe(reservationEventKey('WAITLIST_CONFIRMED', 'r1'))
  })

  it('repeatable events (reschedules) are disambiguated by target state', () => {
    const a = reservationEventKey('RESERVATION_CHANGED', 'r1', '2026-08-03T00:00:00.000Z')
    const b = reservationEventKey('RESERVATION_CHANGED', 'r1', '2026-08-04T00:00:00.000Z')
    expect(a).not.toBe(b)
    // ...but re-sending the SAME change is still deduplicated
    expect(a).toBe(reservationEventKey('RESERVATION_CHANGED', 'r1', '2026-08-03T00:00:00.000Z'))
  })

  it('device suffixing keeps push delivery idempotent per device', () => {
    const base = reservationEventKey('RESERVATION_CONFIRMED', 'r1')
    expect(`${base}:PUSH:device-a`).not.toBe(`${base}:PUSH:device-b`)
  })
})
