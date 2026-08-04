-- AlterTable
ALTER TABLE "LearnerScript" ADD COLUMN     "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateTeacherNotes" TEXT;
