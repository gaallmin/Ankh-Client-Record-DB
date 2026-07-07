/*
  Warnings:

  - You are about to drop the column `courseCompletionStatus` on the `lessons` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `lessons` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `lessons` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `lessons` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "lessons" DROP COLUMN "courseCompletionStatus",
DROP COLUMN "endTime",
DROP COLUMN "startTime",
DROP COLUMN "title";
