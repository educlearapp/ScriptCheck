import {
  AssessmentStatus,
  ExamReadinessScope,
  ExamReadinessStatus,
  PaperVaultStatus,
  ScriptBatchStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";

const READY_THRESHOLD = 80;

export type ReadinessComponents = {
  assessmentsCompleted: { completed: number; total: number; percentage: number };
  marksCaptured: { captured: number; total: number; percentage: number };
  moderationCompleted: { completed: number; total: number; percentage: number };
  papersApproved: { approved: number; total: number; percentage: number };
  papersReleased: { released: number; total: number; percentage: number };
  concessionsPrepared: { prepared: number; total: number; percentage: number };
  reportsGenerated: { generated: number; total: number; percentage: number };
};

function pct(completed: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((completed / total) * 1000) / 10;
}

function averageComponentPercentages(components: ReadinessComponents): number {
  const values = [
    components.assessmentsCompleted.percentage,
    components.marksCaptured.percentage,
    components.moderationCompleted.percentage,
    components.papersApproved.percentage,
    components.papersReleased.percentage,
    components.concessionsPrepared.percentage,
    components.reportsGenerated.percentage,
  ];
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

async function resolveDepartmentSubjectIds(
  workspaceId: string,
  department: string
): Promise<string[]> {
  const offerings = await prisma.workspaceSubject.findMany({
    where: { workspaceId, department, active: true, catalogSubjectId: { not: null } },
    select: { catalogSubjectId: true },
  });
  return offerings
    .map((o) => o.catalogSubjectId)
    .filter((id): id is string => id != null);
}

async function computeComponents(
  workspaceId: string,
  department?: string
): Promise<ReadinessComponents> {
  const departmentSubjectIds = department
    ? await resolveDepartmentSubjectIds(workspaceId, department)
    : undefined;

  const assessmentWhere = departmentSubjectIds
    ? {
        workspaceId,
        subjectId: { in: departmentSubjectIds.length > 0 ? departmentSubjectIds : ["__none__"] },
        status: { not: AssessmentStatus.DRAFT },
      }
    : { workspaceId, status: { not: AssessmentStatus.DRAFT } };

  const [
    totalAssessments,
    completedAssessments,
    totalLearners,
    capturedMarks,
    totalBatches,
    moderatedBatches,
    totalPapers,
    approvedPapers,
    releasedPapers,
    totalConcessionLearners,
    preparedConcessions,
    publishedAssessments,
    reportsGenerated,
  ] = await Promise.all([
    prisma.assessment.count({ where: assessmentWhere }),
    prisma.assessment.count({
      where: {
        ...assessmentWhere,
        status: { in: [AssessmentStatus.MARKED, AssessmentStatus.PUBLISHED, AssessmentStatus.APPROVED] },
      },
    }),
    prisma.learner.count({ where: { workspaceId, active: true } }),
    prisma.learnerAssessmentMark.count({
      where: {
        workspaceId,
        finalPercentage: { not: null },
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { not: ScriptBatchStatus.DRAFT },
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.paperVaultDocument.count({
      where: {
        workspaceId,
        isCurrentVersion: true,
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.paperVaultDocument.count({
      where: {
        workspaceId,
        isCurrentVersion: true,
        status: { in: [PaperVaultStatus.APPROVED, PaperVaultStatus.LOCKED, PaperVaultStatus.RELEASED] },
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.paperVaultDocument.count({
      where: {
        workspaceId,
        isCurrentVersion: true,
        status: PaperVaultStatus.RELEASED,
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.learner.count({ where: { workspaceId, active: true } }),
    prisma.learnerConcession.count({
      where: { workspaceId, active: true },
    }),
    prisma.assessment.count({
      where: { workspaceId, status: AssessmentStatus.PUBLISHED },
    }),
    prisma.auditLog.count({
      where: {
        workspaceId,
        action: { in: ["ASSESSMENT_REPORT_GENERATED", "LEARNER_REPORT_GENERATED"] },
      },
    }),
  ]);

  const expectedMarks = totalLearners * Math.max(completedAssessments, 1);

  return {
    assessmentsCompleted: {
      completed: completedAssessments,
      total: totalAssessments,
      percentage: pct(completedAssessments, totalAssessments),
    },
    marksCaptured: {
      captured: capturedMarks,
      total: expectedMarks,
      percentage: pct(capturedMarks, expectedMarks),
    },
    moderationCompleted: {
      completed: moderatedBatches,
      total: totalBatches,
      percentage: pct(moderatedBatches, totalBatches),
    },
    papersApproved: {
      approved: approvedPapers,
      total: totalPapers,
      percentage: pct(approvedPapers, totalPapers),
    },
    papersReleased: {
      released: releasedPapers,
      total: totalPapers,
      percentage: pct(releasedPapers, totalPapers),
    },
    concessionsPrepared: {
      prepared: preparedConcessions,
      total: totalConcessionLearners,
      percentage: pct(preparedConcessions, Math.max(totalConcessionLearners, 1)),
    },
    reportsGenerated: {
      generated: reportsGenerated,
      total: Math.max(publishedAssessments, 1),
      percentage: pct(reportsGenerated, Math.max(publishedAssessments, 1)),
    },
  };
}

export async function calculateExamReadiness(
  workspaceId: string,
  options?: { department?: string; actorId?: string; forceRefresh?: boolean }
) {
  const scope = options?.department ? ExamReadinessScope.DEPARTMENT : ExamReadinessScope.SCHOOL;
  const department = options?.department ?? null;

  if (!options?.forceRefresh) {
    const recent = await prisma.examReadinessSnapshot.findFirst({
      where: { workspaceId, scope, department },
      orderBy: { calculatedAt: "desc" },
    });
    if (recent && Date.now() - recent.calculatedAt.getTime() < 15 * 60 * 1000) {
      return serializeSnapshot(recent);
    }
  }

  const components = await computeComponents(workspaceId, options?.department);
  const readinessPercentage = averageComponentPercentages(components);
  const status =
    readinessPercentage >= READY_THRESHOLD
      ? ExamReadinessStatus.READY
      : ExamReadinessStatus.ATTENTION_REQUIRED;

  const snapshot = await prisma.examReadinessSnapshot.create({
    data: {
      workspaceId,
      scope,
      department,
      readinessPercentage,
      status,
      components: components as object,
    },
  });

  if (options?.actorId) {
    await logAudit({
      action: "EXAM_READINESS_GENERATED",
      workspaceId,
      actorId: options.actorId,
      metadata: {
        snapshotId: snapshot.id,
        readinessPercentage,
        status,
        scope,
        department,
      },
    });
  }

  return serializeSnapshot(snapshot);
}

function serializeSnapshot(snapshot: {
  id: string;
  readinessPercentage: number;
  status: ExamReadinessStatus;
  components: unknown;
  calculatedAt: Date;
  scope: ExamReadinessScope;
  department: string | null;
}) {
  return {
    id: snapshot.id,
    readinessPercentage: snapshot.readinessPercentage,
    status: snapshot.status,
    components: snapshot.components as ReadinessComponents,
    calculatedAt: snapshot.calculatedAt.toISOString(),
    scope: snapshot.scope,
    department: snapshot.department,
  };
}

export async function getLatestExamReadiness(
  workspaceId: string,
  department?: string
) {
  const scope = department ? ExamReadinessScope.DEPARTMENT : ExamReadinessScope.SCHOOL;
  const existing = await prisma.examReadinessSnapshot.findFirst({
    where: { workspaceId, scope, department: department ?? null },
    orderBy: { calculatedAt: "desc" },
  });

  if (existing) return serializeSnapshot(existing);
  return calculateExamReadiness(workspaceId, { department });
}
