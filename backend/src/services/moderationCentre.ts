import { AssessmentStatus, ModerationVarianceLevel, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { generateModerationVarianceReport } from "./moderationVariance";

const OVERDUE_DAYS = 3;

export async function getModerationCentre(workspaceId: string, actorId?: string) {
  const now = new Date();
  const overdueCutoff = new Date(now.getTime() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);

  const [awaitingBatches, completedBatches, overdueBatches, varianceScripts, varianceReport] =
    await Promise.all([
      prisma.scriptBatch.findMany({
        where: {
          workspaceId,
          status: { in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW] },
        },
        include: {
          assessment: {
            select: {
              id: true,
              title: true,
              subject: { select: { name: true } },
              creatorTeacher: { select: { fullName: true } },
            },
          },
          createdBy: { select: { fullName: true } },
        },
        orderBy: { updatedAt: "asc" },
        take: 20,
      }),
      prisma.scriptBatch.findMany({
        where: {
          workspaceId,
          status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
        },
        include: {
          assessment: {
            select: { id: true, title: true, subject: { select: { name: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.scriptBatch.findMany({
        where: {
          workspaceId,
          status: { in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW] },
          updatedAt: { lt: overdueCutoff },
        },
        include: {
          assessment: { select: { id: true, title: true } },
        },
        take: 10,
      }),
      prisma.learnerScript.findMany({
        where: {
          batch: { workspaceId },
          hodTotal: { not: null },
          varianceLevel: {
            in: [
              ModerationVarianceLevel.WARNING,
              ModerationVarianceLevel.SIGNIFICANT,
              ModerationVarianceLevel.CRITICAL,
            ],
          },
        },
        include: {
          learner: { select: { firstName: true, lastName: true } },
          assessment: { select: { id: true, title: true, totalMarks: true } },
        },
        orderBy: { moderationVariancePercent: "desc" },
        take: 15,
      }),
      generateModerationVarianceReport(workspaceId, actorId),
    ]);

  const assessmentsAwaiting = await prisma.assessment.count({
    where: { workspaceId, status: AssessmentStatus.SUBMITTED_TO_HOD },
  });

  return {
    stats: {
      awaitingModeration: awaitingBatches.length,
      moderationCompleted: completedBatches.length,
      moderationOverdue: overdueBatches.length,
      assessmentsAwaitingHod: assessmentsAwaiting,
      varianceFlagged: varianceScripts.length,
      moderationCompliance: varianceReport.summary.moderationCompliance,
    },
    awaitingModeration: awaitingBatches.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      assessment: b.assessment,
      createdBy: b.createdBy,
      updatedAt: b.updatedAt.toISOString(),
    })),
    moderationCompleted: completedBatches.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      assessment: b.assessment,
      updatedAt: b.updatedAt.toISOString(),
    })),
    moderationOverdue: overdueBatches.map((b) => ({
      id: b.id,
      title: b.title,
      assessment: b.assessment,
      updatedAt: b.updatedAt.toISOString(),
    })),
    varianceReports: varianceScripts.map((s) => ({
      scriptId: s.id,
      learnerName: `${s.learner.firstName} ${s.learner.lastName}`.trim(),
      assessment: s.assessment,
      teacherMark: s.teacherTotal,
      moderatorMark: s.hodTotal,
      variancePercent: s.moderationVariancePercent,
      varianceLevel: s.varianceLevel,
      hodComment: null,
    })),
    varianceAnalysis: varianceReport,
  };
}
