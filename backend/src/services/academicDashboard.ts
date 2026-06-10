import { AssessmentStatus, Prisma, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  hasBroadResultsAccess,
  parseAnalyticsSnapshot,
} from "./assessmentResults";
import {
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { WorkspaceRole } from "@prisma/client";

const assessmentListInclude = {
  grade: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  curriculum: { select: { id: true, code: true, name: true } },
  phase: { select: { id: true, code: true, name: true } },
  creatorTeacher: { select: { id: true, fullName: true } },
} satisfies Prisma.AssessmentInclude;

type AssessmentListItem = Prisma.AssessmentGetPayload<{
  include: typeof assessmentListInclude;
}>;

function serializeAssessmentBrief(assessment: AssessmentListItem) {
  const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
  return {
    id: assessment.id,
    title: assessment.title,
    status: assessment.status,
    totalMarks: assessment.totalMarks,
    grade: assessment.grade,
    subject: assessment.subject,
    curriculum: assessment.curriculum,
    phase: assessment.phase,
    creatorTeacher: assessment.creatorTeacher,
    publishedAt: assessment.publishedAt,
    resultsPublishRequestedAt: assessment.resultsPublishRequestedAt,
    classAverage: snapshot?.classAverage ?? null,
    passRate: snapshot?.passRate ?? null,
    learnerCount: snapshot?.learnerCount ?? null,
    learnersAtRiskCount: snapshot?.learnersAtRiskCount ?? null,
  };
}

function teacherScopeWhere(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
): Prisma.AssessmentWhereInput {
  if (hasBroadResultsAccess(access, workspaceId)) {
    return { workspaceId };
  }
  return { workspaceId, creatorTeacherId: userId };
}

function resolveDashboardScope(
  access: UserAccessContext,
  workspaceId: string
): "teacher" | "hod" | "admin" {
  if (
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  ) {
    return "admin";
  }

  if (hasBroadResultsAccess(access, workspaceId)) {
    return "hod";
  }

  return "teacher";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOf(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return round1(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}

export async function getTeacherDashboard(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
) {
  const scope = teacherScopeWhere(workspaceId, userId, access);

  const [awaitingMarking, submittedToHod, recentlyPublished] = await Promise.all([
    prisma.assessment.findMany({
      where: {
        ...scope,
        status: { in: [AssessmentStatus.MARKING, AssessmentStatus.WRITTEN] },
      },
      include: assessmentListInclude,
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.assessment.findMany({
      where: {
        ...scope,
        status: AssessmentStatus.SUBMITTED_TO_HOD,
      },
      include: assessmentListInclude,
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.assessment.findMany({
      where: {
        ...scope,
        status: AssessmentStatus.PUBLISHED,
      },
      include: assessmentListInclude,
      orderBy: { publishedAt: "desc" },
      take: 8,
    }),
  ]);

  const publishedSnapshots = recentlyPublished
    .map((a) => parseAnalyticsSnapshot(a.analyticsSnapshot)?.classAverage)
    .filter((v): v is number => v != null);

  return {
    scope: "teacher" as const,
    stats: {
      awaitingMarkingCount: awaitingMarking.length,
      submittedToHodCount: submittedToHod.length,
      publishedCount: recentlyPublished.length,
      averagePerformance: averageOf(publishedSnapshots),
    },
    awaitingMarking: awaitingMarking.map(serializeAssessmentBrief),
    submittedToHod: submittedToHod.map(serializeAssessmentBrief),
    recentlyPublished: recentlyPublished.map(serializeAssessmentBrief),
  };
}

export async function getHodDashboard(workspaceId: string, access: UserAccessContext) {
  const [
    scriptBatchesAwaiting,
    assessmentsAwaitingReview,
    resultsAwaitingPublish,
    publishedAssessments,
  ] = await Promise.all([
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: {
          in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW],
        },
      },
    }),
    prisma.assessment.count({
      where: {
        workspaceId,
        status: AssessmentStatus.SUBMITTED_TO_HOD,
      },
    }),
    prisma.assessment.findMany({
      where: {
        workspaceId,
        resultsPublishRequestedAt: { not: null },
        status: { not: AssessmentStatus.PUBLISHED },
      },
      include: assessmentListInclude,
      orderBy: { resultsPublishRequestedAt: "asc" },
      take: 10,
    }),
    prisma.assessment.findMany({
      where: { workspaceId, status: AssessmentStatus.PUBLISHED },
      select: { analyticsSnapshot: true },
    }),
  ]);

  const topicMap = new Map<string, { total: number; count: number }>();
  let atRiskTotal = 0;
  const classAverages: number[] = [];

  for (const assessment of publishedAssessments) {
    const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
    if (!snapshot) continue;
    if (snapshot.classAverage != null) classAverages.push(snapshot.classAverage);
    atRiskTotal += snapshot.learnersAtRiskCount;
    for (const topic of snapshot.weakTopics) {
      if (topic.averagePercentage == null) continue;
      const existing = topicMap.get(topic.topic) ?? { total: 0, count: 0 };
      existing.total += topic.averagePercentage;
      existing.count += 1;
      topicMap.set(topic.topic, existing);
    }
  }

  const weakTopics = Array.from(topicMap.entries())
    .map(([topic, data]) => ({
      topic,
      averagePercentage: round1(data.total / data.count),
      assessmentCount: data.count,
    }))
    .sort((a, b) => a.averagePercentage - b.averagePercentage)
    .slice(0, 8);

  return {
    scope: "hod" as const,
    stats: {
      scriptBatchesAwaitingModeration: scriptBatchesAwaiting,
      assessmentsAwaitingHodReview: assessmentsAwaitingReview,
      resultsAwaitingPublishCount: resultsAwaitingPublish.length,
      atRiskLearnerCount: atRiskTotal,
      departmentAverage: averageOf(classAverages),
    },
    resultsAwaitingPublish: resultsAwaitingPublish.map(serializeAssessmentBrief),
    weakTopics,
  };
}

export async function getPrincipalDashboard(workspaceId: string) {
  const assessments = await prisma.assessment.findMany({
    where: { workspaceId },
    include: assessmentListInclude,
    orderBy: { updatedAt: "desc" },
  });

  const published = assessments.filter((a) => a.status === AssessmentStatus.PUBLISHED);

  const subjectMap = new Map<string, { passRates: number[]; count: number }>();
  const gradeMap = new Map<string, { passRates: number[]; count: number }>();
  let atRiskTotal = 0;
  const passRates: number[] = [];

  for (const assessment of published) {
    const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
    if (!snapshot) continue;
    if (snapshot.passRate != null) passRates.push(snapshot.passRate);
    atRiskTotal += snapshot.learnersAtRiskCount;

    const subjectKey = assessment.subject.name;
    const gradeKey = assessment.grade.name;
    if (snapshot.passRate != null) {
      const subjectEntry = subjectMap.get(subjectKey) ?? { passRates: [], count: 0 };
      subjectEntry.passRates.push(snapshot.passRate);
      subjectEntry.count += 1;
      subjectMap.set(subjectKey, subjectEntry);

      const gradeEntry = gradeMap.get(gradeKey) ?? { passRates: [], count: 0 };
      gradeEntry.passRates.push(snapshot.passRate);
      gradeEntry.count += 1;
      gradeMap.set(gradeKey, gradeEntry);
    }
  }

  return {
    scope: "admin" as const,
    stats: {
      totalAssessments: assessments.length,
      publishedCount: published.length,
      averagePassRate: averageOf(passRates),
      atRiskLearnerCount: atRiskTotal,
    },
    subjectPerformance: Array.from(subjectMap.entries())
      .map(([subject, data]) => ({
        subject,
        averagePassRate: averageOf(data.passRates),
        assessmentCount: data.count,
      }))
      .sort((a, b) => (b.averagePassRate ?? 0) - (a.averagePassRate ?? 0)),
    gradePerformance: Array.from(gradeMap.entries())
      .map(([grade, data]) => ({
        grade,
        averagePassRate: averageOf(data.passRates),
        assessmentCount: data.count,
      }))
      .sort((a, b) => (b.averagePassRate ?? 0) - (a.averagePassRate ?? 0)),
    recentPublished: published
      .slice(0, 8)
      .map(serializeAssessmentBrief),
  };
}

export async function getAcademicDashboard(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
) {
  const scope = resolveDashboardScope(access, workspaceId);

  if (scope === "admin") {
    return getPrincipalDashboard(workspaceId);
  }

  if (scope === "hod") {
    return getHodDashboard(workspaceId, access);
  }

  return getTeacherDashboard(workspaceId, userId, access);
}

export type DepartmentResultsFilters = {
  curriculumId?: string;
  phaseId?: string;
  gradeId?: string;
  subjectId?: string;
  status?: AssessmentStatus;
  teacherId?: string;
};

export async function listDepartmentResults(
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  filters: DepartmentResultsFilters
) {
  const scope = teacherScopeWhere(workspaceId, userId, access);

  const statusFilter: AssessmentStatus | { in: AssessmentStatus[] } = filters.status
    ? filters.status
    : {
        in: [
          AssessmentStatus.MARKED,
          AssessmentStatus.HOD_REVIEW,
          AssessmentStatus.APPROVED,
          AssessmentStatus.PUBLISHED,
          AssessmentStatus.MARKING,
        ],
      };

  const assessments = await prisma.assessment.findMany({
    where: {
      ...scope,
      ...(filters.curriculumId ? { curriculumId: filters.curriculumId } : {}),
      ...(filters.phaseId ? { phaseId: filters.phaseId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.teacherId ? { creatorTeacherId: filters.teacherId } : {}),
      status: statusFilter,
    },
    include: assessmentListInclude,
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  return assessments.map(serializeAssessmentBrief);
}
