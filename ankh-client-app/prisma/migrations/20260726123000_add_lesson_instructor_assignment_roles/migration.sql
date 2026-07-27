-- Make lesson instructor assignments explicit while preserving the legacy
-- lessons.instructorId primary-instructor pointer for compatibility.
-- Existing LessonInstructor rows were previously additional instructors, so
-- they become ASSISTANT assignments. The legacy primary instructor is then
-- backfilled into the same join table as PRIMARY.

CREATE TYPE "public"."LessonInstructorRole" AS ENUM ('PRIMARY', 'ASSISTANT');

ALTER TABLE "public"."lesson_instructors"
  ADD COLUMN "assignment" "public"."LessonInstructorRole" NOT NULL DEFAULT 'ASSISTANT',
  ADD COLUMN "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."lesson_instructors" li
    JOIN "public"."users" u ON u."id" = li."userId"
    WHERE u."role" <> 'INSTRUCTOR'
  ) OR EXISTS (
    SELECT 1
    FROM "public"."lessons" l
    JOIN "public"."users" u ON u."id" = l."instructorId"
    WHERE u."role" <> 'INSTRUCTOR'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate lesson instructors: a manager is assigned to a lesson';
  END IF;
END;
$$;

UPDATE "public"."lesson_instructors" li
SET "assignment" = 'PRIMARY'
FROM "public"."lessons" l
WHERE li."lessonId" = l."id"
  AND li."userId" = l."instructorId";

INSERT INTO "public"."lesson_instructors"
  ("id", "lessonId", "userId", "assignment", "assignedAt")
SELECT
  'primary_' || md5(l."id" || ':' || l."instructorId"),
  l."id",
  l."instructorId",
  'PRIMARY',
  COALESCE(l."createdAt", CURRENT_TIMESTAMP)
FROM "public"."lessons" l
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."lesson_instructors" li
  WHERE li."lessonId" = l."id"
    AND li."userId" = l."instructorId"
);

CREATE UNIQUE INDEX "lesson_instructors_one_primary_per_lesson_key"
  ON "public"."lesson_instructors"("lessonId")
  WHERE "assignment" = 'PRIMARY';

CREATE INDEX "lesson_instructors_userId_lessonId_idx"
  ON "public"."lesson_instructors"("userId", "lessonId");

CREATE INDEX "lesson_instructors_lessonId_assignment_idx"
  ON "public"."lesson_instructors"("lessonId", "assignment");

CREATE OR REPLACE FUNCTION "public"."require_instructor_user_for_lesson_assignment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "public"."users"
    WHERE "id" = NEW."userId"
      AND "role" = 'INSTRUCTOR'
  ) THEN
    RAISE EXCEPTION 'Only users with role INSTRUCTOR may be assigned to lessons';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lesson_instructors_require_instructor_role"
BEFORE INSERT OR UPDATE OF "userId" ON "public"."lesson_instructors"
FOR EACH ROW
EXECUTE FUNCTION "public"."require_instructor_user_for_lesson_assignment"();

-- Keep the compatibility pointer and canonical assignment table synchronized
-- for existing API/import code that still writes lessons.instructorId.
CREATE OR REPLACE FUNCTION "public"."sync_lesson_primary_instructor_assignment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "public"."lesson_instructors"
  SET "assignment" = 'ASSISTANT'
  WHERE "lessonId" = NEW."id"
    AND "assignment" = 'PRIMARY'
    AND "userId" <> NEW."instructorId";

  INSERT INTO "public"."lesson_instructors"
    ("id", "lessonId", "userId", "assignment", "assignedAt")
  VALUES
    ('primary_' || md5(NEW."id" || ':' || NEW."instructorId"), NEW."id", NEW."instructorId", 'PRIMARY', COALESCE(NEW."createdAt", CURRENT_TIMESTAMP))
  ON CONFLICT ("lessonId", "userId")
  DO UPDATE SET "assignment" = 'PRIMARY';

  RETURN NEW;
END;
$$;

CREATE TRIGGER "lessons_sync_primary_instructor_assignment"
AFTER INSERT OR UPDATE OF "instructorId" ON "public"."lessons"
FOR EACH ROW
EXECUTE FUNCTION "public"."sync_lesson_primary_instructor_assignment"();
