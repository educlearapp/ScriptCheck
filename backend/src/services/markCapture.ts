import { MarkCaptureSource } from "@prisma/client";
import { prisma } from "../prisma";
import { evaluateLearnerAtRisk } from "./atRisk";
import { logAudit } from "./auditLog";

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
  comment: string | null;
  source: MarkCaptureSource;
  capturedAt: string;
};

export type BulkCaptureRow = {
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  mark: number | null;
  comment: string | null;
  status: "not_captured" | "captured" | "imported" | "script";
  markId: string | null;
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

  const result = serializeMarkCapture(record);

  await evaluateLearnerAtRisk(script.assessment.workspaceId, script.learnerId).catch(
    (err) => console.error("[atRisk] evaluation failed", err)
  );

  return result;
}

export async function syncMarkFromRubric(
  learnerScriptId: string,
  capturedById: string,
  source: MarkCaptureSource = MarkCaptureSource.RUBRIC_MARKING
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
      source,
      capturedById,
    },
    update: {
      learnerScriptId: script.id,
      teacherMark: script.teacherTotal,
      hodMark: script.hodTotal,
      finalMark: script.finalTotal,
      finalPercentage: script.finalPercentage,
      source,
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function upsertImportedMark(input: {
  workspaceId: string;
  assessmentId: string;
  learnerId: string;
  mark: number;
  comment: string | null;
  totalMarks: number;
  capturedById: string;
  source: MarkCaptureSource;
}): Promise<MarkCaptureRecord> {
  const percentage =
    input.totalMarks > 0
      ? round1((input.mark / input.totalMarks) * 100)
      : null;

  const record = await prisma.learnerAssessmentMark.upsert({
    where: {
      assessmentId_learnerId: {
        assessmentId: input.assessmentId,
        learnerId: input.learnerId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      learnerId: input.learnerId,
      teacherMark: input.mark,
      finalMark: input.mark,
      finalPercentage: percentage,
      comment: input.comment,
      source: input.source,
      capturedById: input.capturedById,
    },
    update: {
      teacherMark: input.mark,
      finalMark: input.mark,
      finalPercentage: percentage,
      comment: input.comment,
      source: input.source,
      capturedById: input.capturedById,
    },
  });

  await evaluateLearnerAtRisk(input.workspaceId, input.learnerId).catch((err) =>
    console.error("[atRisk] evaluation failed", err)
  );

  return serializeMarkCapture(record);
}

export async function getBulkCaptureGrid(
  workspaceId: string,
  assessmentId: string
): Promise<BulkCaptureRow[]> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: { gradeId: true, totalMarks: true },
  });
  if (!assessment) return [];

  const [scripts, marks, gradeLearners] = await Promise.all([
    prisma.learnerScript.findMany({
      where: { assessmentId, batch: { workspaceId } },
      include: {
        learner: {
          select: {
            id: true,
            learnerNumber: true,
            firstName: true,
            lastName: true,
            className: true,
          },
        },
      },
      orderBy: { learner: { lastName: "asc" } },
    }),
    prisma.learnerAssessmentMark.findMany({
      where: { workspaceId, assessmentId },
    }),
    prisma.learner.findMany({
      where: { workspaceId, gradeId: assessment.gradeId, active: true },
      select: {
        id: true,
        learnerNumber: true,
        firstName: true,
        lastName: true,
        className: true,
      },
      orderBy: { lastName: "asc" },
    }),
  ]);

  const markByLearner = new Map(marks.map((m) => [m.learnerId, m]));
  const rows = new Map<string, BulkCaptureRow>();

  for (const script of scripts) {
    const captured = markByLearner.get(script.learner.id);
    rows.set(script.learner.id, {
      learnerId: script.learner.id,
      learnerNumber: script.learner.learnerNumber,
      learnerName: `${script.learner.firstName} ${script.learner.lastName}`.trim(),
      className: script.learner.className,
      mark: captured?.finalMark ?? script.finalTotal,
      comment: captured?.comment ?? null,
      status: captured
        ? captured.source === "IMPORT"
          ? "imported"
          : captured.source === "SCRIPT_MARKING" || captured.source === "RUBRIC_MARKING"
            ? "script"
            : "captured"
        : script.finalTotal != null
          ? "script"
          : "not_captured",
      markId: captured?.id ?? null,
    });
  }

  for (const learner of gradeLearners) {
    if (rows.has(learner.id)) continue;
    const captured = markByLearner.get(learner.id);
    rows.set(learner.id, {
      learnerId: learner.id,
      learnerNumber: learner.learnerNumber,
      learnerName: `${learner.firstName} ${learner.lastName}`.trim(),
      className: learner.className,
      mark: captured?.finalMark ?? null,
      comment: captured?.comment ?? null,
      status: captured
        ? captured.source === "IMPORT"
          ? "imported"
          : "captured"
        : "not_captured",
      markId: captured?.id ?? null,
    });
  }

  return Array.from(rows.values()).sort((a, b) =>
    a.learnerName.localeCompare(b.learnerName)
  );
}

export async function saveBulkCaptureMarks(
  workspaceId: string,
  assessmentId: string,
  capturedById: string,
  entries: Array<{ learnerId: string; mark: number | null; comment?: string | null }>,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<{ saved: number }> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: { totalMarks: true },
  });
  if (!assessment) throw new Error("Assessment not found");

  let saved = 0;

  for (const entry of entries) {
    if (entry.mark == null || Number.isNaN(entry.mark)) continue;
    if (entry.mark < 0 || entry.mark > assessment.totalMarks) continue;

    await upsertImportedMark({
      workspaceId,
      assessmentId,
      learnerId: entry.learnerId,
      mark: entry.mark,
      comment: entry.comment ?? null,
      totalMarks: assessment.totalMarks,
      capturedById,
      source: MarkCaptureSource.MANUAL,
    });
    saved++;
  }

  if (saved > 0) {
    await logAudit({
      action: "BULK_MARK_CAPTURED",
      actorId: capturedById,
      workspaceId,
      metadata: { assessmentId, rowsCaptured: saved },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }

  return { saved };
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
  comment?: string | null;
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
    comment: record.comment ?? null,
    source: record.source,
    capturedAt: record.capturedAt.toISOString(),
  };
}
