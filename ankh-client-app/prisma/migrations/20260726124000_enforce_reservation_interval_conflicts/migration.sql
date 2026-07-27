-- Enforce non-overlapping CONFIRMED reservations at the database level.
-- Half-open intervals allow adjacent sessions (09:00-09:30 and 09:30-10:00)
-- while rejecting all exact and partial overlaps, including concurrent writes.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

DROP INDEX IF EXISTS "public"."reservations_confirmed_slot_key";

ALTER TABLE "public"."reservations"
  ADD CONSTRAINT "reservations_duration_minutes_positive"
  CHECK ("durationMinutes" > 0);

ALTER TABLE "public"."reservations"
  ADD CONSTRAINT "reservations_no_confirmed_instructor_overlap"
  EXCLUDE USING gist (
    "instructorId" WITH =,
    tsrange(
      "scheduledAt",
      "scheduledAt" + ("durationMinutes" * INTERVAL '1 minute'),
      '[)'
    ) WITH &&
  )
  WHERE ("status" = 'CONFIRMED' AND "instructorId" IS NOT NULL);
