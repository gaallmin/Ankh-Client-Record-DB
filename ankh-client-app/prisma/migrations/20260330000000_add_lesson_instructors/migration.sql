CREATE TABLE "lesson_instructors" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "lesson_instructors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_instructors_lessonId_userId_key" ON "lesson_instructors"("lessonId", "userId");
ALTER TABLE "lesson_instructors" ADD CONSTRAINT "lesson_instructors_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_instructors" ADD CONSTRAINT "lesson_instructors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
