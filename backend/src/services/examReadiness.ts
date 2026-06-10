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
  filters?: { department?: string; gradeId?: string; subjectId?: string }
): Promise<ReadinessComponents> {
  const department = filters?.department;
  const departmentSubjectIds = department
    ? await resolveDepartmentSubjectIds(workspaceId, department)
    : undefined;

  const assessmentWhere = {
    workspaceId,
    status: { not: AssessmentStatus.DRAFT },
    ...(filters?.gradeId ? { gradeId: filters.gradeId } : {}),
    ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(departmentSubjectIds
      ? { subjectId: { in: departmentSubjectIds.length > 0 ? departmentSubjectIds : ["__none__"] } }
      : {}),
  };

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
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { not: ScriptBatchStatus.DRAFT },
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
        ...(departmentSubjectIds
          ? { assessment: { subjectId: { in: departmentSubjectIds } } }
          : {}),
      },
    }),
    prisma.paperVaultDocument.count({
      where: {
        workspaceId,
        isCurrentVersion: true,
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
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
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
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
        ...(filters?.gradeId ? { assessment: { gradeId: filters.gradeId } } : {}),
        ...(filters?.subjectId ? { assessment: { subjectId: filters.subjectId } } : {}),
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
  options?: {
    department?: string;
    gradeId?: string;
    subjectId?: string;
    actorId?: string;
    forceRefresh?: boolean;
  }
) {
  const scope = options?.gradeId
    ? ExamReadinessScope.GRADE
    : options?.subjectId
      ? ExamReadinessScope.SUBJECT
      : options?.department
        ? ExamReadinessScope.DEPARTMENT
        : ExamReadinessScope.SCHOOL;
  const department = options?.department ?? null;
  const gradeId = options?.gradeId ?? null;
  const subjectId = options?.subjectId ?? null;

  if (!options?.forceRefresh) {
    const recent = await prisma.examReadinessSnapshot.findFirst({
      where: { workspaceId, scope, department, gradeId, subjectId },
      orderBy: { calculatedAt: "desc" },
    });
    if (recent && Date.now() - recent.calculatedAt.getTime() < 15 * 60 * 1000) {
      return serializeSnapshot(recent);
    }
  }

  const components = await computeComponents(workspaceId, {
    department: options?.department,
    gradeId: options?.gradeId,
    subjectId: options?.subjectId,
  });
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
      gradeId,
      subjectId,
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
        gradeId,
        subjectId,
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
  gradeId?: string | null;
  subjectId?: string | null;
}) {
  return {
    id: snapshot.id,
    readinessPercentage: snapshot.readinessPercentage,
    status: snapshot.status,
    components: snapshot.components as ReadinessComponents,
    calculatedAt: snapshot.calculatedAt.toISOString(),
    scope: snapshot.scope,
    department: snapshot.department,
    gradeId: snapshot.gradeId ?? null,
    subjectId: snapshot.subjectId ?? null,
  };
}

export async function getLatestExamReadiness(
  workspaceId: string,
  filters?: { department?: string; gradeId?: string; subjectId?: string }
) {
  const scope = filters?.gradeId
    ? ExamReadinessScope.GRADE
    : filters?.subjectId
      ? ExamReadinessScope.SUBJECT
      : filters?.department
        ? ExamReadinessScope.DEPARTMENT
        : ExamReadinessScope.SCHOOL;

  const existing = await prisma.examReadinessSnapshot.findFirst({
    where: {
      workspaceId,
      scope,
      department: filters?.department ?? null,
      gradeId: filters?.gradeId ?? null,
      subjectId: filters?.subjectId ?? null,
    },
    orderBy: { calculatedAt: "desc" },
  });

  if (existing) return serializeSnapshot(existing);
  return calculateExamReadiness(workspaceId, filters);
}

export async function getReadinessByGrade(workspaceId: string) {
  const grades = await prisma.grade.findMany({
    where: { learners: { some: { workspaceId, active: true } } },
    select: { id: true, name: true },
    orderBy: { orderIndex: "asc" },
  });

  return Promise.all(
    grades.map(async (grade) => {
      const readiness = await getLatestExamReadiness(workspaceId, { gradeId: grade.id });
      return {
        gradeId: grade.id,
        grade: grade.name,
        readinessPercentage: readiness.readinessPercentage,
        status: readiness.status,
      };
    })
  );
}
