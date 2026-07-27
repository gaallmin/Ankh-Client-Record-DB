-- The product currently has no real SMS provider. Remove SMS preferences and
-- make each push notification traceable to the exact registered device.
-- NotificationChannel.SMS remains as a legacy enum value so historical rows
-- can still be read without a destructive enum rewrite.

ALTER TABLE "public"."client_accounts"
  DROP COLUMN IF EXISTS "notifyBySms";

ALTER TABLE "public"."notifications"
  ADD COLUMN "clientDeviceId" TEXT;

CREATE INDEX "notifications_clientDeviceId_idx"
  ON "public"."notifications"("clientDeviceId");

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_clientDeviceId_fkey"
  FOREIGN KEY ("clientDeviceId") REFERENCES "public"."client_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
