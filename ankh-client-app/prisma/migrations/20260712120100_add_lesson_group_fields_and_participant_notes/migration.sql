-- Group Lesson gains shared 수업 진행 내용 (reuses existing lessonContent),
-- 고객 변화, and 특이사항 및 요청사항 fields.
ALTER TABLE "lessons" ADD COLUMN "groupCustomerChange" TEXT;
ALTER TABLE "lessons" ADD COLUMN "groupNotes" TEXT;

-- Individual Lesson's 특이사항 및 요청사항 field gets a real dedicated column
-- instead of being hacked into the "status" attendance column.
ALTER TABLE "lesson_participants" ADD COLUMN "notes" TEXT;

-- Migrate existing feedback text (previously written into "status", overwriting
-- the "attended" default) into the new "notes" column, then restore "status".
UPDATE "lesson_participants"
SET "notes" = "status",
    "status" = 'attended'
WHERE "status" IS NOT NULL AND "status" <> '' AND "status" <> 'attended';
