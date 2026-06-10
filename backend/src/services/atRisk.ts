import { AtRiskReason, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";

export const PASS_THRESHOLD_PERCENT = 50;
export const AT_RISK_AVERAGE_THRESHOLD = 50;
const CONSECUTIVE_DECLINE_COUNT = 2;
const MULTIPLE_FAILURES_COUNT = 2;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type MarkHistoryEntry = {
  assessmentId: string;
  finalPercentage: number | null;
  capturedAt: Date;
};

export async function evaluateLearnerAtRisk(workspaceId: string, learnerId: string) {
  const marks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, learnerId, finalPercentage: { not: null } },
    orderBy: { capturedAt: "asc" },
    select: {
      assessmentId: true,
      finalPercentage: true,
      capturedAt: true,
    },
  });

  const history: MarkHistoryEntry[] = marks.map((m) => ({
    assessmentId: m.assessmentId,
    finalPercentage: m.finalPercentage,
    capturedAt: m.capturedAt,
  }));

  const reasons: AtRiskReason[] = [];
  const metadata: Record<string, unknown> = {};

  if (history.length > 0) {
    const average =
      history.reduce((sum, m) => sum + (m.finalPercentage ?? 0), 0) / history.length;
    metadata.averagePercentage = round1(average);
    if (average < AT_RISK_AVERAGE_THRESHOLD) {
      reasons.push(AtRiskReason.BELOW_THRESHOLD);
    }
  }

  const failedCount = history.filter(
    (m) => (m.finalPercentage ?? 0) < PASS_THRESHOLD_PERCENT
  ).length;
  if (failedCount >= MULTIPLE_FAILURES_COUNT) {
    reasons.push(AtRiskReason.MULTIPLE_FAILURES);
    metadata.failedAssessmentCount = failedCount;
  }

  const percentages = history.map((m) => m.finalPercentage as number);
  if (percentages.length >= CONSECUTIVE_DECLINE_COUNT + 1) {
    let consecutiveDeclines = 0;
    for (let i = percentages.length - 1; i > 0; i--) {
      if (percentages[i] < percentages[i - 1]) {
        consecutiveDeclines++;
      } else {
        break;
      }
    }
    if (consecutiveDeclines >= CONSECUTIVE_DECLINE_COUNT) {
      reasons.push(AtRiskReason.CONSECUTIVE_DECLINE);
      metadata.consecutiveDeclines = consecutiveDeclines;
    }
  }

  await prisma.learnerAtRiskFlag.updateMany({
    where: { workspaceId, learnerId, active: true },
    data: { active: false, clearedAt: new Date() },
  });

  const newFlags = [];
  for (const reason of reasons) {
    const flag = await prisma.learnerAtRiskFlag.create({
      data: {
        workspaceId,
        learnerId,
        reason,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    newFlags.push(flag);

    await logAudit({
      action: "LEARNER_FLAGGED_AT_RISK",
      workspaceId,
      metadata: { learnerId, reason, flagId: flag.id },
    });
  }

  return newFlags;
}

export async function listAtRiskLearners(workspaceId: string) {
  const flags = await prisma.learnerAtRiskFlag.findMany({
    where: { workspaceId, active: true },
    include: {
      learner: {
        select: {
          id: true,
          learnerNumber: true,
          firstName: true,
          lastName: true,
          className: true,
          grade: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { flaggedAt: "desc" },
  });

  const learnerMap = new Map<
    string,
    {
      learner: (typeof flags)[0]["learner"];
      reasons: AtRiskReason[];
      flaggedAt: Date;
      metadata: Record<string, unknown> | null;
    }
  >();

  for (const flag of flags) {
    const existing = learnerMap.get(flag.learnerId);
    if (existing) {
      existing.reasons.push(flag.reason);
    } else {
      learnerMap.set(flag.learnerId, {
        learner: flag.learner,
        reasons: [flag.reason],
        flaggedAt: flag.flaggedAt,
        metadata: (flag.metadata as Record<string, unknown>) ?? null,
      });
    }
  }

  return Array.from(learnerMap.values()).map((entry) => ({
    learnerId: entry.learner.id,
    learnerNumber: entry.learner.learnerNumber,
    learnerName: `${entry.learner.firstName} ${entry.learner.lastName}`.trim(),
    className: entry.learner.className,
    grade: entry.learner.grade,
    reasons: entry.reasons,
    flaggedAt: entry.flaggedAt.toISOString(),
    metadata: entry.metadata,
  }));
}

export async function countAtRiskLearners(workspaceId: string): Promise<number> {
  const distinct = await prisma.learnerAtRiskFlag.findMany({
    where: { workspaceId, active: true },
    distinct: ["learnerId"],
    select: { learnerId: true },
  });
  return distinct.length;
}
