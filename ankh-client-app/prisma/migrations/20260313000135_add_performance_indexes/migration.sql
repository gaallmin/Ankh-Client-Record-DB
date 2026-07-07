-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_firstName_idx" ON "customers"("firstName");

-- CreateIndex
CREATE INDEX "customers_lastName_idx" ON "customers"("lastName");

-- CreateIndex
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE INDEX "lesson_participants_customerId_idx" ON "lesson_participants"("customerId");

-- CreateIndex
CREATE INDEX "lesson_participants_lessonId_idx" ON "lesson_participants"("lessonId");

-- CreateIndex
CREATE INDEX "lessons_instructorId_idx" ON "lessons"("instructorId");

-- CreateIndex
CREATE INDEX "lessons_locationId_idx" ON "lessons"("locationId");

-- CreateIndex
CREATE INDEX "lessons_createdAt_idx" ON "lessons"("createdAt");

-- CreateIndex
CREATE INDEX "users_firstName_idx" ON "users"("firstName");

-- CreateIndex
CREATE INDEX "users_lastName_idx" ON "users"("lastName");
