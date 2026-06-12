-- CreateEnum
CREATE TYPE "TimetableRoomType" AS ENUM ('CLASSROOM', 'LAB', 'COMPUTER_LAB', 'HALL', 'SPORTS', 'OTHER');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('TEACHING', 'BREAK');

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "learnerCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableRoom" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "roomType" "TimetableRoomType" NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDayTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dayTemplateId" TEXT NOT NULL,
    "periodOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL DEFAULT 'TEACHING',
    "doublePeriodCapable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectRequirement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodsPerWeek" INTEGER NOT NULL,
    "doublePeriodsRequired" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolClass_workspaceId_active_idx" ON "SchoolClass"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "SchoolClass_workspaceId_grade_idx" ON "SchoolClass"("workspaceId", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_workspaceId_code_key" ON "SchoolClass"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "TimetableRoom_workspaceId_active_idx" ON "TimetableRoom"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "TimetableRoom_workspaceId_roomType_idx" ON "TimetableRoom"("workspaceId", "roomType");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableRoom_workspaceId_code_key" ON "TimetableRoom"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "SchoolDayTemplate_workspaceId_active_idx" ON "SchoolDayTemplate"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "SchoolDayTemplate_workspaceId_isDefault_idx" ON "SchoolDayTemplate"("workspaceId", "isDefault");

-- CreateIndex
CREATE INDEX "PeriodDefinition_workspaceId_dayTemplateId_idx" ON "PeriodDefinition"("workspaceId", "dayTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodDefinition_dayTemplateId_periodOrder_key" ON "PeriodDefinition"("dayTemplateId", "periodOrder");

-- CreateIndex
CREATE INDEX "TeacherAssignment_workspaceId_active_idx" ON "TeacherAssignment"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "TeacherAssignment_workspaceId_classId_idx" ON "TeacherAssignment"("workspaceId", "classId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_workspaceId_teacherId_idx" ON "TeacherAssignment"("workspaceId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_workspaceId_teacherId_classId_subjectId_key" ON "TeacherAssignment"("workspaceId", "teacherId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "SubjectRequirement_workspaceId_classId_idx" ON "SubjectRequirement"("workspaceId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectRequirement_workspaceId_classId_subjectId_key" ON "SubjectRequirement"("workspaceId", "classId", "subjectId");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableRoom" ADD CONSTRAINT "TimetableRoom_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDayTemplate" ADD CONSTRAINT "SchoolDayTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodDefinition" ADD CONSTRAINT "PeriodDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodDefinition" ADD CONSTRAINT "PeriodDefinition_dayTemplateId_fkey" FOREIGN KEY ("dayTemplateId") REFERENCES "SchoolDayTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "WorkspaceSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRequirement" ADD CONSTRAINT "SubjectRequirement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRequirement" ADD CONSTRAINT "SubjectRequirement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRequirement" ADD CONSTRAINT "SubjectRequirement_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "WorkspaceSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
