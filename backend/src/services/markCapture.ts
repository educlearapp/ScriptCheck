import { MarkCaptureSource } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Canonical mark capture — "Capture once. Report everywhere."
 *
 * LearnerAssessmentMark is the single source of truth for learner results.
 * Reports, subject/class/grade analysis, and moderation all read from here.
 * Script marking writes through syncMarkFromScript() — no duplicate entry.
 */

export type MarkCaptureRecord = {
  id: string;
  assessmentId: string;
  learnerId: string;
  learnerScriptId: string | null;
  teacherMark: number | null;
  hodMark: number | null;
  finalMark: number | null;
  finalPercentage: number | null;
  source: MarkCaptureSource;
  capturedAt: string;
};

export async function syncMarkFromScript(
  learnerScriptId: string,
  capturedById: string
): Promise<MarkCaptureRecord | null> {
  const script = await prisma.learnerScript.findUnique({
    where: { id: learnerScriptId },
    include: {
      assessment: { select: { id: true, workspaceId: true, totalMarks: true } },
      learner: { select: { id: true } },
    },
  });

  if (!script?.assessment) return null;

  const hasMarks =
    script.teacherTotal != null ||
    script.hodTotal != null ||
    script.finalTotal != null;

  if (!hasMarks) return null;

  const record = await prisma.learnerAssessmentMark.upsert({
    where: {
      assessmentId_learnerId: {
        assessmentId: script.assessmentId,
        learnerId: script.learnerId,
      },
    },
    create: {
      workspaceId: script.assessment.workspaceId,
      assessmentId: script.assessmentId,
      learnerId: script.learnerId,
      learnerScriptId: script.id,
      teacherMark: script.teacherTotal,
      hodMark: script.hodTotal,
      finalMark: script.finalTotal,
      finalPercentage: script.finalPercentage,
      source: MarkCaptureSource.SCRIPT_MARKING,
      capturedById,
    },
    update: {
      learnerScriptId: script.id,
      teacherMark: script.teacherTotal,
      hodMark: script.hodTotal,
      finalMark: script.finalTotal,
      finalPercentage: script.finalPercentage,
      capturedById,
    },
  });

  return serializeMarkCapture(record);
}

export async function listMarksForAssessment(
  workspaceId: string,
  assessmentId: string
): Promise<MarkCaptureRecord[]> {
  const marks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, assessmentId },
    orderBy: { finalMark: "desc" },
  });

  return marks.map(serializeMarkCapture);
}

export async function listMarksForLearner(
  workspaceId: string,
  learnerId: string
): Promise<MarkCaptureRecord[]> {
  const marks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, learnerId },
    orderBy: { capturedAt: "desc" },
  });

  return marks.map(serializeMarkCapture);
}

export async function countUncapturedLearners(
  workspaceId: string,
  assessmentId: string
): Promise<number> {
  const [scriptCount, capturedCount] = await Promise.all([
    prisma.learnerScript.count({
      where: {
        assessmentId,
        batch: { workspaceId },
        status: { in: ["MARKED", "APPROVED", "MODERATED", "FINALISED"] },
      },
    }),
    prisma.learnerAssessmentMark.count({
      where: { workspaceId, assessmentId },
    }),
  ]);

  return Math.max(0, scriptCount - capturedCount);
}

function serializeMarkCapture(record: {
  id: string;
  assessmentId: string;
  learnerId: string;
  learnerScriptId: string | null;
  teacherMark: number | null;
  hodMark: number | null;
  finalMark: number | null;
  finalPercentage: number | null;
  source: MarkCaptureSource;
  capturedAt: Date;
}): MarkCaptureRecord {
  return {
    id: record.id,
    assessmentId: record.assessmentId,
    learnerId: record.learnerId,
    learnerScriptId: record.learnerScriptId,
    teacherMark: record.teacherMark,
    hodMark: record.hodMark,
    finalMark: record.finalMark,
    finalPercentage: record.finalPercentage,
    source: record.source,
    capturedAt: record.capturedAt.toISOString(),
  };
}
