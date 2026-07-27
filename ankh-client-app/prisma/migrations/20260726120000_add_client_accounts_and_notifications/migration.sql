-- Reservation lifecycle gains terminal states (existing rows are untouched;
-- PENDING=requested, WAITLISTED=waiting in the requested state model).
ALTER TYPE "public"."ReservationStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "public"."ReservationStatus" ADD VALUE 'NO_SHOW';

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('RESERVATION_REQUESTED', 'RESERVATION_CONFIRMED', 'RESERVATION_REMINDER', 'RESERVATION_CANCELLED', 'RESERVATION_CHANGED', 'WAITLIST_CONFIRMED', 'LOYALTY_MESSAGE', 'STAFF_MESSAGE');
CREATE TYPE "public"."NotificationChannel" AS ENUM ('SMS', 'PUSH');
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- 30-minute scheduling default for newly created availability rules.
ALTER TABLE "public"."availability_templates" ALTER COLUMN "slotMinutes" SET DEFAULT 30;

-- CreateTable
CREATE TABLE "public"."client_accounts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "customerId" TEXT,
    "linkVerifiedAt" TIMESTAMP(3),
    "notifyBySms" BOOLEAN NOT NULL DEFAULT true,
    "notifyByPush" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."client_devices" (
    "id" TEXT NOT NULL,
    "clientAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "client_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "customerId" TEXT,
    "clientAccountId" TEXT,
    "reservationId" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_accounts_username_key" ON "public"."client_accounts"("username");
CREATE UNIQUE INDEX "client_accounts_customerId_key" ON "public"."client_accounts"("customerId");
CREATE INDEX "client_accounts_customerId_idx" ON "public"."client_accounts"("customerId");
CREATE UNIQUE INDEX "client_devices_token_key" ON "public"."client_devices"("token");
CREATE INDEX "client_devices_clientAccountId_idx" ON "public"."client_devices"("clientAccountId");
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "public"."notifications"("dedupeKey");
CREATE INDEX "notifications_customerId_idx" ON "public"."notifications"("customerId");
CREATE INDEX "notifications_reservationId_idx" ON "public"."notifications"("reservationId");
CREATE INDEX "notifications_status_idx" ON "public"."notifications"("status");
CREATE INDEX "notifications_createdAt_idx" ON "public"."notifications"("createdAt");
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "public"."audit_logs"("targetType", "targetId");
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt");

-- Server/database-side double-booking guard: at most one CONFIRMED reservation per
-- instructor per exact start time, enforced even under concurrent requests.
-- (Partial index — not expressible in Prisma schema DSL, maintained here.)
CREATE UNIQUE INDEX "reservations_confirmed_slot_key"
  ON "public"."reservations"("instructorId", "scheduledAt")
  WHERE "status" = 'CONFIRMED' AND "instructorId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."client_accounts" ADD CONSTRAINT "client_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."client_devices" ADD CONSTRAINT "client_devices_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "public"."client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "public"."client_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
