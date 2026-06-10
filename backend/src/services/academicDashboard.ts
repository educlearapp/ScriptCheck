import { AssessmentStatus, LearnerScriptStatus, Prisma, ScriptBatchStatus } from "@prisma/client";
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
import { countUncapturedLearners } from "./markCapture";
import { countAtRiskLearners } from "./atRisk";
import {
  countImportValidationFailures,
  listRecentImports,
} from "./markImport";
import { countActiveConcessionLearners } from "./concessions";
import {
  countPortalLoginsSince,
  countPortalReportDownloads,
  getRecentPortalActivity,
} from "./portalReports";
import { deriveAcademicSnapshot, getSchoolAcademicTrends } from "./academicTrends";
import { getLatestExamReadiness } from "./examReadiness";

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
  const now = new Date();

  const [awaitingMarking, submittedToHod, recentlyPublished, moderationPending, overdueAssessments, upcomingDeadlines] = await Promise.all([
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
    prisma.scriptBatch.findMany({
      where: {
        workspaceId,
        createdById: hasBroadResultsAccess(access, workspaceId) ? undefined : userId,
        status: {
          in: [
            ScriptBatchStatus.SUBMITTED_TO_HOD,
            ScriptBatchStatus.HOD_REVIEW,
            ScriptBatchStatus.RETURNED_TO_TEACHER,
          ],
        },
      },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.assessment.findMany({
      where: {
        ...scope,
        dueDate: { lt: now },
        status: {
          notIn: [AssessmentStatus.PUBLISHED, AssessmentStatus.MARKED],
        },
      },
      include: assessmentListInclude,
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.assessment.findMany({
      where: {
        ...scope,
        OR: [
          { dueDate: { gte: now } },
          { markingDeadline: { gte: now } },
        ],
        status: {
          notIn: [AssessmentStatus.PUBLISHED],
        },
      },
      include: assessmentListInclude,
      orderBy: [{ dueDate: "asc" }, { markingDeadline: "asc" }],
      take: 8,
    }),
  ]);

  const markingAssessments = awaitingMarking.filter(
    (a) => a.status === AssessmentStatus.MARKING || a.status === AssessmentStatus.WRITTEN
  );
  const uncapturedCounts = await Promise.all(
    markingAssessments.map(async (a) => ({
      assessmentId: a.id,
      count: await countUncapturedLearners(workspaceId, a.id),
    }))
  );
  const marksNotCapturedCount = uncapturedCounts.reduce((sum, c) => sum + c.count, 0);

  const [recentImports, importFailures, portalLogins30d, portalDownloads30d, portalActivity] =
    await Promise.all([
      listRecentImports(workspaceId, userId, access, 5),
      countImportValidationFailures(workspaceId),
      countPortalLoginsSince(workspaceId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      countPortalReportDownloads(
        workspaceId,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ),
      getRecentPortalActivity(workspaceId, 5),
    ]);

  const publishedSnapshots = recentlyPublished
    .map((a) => parseAnalyticsSnapshot(a.analyticsSnapshot)?.classAverage)
    .filter((v): v is number => v != null);

  const teacherBatchFilter = hasBroadResultsAccess(access, workspaceId)
    ? { workspaceId }
    : { workspaceId, createdById: userId };

  const [
    scriptsAwaitingMarking,
    moderationRequests,
    scriptsProcessed,
    reportsGenerated,
    moderationsCompleted,
  ] = await Promise.all([
    prisma.learnerScript.count({
      where: {
        batch: teacherBatchFilter,
        status: {
          in: [LearnerScriptStatus.NOT_MARKED, LearnerScriptStatus.IN_PROGRESS, LearnerScriptStatus.MARKING],
        },
      },
    }),
    prisma.scriptBatch.count({
      where: {
        ...teacherBatchFilter,
        status: {
          in: [
            ScriptBatchStatus.SUBMITTED_TO_HOD,
            ScriptBatchStatus.HOD_REVIEW,
            ScriptBatchStatus.RETURNED_TO_TEACHER,
          ],
        },
      },
    }),
    prisma.learnerScript.count({
      where: {
        batch: teacherBatchFilter,
        status: {
          in: [
            LearnerScriptStatus.MARKED,
            LearnerScriptStatus.SUBMITTED_TO_HOD,
            LearnerScriptStatus.HOD_REVIEW,
            LearnerScriptStatus.APPROVED,
            LearnerScriptStatus.FINALISED,
          ],
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        workspaceId,
        actorId: userId,
        action: { in: ["ASSESSMENT_REPORT_GENERATED", "LEARNER_REPORT_GENERATED"] },
      },
    }),
    prisma.scriptBatch.count({
      where: {
        ...teacherBatchFilter,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
      },
    }),
  ]);

  const estimatedHoursSaved = round1(
    scriptsProcessed * 0.25 + reportsGenerated * 0.5 + moderationsCompleted * 1
  );

  return {
    scope: "teacher" as const,
    stats: {
      awaitingMarkingCount: awaitingMarking.length,
      submittedToHodCount: submittedToHod.length,
      publishedCount: recentlyPublished.length,
      averagePerformance: averageOf(publishedSnapshots),
      moderationPendingCount: moderationPending.length,
      marksNotCapturedCount,
      overdueAssessmentsCount: overdueAssessments.length,
      upcomingDeadlinesCount: upcomingDeadlines.length,
      recentImportsCount: recentImports.length,
      importFailuresCount: importFailures,
      portalLogins30d,
      portalReportDownloads30d: portalDownloads30d,
    },
    workload: {
      scriptsAwaitingMarking,
      moderationRequests,
      upcomingDeadlines: upcomingDeadlines.length,
      publishedAssessments: recentlyPublished.length,
    },
    timeSaved: {
      scriptsProcessed,
      reportsGenerated,
      moderationsCompleted,
      estimatedHoursSaved,
    },
    recentImports,
    portalActivity,
    awaitingMarking: awaitingMarking.map(serializeAssessmentBrief),
    submittedToHod: submittedToHod.map(serializeAssessmentBrief),
    recentlyPublished: recentlyPublished.map(serializeAssessmentBrief),
    moderationPending: moderationPending.map((batch) => ({
      id: batch.id,
      title: batch.title,
      status: batch.status,
      assessment: batch.assessment,
    })),
    overdueAssessments: overdueAssessments.map(serializeAssessmentBrief),
    upcomingDeadlines: upcomingDeadlines.map((a) => ({
      ...serializeAssessmentBrief(a),
      dueDate: a.dueDate?.toISOString() ?? null,
      markingDeadline: a.markingDeadline?.toISOString() ?? null,
      moderationDeadline: a.moderationDeadline?.toISOString() ?? null,
    })),
  };
}

export async function getHodDashboard(workspaceId: string, access: UserAccessContext) {
  const now = new Date();

  const [
    scriptBatchesAwaiting,
    assessmentsAwaitingReview,
    resultsAwaitingPublish,
    publishedAssessments,
    overdueModeration,
    moderationQueue,
    departmentStats,
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
    prisma.scriptBatch.findMany({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW] },
        updatedAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      },
      include: {
        assessment: {
          select: { id: true, title: true, subject: { select: { name: true } } },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),
    prisma.scriptBatch.findMany({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW] },
      },
      include: {
        assessment: {
          select: { id: true, title: true, subject: { select: { name: true } } },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),
    prisma.assessment.groupBy({
      by: ["subjectId"],
      where: { workspaceId, status: AssessmentStatus.PUBLISHED },
      _count: { id: true },
    }),
  ]);

  const topicMap = new Map<string, { total: number; count: number }>();
  const [atRiskTotal, importFailures, concessionLearners, recentImports, portalLogins30d, portalDownloads, portalActivity] =
    await Promise.all([
      countAtRiskLearners(workspaceId),
      countImportValidationFailures(workspaceId),
      countActiveConcessionLearners(workspaceId),
      listRecentImports(workspaceId, access.userId, access, 8),
      countPortalLoginsSince(workspaceId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      countPortalReportDownloads(workspaceId),
      getRecentPortalActivity(workspaceId, 8),
    ]);
  const classAverages: number[] = [];

  const importedAssessmentIds = new Set(
    recentImports
      .filter((i) => i.action === "BULK_MARK_IMPORT_COMPLETED")
      .map((i) => i.assessmentId)
  );

  for (const assessment of publishedAssessments) {
    const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
    if (!snapshot) continue;
    if (snapshot.classAverage != null) classAverages.push(snapshot.classAverage);
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

  const [moderationCompliance, readiness, teachers] = await Promise.all([
    computeModerationCompliance(workspaceId),
    getLatestExamReadiness(workspaceId),
    prisma.user.findMany({
      where: {
        memberships: {
          some: {
            workspaceId,
            isActive: true,
            roles: { some: { role: WorkspaceRole.TEACHER } },
          },
        },
      },
      select: { id: true, fullName: true },
    }),
  ]);

  const teacherOverview = await Promise.all(
    teachers.map(async (teacher) => {
      const [created, marked, moderations, outstanding, marks] = await Promise.all([
        prisma.assessment.count({
          where: { workspaceId, creatorTeacherId: teacher.id },
        }),
        prisma.learnerScript.count({
          where: {
            batch: { workspaceId, createdById: teacher.id },
            status: {
              in: [
                LearnerScriptStatus.MARKED,
                LearnerScriptStatus.SUBMITTED_TO_HOD,
                LearnerScriptStatus.HOD_REVIEW,
                LearnerScriptStatus.APPROVED,
                LearnerScriptStatus.FINALISED,
              ],
            },
          },
        }),
        prisma.scriptBatch.count({
          where: {
            workspaceId,
            createdById: teacher.id,
            status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
          },
        }),
        prisma.assessment.count({
          where: {
            workspaceId,
            creatorTeacherId: teacher.id,
            status: {
              notIn: [AssessmentStatus.PUBLISHED, AssessmentStatus.MARKED, AssessmentStatus.DRAFT],
            },
          },
        }),
        prisma.learnerAssessmentMark.findMany({
          where: {
            workspaceId,
            finalPercentage: { not: null },
            assessment: { creatorTeacherId: teacher.id },
          },
          select: { finalPercentage: true },
        }),
      ]);

      const learnerAverage =
        marks.length > 0
          ? round1(
              marks.reduce((sum, m) => sum + (m.finalPercentage ?? 0), 0) / marks.length
            )
          : null;

      return {
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        assessmentsCreated: created,
        assessmentsMarked: marked,
        moderationsCompleted: moderations,
        outstandingTasks: outstanding,
        learnerAverage,
      };
    })
  );

  return {
    scope: "hod" as const,
    stats: {
      scriptBatchesAwaitingModeration: scriptBatchesAwaiting,
      assessmentsAwaitingHodReview: assessmentsAwaitingReview,
      resultsAwaitingPublishCount: resultsAwaitingPublish.length,
      atRiskLearnerCount: atRiskTotal,
      departmentAverage: averageOf(classAverages),
      overdueModerationCount: overdueModeration.length,
      moderationQueueCount: moderationQueue.length,
      publishedSubjectCount: departmentStats.length,
      importFailuresCount: importFailures,
      concessionLearnerCount: concessionLearners,
      importedAssessmentsCount: importedAssessmentIds.size,
      portalAdoptionCount: portalLogins30d,
      portalReportDownloads: portalDownloads,
      moderationCompliance,
      outstandingAssessments: assessmentsAwaitingReview + scriptBatchesAwaiting,
      examReadinessScore: readiness.readinessPercentage,
      examReadinessStatus: readiness.status,
    },
    teacherOverview,
    examReadiness: readiness,
    recentImports,
    portalActivity,
    resultsAwaitingPublish: resultsAwaitingPublish.map(serializeAssessmentBrief),
    weakTopics,
    moderationQueue: moderationQueue.map((batch) => ({
      id: batch.id,
      title: batch.title,
      status: batch.status,
      assessment: batch.assessment,
      createdBy: batch.createdBy,
      updatedAt: batch.updatedAt.toISOString(),
    })),
    overdueModeration: overdueModeration.map((batch) => ({
      id: batch.id,
      title: batch.title,
      status: batch.status,
      assessment: batch.assessment,
      createdBy: batch.createdBy,
      updatedAt: batch.updatedAt.toISOString(),
    })),
  };
}

async function computeModerationCompliance(workspaceId: string): Promise<number | null> {
  const [submitted, completed] = await Promise.all([
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: {
          in: [
            ScriptBatchStatus.SUBMITTED_TO_HOD,
            ScriptBatchStatus.HOD_REVIEW,
            ScriptBatchStatus.APPROVED,
            ScriptBatchStatus.PUBLISHED,
          ],
        },
      },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
      },
    }),
  ]);
  if (submitted === 0) return 100;
  return round1((completed / submitted) * 100);
}

export async function getPrincipalDashboard(workspaceId: string) {
  const now = new Date();

  const [assessments, atRiskTotal, assessmentsOutstanding, moderationCompliance, readiness, trends] =
    await Promise.all([
      prisma.assessment.findMany({
        where: { workspaceId },
        include: assessmentListInclude,
        orderBy: { updatedAt: "desc" },
      }),
      countAtRiskLearners(workspaceId),
      prisma.assessment.count({
        where: {
          workspaceId,
          status: {
            notIn: [AssessmentStatus.PUBLISHED, AssessmentStatus.MARKED, AssessmentStatus.DRAFT],
          },
        },
      }),
      computeModerationCompliance(workspaceId),
      getLatestExamReadiness(workspaceId),
      getSchoolAcademicTrends(workspaceId),
    ]);

  const published = assessments.filter((a) => a.status === AssessmentStatus.PUBLISHED);
  const academicSnapshot = deriveAcademicSnapshot(trends.subjectTrends);

  const subjectMap = new Map<
    string,
    { passRates: number[]; averages: number[]; distinctions: number; count: number }
  >();
  const gradeMap = new Map<
    string,
    { passRates: number[]; averages: number[]; distinctions: number; count: number }
  >();
  const passRates: number[] = [];
  const classAverages: number[] = [];
  let totalDistinctions = 0;
  let totalLearners = 0;

  for (const assessment of published) {
    const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
    if (!snapshot) continue;
    if (snapshot.passRate != null) passRates.push(snapshot.passRate);
    if (snapshot.classAverage != null) classAverages.push(snapshot.classAverage);
    if (snapshot.distinctionCount != null) totalDistinctions += snapshot.distinctionCount;
    if (snapshot.learnerCount != null) totalLearners += snapshot.learnerCount;

    const subjectKey = assessment.subject.name;
    const gradeKey = assessment.grade.name;
    const subjectEntry = subjectMap.get(subjectKey) ?? {
      passRates: [],
      averages: [],
      distinctions: 0,
      count: 0,
    };
    if (snapshot.passRate != null) subjectEntry.passRates.push(snapshot.passRate);
    if (snapshot.classAverage != null) subjectEntry.averages.push(snapshot.classAverage);
    subjectEntry.distinctions += snapshot.distinctionCount ?? 0;
    subjectEntry.count += 1;
    subjectMap.set(subjectKey, subjectEntry);

    const gradeEntry = gradeMap.get(gradeKey) ?? {
      passRates: [],
      averages: [],
      distinctions: 0,
      count: 0,
    };
    if (snapshot.passRate != null) gradeEntry.passRates.push(snapshot.passRate);
    if (snapshot.classAverage != null) gradeEntry.averages.push(snapshot.classAverage);
    gradeEntry.distinctions += snapshot.distinctionCount ?? 0;
    gradeEntry.count += 1;
    gradeMap.set(gradeKey, gradeEntry);
  }

  const trendBySubject = new Map(trends.subjectTrends.map((t) => [t.subject, t.trend]));
  const trendByGrade = new Map(trends.gradeTrends.map((t) => [t.grade, t.trend]));

  const distinctionRate =
    totalLearners > 0 ? round1((totalDistinctions / totalLearners) * 100) : null;

  return {
    scope: "admin" as const,
    stats: {
      totalAssessments: assessments.length,
      publishedCount: published.length,
      averagePassRate: averageOf(passRates),
      schoolAverage: averageOf(classAverages),
      passRate: averageOf(passRates),
      distinctionRate,
      atRiskLearnerCount: atRiskTotal,
      assessmentsOutstanding,
      moderationCompliance,
      examReadinessScore: readiness.readinessPercentage,
      examReadinessStatus: readiness.status,
    },
    academicSnapshot,
    subjectPerformance: Array.from(subjectMap.entries())
      .map(([subject, data]) => ({
        subject,
        averagePassRate: averageOf(data.passRates),
        average: averageOf(data.averages),
        passRate: averageOf(data.passRates),
        distinctions: data.distinctions,
        assessmentCount: data.count,
        trend: trendBySubject.get(subject) ?? "stable",
      }))
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
    gradePerformance: Array.from(gradeMap.entries())
      .map(([grade, data]) => ({
        grade,
        averagePassRate: averageOf(data.passRates),
        gradeAverage: averageOf(data.averages),
        passRate: averageOf(data.passRates),
        distinctions: data.distinctions,
        assessmentCount: data.count,
        trend: trendByGrade.get(grade) ?? "stable",
      }))
      .sort((a, b) => (b.gradeAverage ?? 0) - (a.gradeAverage ?? 0)),
    trends,
    examReadiness: readiness,
    recentPublished: published.slice(0, 8).map(serializeAssessmentBrief),
    generatedAt: now.toISOString(),
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
