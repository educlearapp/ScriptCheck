-- CreateEnum
CREATE TYPE "LessonTimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- CreateTable
CREATE TABLE "LessonTimetable" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "status" "LessonTimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonTimetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "periodId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "roomId" TEXT,
    "isDoublePeriod" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonTimetable_workspaceId_status_idx" ON "LessonTimetable"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LessonTimetable_workspaceId_academicYear_term_idx" ON "LessonTimetable"("workspaceId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "LessonEntry_workspaceId_timetableId_idx" ON "LessonEntry"("workspaceId", "timetableId");

-- CreateIndex
CREATE INDEX "LessonEntry_timetableId_dayOfWeek_periodId_idx" ON "LessonEntry"("timetableId", "dayOfWeek", "periodId");

-- CreateIndex
CREATE INDEX "LessonEntry_timetableId_teacherUserId_idx" ON "LessonEntry"("timetableId", "teacherUserId");

-- CreateIndex
CREATE INDEX "LessonEntry_timetableId_roomId_idx" ON "LessonEntry"("timetableId", "roomId");

-- CreateIndex
CREATE INDEX "LessonEntry_timetableId_schoolClassId_idx" ON "LessonEntry"("timetableId", "schoolClassId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonEntry_timetableId_dayOfWeek_periodId_schoolClassId_key" ON "LessonEntry"("timetableId", "dayOfWeek", "periodId", "schoolClassId");

-- AddForeignKey
ALTER TABLE "LessonTimetable" ADD CONSTRAINT "LessonTimetable_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTimetable" ADD CONSTRAINT "LessonTimetable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SchoolDayTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTimetable" ADD CONSTRAINT "LessonTimetable_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "LessonTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "WorkspaceSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonEntry" ADD CONSTRAINT "LessonEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TimetableRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
