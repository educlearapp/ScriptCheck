import { LearnerScriptStatus, ModerationVarianceLevel } from "@prisma/client";
import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";
import { normalizeWorkflowStatus } from "./scriptWorkflow";
import { VARIANCE_LABELS } from "./markTotals";

const UPLOADED_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.UPLOADED,
  LearnerScriptStatus.MARKING,
  LearnerScriptStatus.MARKED,
  LearnerScriptStatus.MODERATION,
  LearnerScriptStatus.MODERATED,
  LearnerScriptStatus.FINALISED,
  LearnerScriptStatus.SUBMITTED_TO_HOD,
  LearnerScriptStatus.HOD_REVIEW,
  LearnerScriptStatus.APPROVED,
  LearnerScriptStatus.IN_PROGRESS,
];

const MARKED_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.MARKED,
  LearnerScriptStatus.MODERATION,
  LearnerScriptStatus.MODERATED,
  LearnerScriptStatus.FINALISED,
  LearnerScriptStatus.SUBMITTED_TO_HOD,
  LearnerScriptStatus.HOD_REVIEW,
  LearnerScriptStatus.APPROVED,
];

const MODERATED_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.MODERATED,
  LearnerScriptStatus.APPROVED,
  LearnerScriptStatus.FINALISED,
];

const OVERDUE_DAYS = 7;

async function loadBatch(batchId: string, workspaceId: string) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: { select: { id: true, title: true, totalMarks: true } },
      learnerScripts: {
        include: {
          learner: true,
          questionMarks: { select: { teacherMarkedById: true } },
        },
      },
    },
  });
  if (!batch) throw new ScriptError("Script batch not found", 404);
  return batch;
}

function countByWorkflow(
  scripts: Array<{ status: LearnerScriptStatus; pageCount: number }>
) {
  let uploaded = 0;
  let marking = 0;
  let marked = 0;
  let moderation = 0;
  let moderated = 0;
  let finalised = 0;

  for (const s of scripts) {
    const wf = normalizeWorkflowStatus(s.status, s.pageCount);
    if (s.pageCount > 0) uploaded++;
    if (wf === "MARKING" || wf === "UPLOADED") marking++;
    if (MARKED_STATUSES.includes(s.status) || wf === "MARKED") marked++;
    if (wf === "MODERATION") moderation++;
    if (MODERATED_STATUSES.includes(s.status) || wf === "MODERATED") moderated++;
    if (wf === "FINALISED") finalised++;
  }

  return { uploaded, marking, marked, moderation, moderated, finalised };
}

export async function getBatchModerationAnalytics(
  batchId: string,
  workspaceId: string
) {
  const batch = await loadBatch(batchId, workspaceId);
  const scripts = batch.learnerScripts;
  const totals = scripts
    .map((s) => s.finalTotal)
    .filter((t): t is number => t != null);

  const workflowCounts = countByWorkflow(scripts);

  const varianceCounts = {
    warning: scripts.filter((s) => s.varianceLevel === ModerationVarianceLevel.WARNING).length,
    significant: scripts.filter((s) => s.varianceLevel === ModerationVarianceLevel.SIGNIFICANT).length,
    critical: scripts.filter((s) => s.varianceLevel === ModerationVarianceLevel.CRITICAL).length,
    totalFlagged: scripts.filter((s) =>
      (
        [
          ModerationVarianceLevel.WARNING,
          ModerationVarianceLevel.SIGNIFICANT,
          ModerationVarianceLevel.CRITICAL,
        ] as ModerationVarianceLevel[]
      ).includes(s.varianceLevel)
    ).length,
  };

  return {
    batchId: batch.id,
    title: batch.title,
    status: batch.status,
    assessment: batch.assessment,
    totalScripts: scripts.length,
    workflowCounts,
    marks: {
      average: totals.length ? round1(avg(totals)) : null,
      highest: totals.length ? Math.max(...totals) : null,
      lowest: totals.length ? Math.min(...totals) : null,
      assessmentTotal: batch.assessment.totalMarks,
    },
    varianceCounts,
    scripts: scripts.map((s) => ({
      id: s.id,
      scriptNumber: s.scriptNumber,
      learnerName: `${s.learner.firstName} ${s.learner.lastName}`,
      status: s.status,
      workflowStatus: normalizeWorkflowStatus(s.status, s.pageCount),
      teacherTotal: s.teacherTotal,
      hodTotal: s.hodTotal,
      finalTotal: s.finalTotal,
      markDifference: s.markDifference,
      moderationVariancePercent: s.moderationVariancePercent,
      varianceLevel: s.varianceLevel,
      varianceLabel: VARIANCE_LABELS[s.varianceLevel],
    })),
  };
}

export async function getMarkerPerformanceAnalytics(
  batchId: string,
  workspaceId: string
) {
  const batch = await loadBatch(batchId, workspaceId);
  const markerMap = new Map<
    string,
    {
      teacherId: string;
      scriptsMarked: Set<string>;
      totalAwarded: number;
      markCount: number;
      varianceSum: number;
      varianceCount: number;
      returnedCount: number;
      approvedCount: number;
    }
  >();

  for (const script of batch.learnerScripts) {
    const markerIds = new Set(
      script.questionMarks
        .map((m) => m.teacherMarkedById)
        .filter((id): id is string => Boolean(id))
    );

    if (markerIds.size === 0 && batch.createdById) {
      markerIds.add(batch.createdById);
    }

    for (const teacherId of markerIds) {
      if (!markerMap.has(teacherId)) {
        markerMap.set(teacherId, {
          teacherId,
          scriptsMarked: new Set(),
          totalAwarded: 0,
          markCount: 0,
          varianceSum: 0,
          varianceCount: 0,
          returnedCount: 0,
          approvedCount: 0,
        });
      }
      const entry = markerMap.get(teacherId)!;
      entry.scriptsMarked.add(script.id);
      if (script.teacherTotal != null) {
        entry.totalAwarded += script.teacherTotal;
        entry.markCount++;
      }
      if (script.moderationVariancePercent != null) {
        entry.varianceSum += script.moderationVariancePercent;
        entry.varianceCount++;
      }
      if (script.status === LearnerScriptStatus.RETURNED_TO_TEACHER) {
        entry.returnedCount++;
      }
      if (
        MODERATED_STATUSES.includes(script.status) ||
        script.status === LearnerScriptStatus.FINALISED
      ) {
        entry.approvedCount++;
      }
    }
  }

  const teacherIds = [...markerMap.keys()];
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(teachers.map((t) => [t.id, t.fullName]));

  return [...markerMap.values()].map((entry) => {
    const scriptCount = entry.scriptsMarked.size;
    const approvalRate =
      scriptCount > 0 ? round1((entry.approvedCount / scriptCount) * 100) : null;
    return {
      teacherId: entry.teacherId,
      teacherName: nameById.get(entry.teacherId) ?? "Unknown",
      scriptsMarked: scriptCount,
      averageMarkAwarded:
        entry.markCount > 0 ? round1(entry.totalAwarded / entry.markCount) : null,
      averageModerationVariance:
        entry.varianceCount > 0
          ? round1(entry.varianceSum / entry.varianceCount)
          : null,
      scriptsReturnedByHod: entry.returnedCount,
      approvalRate,
    };
  });
}

export async function getHodModerationDashboard(workspaceId: string) {
  const scripts = await prisma.learnerScript.findMany({
    where: { batch: { workspaceId } },
    include: {
      learner: true,
      batch: { select: { id: true, title: true, assessmentId: true } },
    },
  });

  const now = Date.now();
  const overdueMs = OVERDUE_DAYS * 24 * 60 * 60 * 1000;

  const pending = scripts.filter((s) =>
    (
      [
        LearnerScriptStatus.SUBMITTED_TO_HOD,
        LearnerScriptStatus.HOD_REVIEW,
        LearnerScriptStatus.MODERATION,
      ] as LearnerScriptStatus[]
    ).includes(s.status)
  );

  const overdue = pending.filter(
    (s) =>
      s.submittedToHodAt &&
      now - s.submittedToHodAt.getTime() > overdueMs
  );

  const returned = scripts.filter(
    (s) => s.status === LearnerScriptStatus.RETURNED_TO_TEACHER
  );

  const approved = scripts.filter((s) =>
    (
      [LearnerScriptStatus.MODERATED, LearnerScriptStatus.APPROVED] as LearnerScriptStatus[]
    ).includes(s.status)
  );

  const finalised = scripts.filter(
    (s) => s.status === LearnerScriptStatus.FINALISED
  );

  const batches = await prisma.scriptBatch.findMany({
    where: {
      workspaceId,
      status: {
        in: [
          "SUBMITTED_TO_HOD",
          "HOD_REVIEW",
          "RETURNED_TO_TEACHER",
          "APPROVED",
        ],
      },
    },
    include: {
      assessment: { select: { title: true, totalMarks: true } },
      _count: { select: { learnerScripts: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return {
    summary: {
      pendingModeration: pending.length,
      overdueModeration: overdue.length,
      returnedScripts: returned.length,
      approvedScripts: approved.length,
      finalisedScripts: finalised.length,
    },
    pendingBatches: batches,
    overdueScripts: overdue.slice(0, 10).map((s) => ({
      scriptId: s.id,
      scriptNumber: s.scriptNumber,
      learnerName: `${s.learner.firstName} ${s.learner.lastName}`,
      batchTitle: s.batch.title,
      submittedToHodAt: s.submittedToHodAt,
    })),
  };
}

export async function exportBatchMarksCsv(batchId: string, workspaceId: string) {
  const batch = await loadBatch(batchId, workspaceId);

  const header = [
    "Learner Number",
    "Learner Name",
    "Script Number",
    "Teacher Mark",
    "HOD Mark",
    "Final Mark",
    "Difference",
    "Variance %",
    "Variance Level",
    "Status",
  ];

  const rows = batch.learnerScripts.map((s) => [
    s.learner.learnerNumber,
    `${s.learner.firstName} ${s.learner.lastName}`,
    s.scriptNumber,
    s.teacherTotal ?? "",
    s.hodTotal ?? "",
    s.finalTotal ?? "",
    s.markDifference ?? "",
    s.moderationVariancePercent ?? "",
    s.varianceLevel,
    normalizeWorkflowStatus(s.status, s.pageCount),
  ]);

  const escape = (val: string | number) => {
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
