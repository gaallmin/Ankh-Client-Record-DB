-- Locations become editable: soft-delete instead of hard delete, so historical
-- lessons keep a valid location reference. Drop the hard unique constraint on
-- name (a soft-deleted location's name must be reusable); uniqueness among
-- active locations is enforced at the application layer instead.
DROP INDEX "locations_name_key";
ALTER TABLE "locations" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "locations_name_idx" ON "locations"("name");
CREATE INDEX "locations_deletedAt_idx" ON "locations"("deletedAt");
