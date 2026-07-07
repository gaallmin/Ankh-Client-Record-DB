-- Add optional lesson content and customer soft delete support
ALTER TABLE "lessons" ADD COLUMN "lessonContent" TEXT;
ALTER TABLE "customers" ADD COLUMN "deletedAt" TIMESTAMP;
