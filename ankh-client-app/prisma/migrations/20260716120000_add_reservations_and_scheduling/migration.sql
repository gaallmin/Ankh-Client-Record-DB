-- CreateEnum
CREATE TYPE "public"."ReservationStatus" AS ENUM ('CONFIRMED', 'WAITLISTED', 'PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ReservationSource" AS ENUM ('CLIENT', 'DELEGATE', 'INSTRUCTOR', 'MANAGER');

-- CreateEnum
CREATE TYPE "public"."UnavailabilityCategory" AS ENUM ('BUSINESS_TRIP', 'TRAINING', 'OTHER');

-- CreateTable
CREATE TABLE "public"."reservations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "instructorId" TEXT,
    "locationId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "public"."ReservationStatus" NOT NULL,
    "source" "public"."ReservationSource" NOT NULL,
    "isInstructorAdded" BOOLEAN NOT NULL DEFAULT false,
    "waitlistPosition" INTEGER,
    "lessonId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."availability_templates" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."unavailability_blocks" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "instructorId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "category" "public"."UnavailabilityCategory" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unavailability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_lessonId_key" ON "public"."reservations"("lessonId");

-- CreateIndex
CREATE INDEX "reservations_instructorId_idx" ON "public"."reservations"("instructorId");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "public"."reservations"("customerId");

-- CreateIndex
CREATE INDEX "reservations_scheduledAt_idx" ON "public"."reservations"("scheduledAt");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "public"."reservations"("status");

-- CreateIndex
CREATE INDEX "availability_templates_instructorId_idx" ON "public"."availability_templates"("instructorId");

-- CreateIndex
CREATE INDEX "unavailability_blocks_customerId_idx" ON "public"."unavailability_blocks"("customerId");

-- CreateIndex
CREATE INDEX "unavailability_blocks_instructorId_idx" ON "public"."unavailability_blocks"("instructorId");

-- AddForeignKey
ALTER TABLE "public"."reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reservations" ADD CONSTRAINT "reservations_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reservations" ADD CONSTRAINT "reservations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reservations" ADD CONSTRAINT "reservations_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_templates" ADD CONSTRAINT "availability_templates_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unavailability_blocks" ADD CONSTRAINT "unavailability_blocks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unavailability_blocks" ADD CONSTRAINT "unavailability_blocks_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
