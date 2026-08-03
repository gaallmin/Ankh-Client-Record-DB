-- Bring the database in line with the User model. This field existed in the
-- application schema before it was captured in the Prisma migration history.
-- IF NOT EXISTS keeps the migration safe for development databases where it
-- may already have been added manually.
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "users_role_isActive_idx"
  ON "public"."users"("role", "isActive");
