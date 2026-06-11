import { AssessmentStatus, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { getModerationCentre } from "./moderationCentre";

/** Moderator-focused dashboard — queue, variance, approval requests */
export async function getModeratorDashboard(workspaceId: string, actorId?: string) {
  const [
    moderationCentre,
    assessmentsInModeration,
    pendingApprovals,
    recentIntelligence,
  ] = await Promise.all([
    getModerationCentre(workspaceId, actorId),
    prisma.assessment.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            AssessmentStatus.HOD_REVIEW,
            AssessmentStatus.MODERATION,
            AssessmentStatus.SUBMITTED_TO_HOD,
          ],
        },
      },
      include: {
        subject: { select: { name: true } },
        creatorTeacher: { select: { fullName: true } },
        intelligenceReport: {
          select: { complianceScore: true, riskIndicators: true },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 15,
    }),
    prisma.moderationApprovalRequest.findMany({
      where: {
        assessment: { workspaceId },
        status: "PENDING",
      },
      include: {
        assessment: { select: { id: true, title: true } },
        requestedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.assessmentIntelligenceReport.findMany({
      where: {
        assessment: { workspaceId },
        complianceScore: { lt: 60 },
      },
      include: {
        assessment: {
          select: { id: true, title: true, subject: { select: { name: true } } },
        },
      },
      orderBy: { generatedAt: "desc" },
      take: 8,
    }),
  ]);

  return {
    role: "moderator" as const,
    stats: {
      ...moderationCentre.stats,
      pendingApprovals: pendingApprovals.length,
      lowComplianceCount: recentIntelligence.length,
    },
    moderationQueue: assessmentsInModeration.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      subject: a.subject.name,
      creator: a.creatorTeacher.fullName,
      complianceScore: a.intelligenceReport?.complianceScore ?? null,
      riskCount: Array.isArray(a.intelligenceReport?.riskIndicators)
        ? (a.intelligenceReport!.riskIndicators as unknown[]).length
        : 0,
    })),
    scriptBatches: moderationCentre.awaitingModeration,
    pendingApprovals,
    lowComplianceAssessments: recentIntelligence.map((r) => ({
      assessmentId: r.assessment.id,
      title: r.assessment.title,
      subject: r.assessment.subject.name,
      complianceScore: r.complianceScore,
    })),
    varianceReports: moderationCentre.varianceReports,
  };
}

/** Examination Body dashboard — cross-school oversight, approval pipeline */
export async function getExaminationBodyDashboard(workspaceId: string) {
  const [
    awaitingApproval,
    publishedCount,
    archivedCount,
    workflowPending,
    recentAudits,
    moderatedBatches,
  ] = await Promise.all([
    prisma.assessment.count({
      where: { workspaceId, status: AssessmentStatus.APPROVED },
    }),
    prisma.assessment.count({
      where: { workspaceId, status: AssessmentStatus.PUBLISHED },
    }),
    prisma.assessment.count({
      where: { workspaceId, status: AssessmentStatus.ARCHIVED },
    }),
    prisma.assessment.findMany({
      where: {
        workspaceId,
        status: { in: [AssessmentStatus.APPROVED, AssessmentStatus.HOD_REVIEW] },
      },
      include: {
        subject: { select: { name: true } },
        grade: { select: { name: true } },
        creatorTeacher: { select: { fullName: true } },
        intelligenceReport: { select: { complianceScore: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 12,
    }),
    prisma.assessmentModerationAudit.findMany({
      where: { assessment: { workspaceId } },
      include: {
        assessment: { select: { title: true } },
        performedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
      },
    }),
  ]);

  const avgCompliance = await prisma.assessmentIntelligenceReport.aggregate({
    where: { assessment: { workspaceId } },
    _avg: { complianceScore: true },
  });

  return {
    role: "examination_body" as const,
    stats: {
      awaitingApproval,
      publishedCount,
      archivedCount,
      moderatedBatches,
      averageComplianceScore: avgCompliance._avg.complianceScore ?? null,
    },
    approvalPipeline: workflowPending.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      subject: a.subject.name,
      grade: a.grade.name,
      creator: a.creatorTeacher.fullName,
      complianceScore: a.intelligenceReport?.complianceScore ?? null,
    })),
    recentActivity: recentAudits.map((a) => ({
      assessmentTitle: a.assessment.title,
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      performedBy: a.performedBy.fullName,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
