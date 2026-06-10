import { prisma } from "../prisma";
import {
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { AssessmentStatus, WorkspaceRole } from "@prisma/client";

export class ResultsError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ResultsError";
  }
}

const PASS_THRESHOLD_PERCENT = 50;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function questionPercentage(mark: number | null, maxMarks: number): number | null {
  if (mark == null || maxMarks <= 0) return null;
  return round1((mark / maxMarks) * 100);
}

function learnerPercentage(finalTotal: number | null, totalMarks: number): number | null {
  if (finalTotal == null || totalMarks <= 0) return null;
  return round1((finalTotal / totalMarks) * 100);
}

export function canAccessResults(
  access: UserAccessContext,
  workspaceId: string,
  creatorTeacherId: string
): boolean {
  if (!hasPermission(access, workspaceId, PERMISSIONS.RESULTS_VIEW)) {
    return false;
  }

  if (hasBroadResultsAccess(access, workspaceId)) {
    return true;
  }

  return creatorTeacherId === access.userId;
}

export function canExportResults(
  access: UserAccessContext,
  workspaceId: string,
  creatorTeacherId: string
): boolean {
  if (!hasPermission(access, workspaceId, PERMISSIONS.RESULTS_EXPORT)) {
    return false;
  }

  if (hasBroadResultsAccess(access, workspaceId)) {
    return true;
  }

  return creatorTeacherId === access.userId;
}

export function hasBroadResultsAccess(
  access: UserAccessContext,
  workspaceId: string
): boolean {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.ASSESSMENTS_EDIT) ||
    hasPermission(access, workspaceId, PERMISSIONS.MODERATION_QUEUE) ||
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.HOD,
      WorkspaceRole.MODERATOR,
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  );
}

export function resolveViewerScope(
  access: UserAccessContext,
  workspaceId: string,
  creatorTeacherId: string
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

  if (
    hasBroadResultsAccess(access, workspaceId) &&
    creatorTeacherId !== access.userId
  ) {
    return "hod";
  }

  if (hasBroadResultsAccess(access, workspaceId)) {
    return "hod";
  }

  return "teacher";
}

type MarkRow = {
  assessmentQuestionId: string;
  questionNumber: string;
  maxMarks: number;
  finalMark: number | null;
};

type ScriptRow = {
  id: string;
  status: string;
  finalTotal: number | null;
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
  };
  questionMarks: MarkRow[];
};

type QuestionRow = {
  id: string;
  questionNumber: string;
  marks: number;
  topic: string | null;
  cognitiveLevel: string | null;
  difficulty: string | null;
};

async function loadAssessmentResultsData(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      creatorTeacher: { select: { id: true, fullName: true } },
      questions: { orderBy: { orderIndex: "asc" } },
      learnerScripts: {
        include: {
          learner: true,
          questionMarks: {
            select: {
              assessmentQuestionId: true,
              questionNumber: true,
              maxMarks: true,
              finalMark: true,
            },
          },
        },
        orderBy: [{ scriptNumber: "asc" }],
      },
    },
  });

  if (!assessment) {
    throw new ResultsError("Assessment not found", 404);
  }

  return assessment;
}

function buildQuestionAnalysis(
  questions: QuestionRow[],
  scripts: ScriptRow[]
) {
  return questions.map((question) => {
    const marksForQuestion = scripts.flatMap((script) => {
      const mark = script.questionMarks.find(
        (m) => m.assessmentQuestionId === question.id
      );
      return mark ? [{ scriptId: script.id, finalMark: mark.finalMark }] : [];
    });

    const scored = marksForQuestion.filter((m) => m.finalMark != null);
    const markValues = scored.map((m) => m.finalMark as number);
    const averageMark =
      markValues.length > 0
        ? round1(markValues.reduce((sum, m) => sum + m, 0) / markValues.length)
        : null;
    const averagePercentage =
      averageMark != null && question.marks > 0
        ? round1((averageMark / question.marks) * 100)
        : null;

    const fullMarksCount = scored.filter(
      (m) => m.finalMark === question.marks
    ).length;

    const belowFiftyCount = scored.filter((m) => {
      const pct = questionPercentage(m.finalMark, question.marks);
      return pct != null && pct < PASS_THRESHOLD_PERCENT;
    }).length;

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      maxMarks: question.marks,
      averageMark,
      averagePercentage,
      fullMarksCount,
      belowFiftyCount,
      topic: question.topic,
      cognitiveLevel: question.cognitiveLevel,
      difficulty: question.difficulty,
    };
  });
}

function groupByField<T extends { averagePercentage: number | null }>(
  items: Array<T & { groupKey: string }>
) {
  const groups = new Map<string, { percentages: number[]; items: T[] }>();

  for (const item of items) {
    const key = item.groupKey;
    if (!groups.has(key)) {
      groups.set(key, { percentages: [], items: [] });
    }
    const group = groups.get(key)!;
    group.items.push(item);
    if (item.averagePercentage != null) {
      group.percentages.push(item.averagePercentage);
    }
  }

  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    averagePercentage:
      group.percentages.length > 0
        ? round1(
            group.percentages.reduce((sum, p) => sum + p, 0) /
              group.percentages.length
          )
        : null,
    items: group.items,
  }));
}

export async function getAssessmentResults(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const assessment = await loadAssessmentResultsData(assessmentId, workspaceId);

  if (!canAccessResults(access, workspaceId, assessment.creatorTeacherId)) {
    throw new ResultsError("You do not have permission to view these results", 403);
  }

  const totalMarks = assessment.totalMarks;

  const capturedMarks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, assessmentId },
    select: {
      learnerId: true,
      finalMark: true,
      finalPercentage: true,
    },
  });
  const capturedByLearner = new Map(
    capturedMarks.map((m) => [m.learnerId, m])
  );

  const scripts: ScriptRow[] = assessment.learnerScripts.map((script) => ({
    id: script.id,
    status: script.status,
    finalTotal: script.finalTotal,
    learner: {
      id: script.learner.id,
      learnerNumber: script.learner.learnerNumber,
      firstName: script.learner.firstName,
      lastName: script.learner.lastName,
      className: script.learner.className,
    },
    questionMarks: script.questionMarks,
  }));

  const questions: QuestionRow[] = assessment.questions.map((q) => ({
    id: q.id,
    questionNumber: q.questionNumber,
    marks: q.marks,
    topic: q.topic,
    cognitiveLevel: q.cognitiveLevel,
    difficulty: q.difficulty,
  }));

  const learners = scripts.map((script) => {
    const captured = capturedByLearner.get(script.learner.id);
    const effectiveFinal =
      captured?.finalMark ?? script.finalTotal;
    const percentage =
      captured?.finalPercentage ??
      learnerPercentage(effectiveFinal, totalMarks);
    const perQuestionMarks = questions.map((question) => {
      const mark = script.questionMarks.find(
        (m) => m.assessmentQuestionId === question.id
      );
      return {
        questionId: question.id,
        questionNumber: question.questionNumber,
        maxMarks: question.marks,
        finalMark: mark?.finalMark ?? null,
        percentage: questionPercentage(mark?.finalMark ?? null, question.marks),
      };
    });

    return {
      scriptId: script.id,
      learnerId: script.learner.id,
      learnerNumber: script.learner.learnerNumber,
      learnerName: `${script.learner.firstName} ${script.learner.lastName}`.trim(),
      className: script.learner.className,
      finalTotal: effectiveFinal,
      percentage,
      status: script.status,
      passed:
        percentage != null ? percentage >= PASS_THRESHOLD_PERCENT : null,
      perQuestionMarks,
    };
  });

  const scoredLearners = learners.filter((l) => l.percentage != null);
  const percentages = scoredLearners.map((l) => l.percentage as number);
  const finalTotals = scoredLearners
    .map((l) => l.finalTotal)
    .filter((t): t is number => t != null);

  const summary = {
    totalLearners: learners.length,
    markedLearners: scoredLearners.length,
    classAverage:
      percentages.length > 0
        ? round1(percentages.reduce((sum, p) => sum + p, 0) / percentages.length)
        : null,
    highestMark: finalTotals.length > 0 ? Math.max(...finalTotals) : null,
    lowestMark: finalTotals.length > 0 ? Math.min(...finalTotals) : null,
    passRate:
      percentages.length > 0
        ? round1(
            (percentages.filter((p) => p >= PASS_THRESHOLD_PERCENT).length /
              percentages.length) *
              100
          )
        : null,
    distinctionCount: percentages.filter((p) => p >= 80).length,
    failureCount: percentages.filter((p) => p < PASS_THRESHOLD_PERCENT).length,
    passThresholdPercent: PASS_THRESHOLD_PERCENT,
    source: "LearnerAssessmentMark" as const,
  };

  const questionAnalysis = buildQuestionAnalysis(questions, scripts);

  const topicGroups = new Map<
    string,
    {
      topic: string;
      questionNumbers: string[];
      percentages: number[];
      strugglingLearnerIds: Set<string>;
    }
  >();

  for (const question of questionAnalysis) {
    const topic = question.topic?.trim() || "Unspecified";
    if (!topicGroups.has(topic)) {
      topicGroups.set(topic, {
        topic,
        questionNumbers: [],
        percentages: [],
        strugglingLearnerIds: new Set(),
      });
    }
    const group = topicGroups.get(topic)!;
    group.questionNumbers.push(question.questionNumber);
    if (question.averagePercentage != null) {
      group.percentages.push(question.averagePercentage);
    }

    for (const script of scripts) {
      const mark = script.questionMarks.find(
        (m) => m.questionNumber === question.questionNumber
      );
      const pct = questionPercentage(mark?.finalMark ?? null, question.maxMarks);
      if (pct != null && pct < PASS_THRESHOLD_PERCENT) {
        group.strugglingLearnerIds.add(script.learner.id);
      }
    }
  }

  const weakTopics = Array.from(topicGroups.values())
    .map((group) => ({
      topic: group.topic,
      averagePercentage:
        group.percentages.length > 0
          ? round1(
              group.percentages.reduce((sum, p) => sum + p, 0) /
                group.percentages.length
            )
          : null,
      learnersStruggling: group.strugglingLearnerIds.size,
      questionNumbers: group.questionNumbers,
    }))
    .sort((a, b) => (a.averagePercentage ?? 0) - (b.averagePercentage ?? 0));

  const cognitiveGrouped = groupByField(
    questionAnalysis.map((q) => ({
      ...q,
      groupKey: q.cognitiveLevel?.trim() || "Unspecified",
    }))
  );

  const cognitiveLevelAnalysis = {
    groups: cognitiveGrouped.map((g) => ({
      cognitiveLevel: g.key,
      averagePercentage: g.averagePercentage,
      questionCount: g.items.length,
      questionNumbers: g.items.map((q) => q.questionNumber),
    })),
    weakestCognitiveLevel:
      cognitiveGrouped.length > 0
        ? cognitiveGrouped.reduce((weakest, current) =>
            (current.averagePercentage ?? 101) < (weakest.averagePercentage ?? 101)
              ? current
              : weakest
          ).key
        : null,
    strongestCognitiveLevel:
      cognitiveGrouped.length > 0
        ? cognitiveGrouped.reduce((strongest, current) =>
            (current.averagePercentage ?? -1) > (strongest.averagePercentage ?? -1)
              ? current
              : strongest
          ).key
        : null,
  };

  const difficultyGrouped = groupByField(
    questionAnalysis.map((q) => ({
      ...q,
      groupKey: q.difficulty?.trim() || "Unspecified",
    }))
  );

  const difficultyAnalysis = {
    groups: difficultyGrouped.map((g) => ({
      difficulty: g.key,
      averagePercentage: g.averagePercentage,
      questionCount: g.items.length,
      questionNumbers: g.items.map((q) => q.questionNumber),
    })),
  };

  const learnersAtRisk = learners
    .filter(
      (l) =>
        l.percentage != null && l.percentage < PASS_THRESHOLD_PERCENT
    )
    .map((l) => ({
      scriptId: l.scriptId,
      learnerId: l.learnerId,
      learnerNumber: l.learnerNumber,
      learnerName: l.learnerName,
      className: l.className,
      finalTotal: l.finalTotal,
      percentage: l.percentage,
      status: l.status,
    }))
    .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));

  const viewerScope = resolveViewerScope(
    access,
    workspaceId,
    assessment.creatorTeacherId
  );

  const publishableStatuses: AssessmentStatus[] = [
    AssessmentStatus.MARKED,
    AssessmentStatus.APPROVED,
    AssessmentStatus.HOD_REVIEW,
  ];
  const isPublished = assessment.status === AssessmentStatus.PUBLISHED;

  const publishing = {
    isPublished,
    publishedAt: assessment.publishedAt,
    resultsPublishRequestedAt: assessment.resultsPublishRequestedAt,
    canRequestPublish:
      !isPublished &&
      publishableStatuses.includes(assessment.status) &&
      !assessment.resultsPublishRequestedAt &&
      assessment.creatorTeacherId === access.userId,
    canPublish:
      hasPermission(access, workspaceId, PERMISSIONS.RESULTS_PUBLISH) &&
      !isPublished &&
      publishableStatuses.includes(assessment.status),
    canReopen:
      hasPermission(access, workspaceId, PERMISSIONS.RESULTS_REOPEN) && isPublished,
    isReadOnly: isPublished,
  };

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      totalMarks: assessment.totalMarks,
      status: assessment.status,
      grade: assessment.grade,
      subject: assessment.subject,
      creatorTeacher: assessment.creatorTeacher,
      publishedAt: assessment.publishedAt,
      resultsPublishRequestedAt: assessment.resultsPublishRequestedAt,
    },
    summary,
    learners,
    questionAnalysis,
    weakTopics,
    cognitiveLevelAnalysis,
    difficultyAnalysis,
    learnersAtRisk,
    viewerScope,
    canExport: canExportResults(access, workspaceId, assessment.creatorTeacherId),
    publishing,
    analyticsSnapshot: parseAnalyticsSnapshot(assessment.analyticsSnapshot),
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function getAssessmentResultsCsv(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
): Promise<string> {
  const results = await getAssessmentResults(assessmentId, workspaceId, access);

  if (!results.canExport) {
    throw new ResultsError("You do not have permission to export these results", 403);
  }

  const questionHeaders = results.questionAnalysis.map(
    (q) => `Q${q.questionNumber}`
  );

  const header = [
    "Learner Number",
    "Learner Name",
    "Class",
    "Total",
    "Percentage",
    "Status",
    ...questionHeaders,
  ].join(",");

  const rows = results.learners.map((learner) => {
    const perQuestion = results.questionAnalysis.map((q) => {
      const mark = learner.perQuestionMarks.find(
        (m) => m.questionId === q.questionId
      );
      return mark?.finalMark ?? "";
    });

    return [
      csvEscape(learner.learnerNumber),
      csvEscape(learner.learnerName),
      csvEscape(learner.className),
      csvEscape(learner.finalTotal),
      csvEscape(learner.percentage != null ? `${learner.percentage}%` : ""),
      csvEscape(learner.status),
      ...perQuestion.map((m) => csvEscape(m)),
    ].join(",");
  });

  const meta = [
    `# Assessment: ${results.assessment.title}`,
    `# Total marks: ${results.assessment.totalMarks}`,
    `# Class average: ${results.summary.classAverage ?? "—"}%`,
    `# Pass rate: ${results.summary.passRate ?? "—"}%`,
    "",
  ];

  return [...meta, header, ...rows].join("\n");
}

export type AnalyticsSnapshot = {
  publishedAt: string;
  classAverage: number | null;
  passRate: number | null;
  highestMark: number | null;
  lowestMark: number | null;
  learnerCount: number;
  markedLearners: number;
  questionAnalysisSummary: Array<{
    questionNumber: string;
    maxMarks: number;
    averageMark: number | null;
    averagePercentage: number | null;
    fullMarksCount: number;
    belowFiftyCount: number;
    topic: string | null;
    cognitiveLevel: string | null;
    difficulty: string | null;
  }>;
  weakTopics: Array<{
    topic: string;
    averagePercentage: number | null;
    learnersStruggling: number;
    questionNumbers: string[];
  }>;
  cognitiveLevelSummary: {
    groups: Array<{
      cognitiveLevel: string;
      averagePercentage: number | null;
      questionCount: number;
      questionNumbers: string[];
    }>;
    weakestCognitiveLevel: string | null;
    strongestCognitiveLevel: string | null;
  };
  difficultySummary: {
    groups: Array<{
      difficulty: string;
      averagePercentage: number | null;
      questionCount: number;
      questionNumbers: string[];
    }>;
  };
  learnersAtRiskCount: number;
};

type ResultsPayloadForSnapshot = {
  summary: {
    classAverage: number | null;
    passRate: number | null;
    highestMark: number | null;
    lowestMark: number | null;
    totalLearners: number;
    markedLearners: number;
  };
  questionAnalysis: Array<{
    questionNumber: string;
    maxMarks: number;
    averageMark: number | null;
    averagePercentage: number | null;
    fullMarksCount: number;
    belowFiftyCount: number;
    topic: string | null;
    cognitiveLevel: string | null;
    difficulty: string | null;
  }>;
  weakTopics: AnalyticsSnapshot["weakTopics"];
  cognitiveLevelAnalysis: AnalyticsSnapshot["cognitiveLevelSummary"];
  difficultyAnalysis: AnalyticsSnapshot["difficultySummary"];
  learnersAtRisk: unknown[];
};

export function buildAnalyticsSnapshot(
  results: ResultsPayloadForSnapshot,
  publishedAt: Date
): AnalyticsSnapshot {
  return {
    publishedAt: publishedAt.toISOString(),
    classAverage: results.summary.classAverage,
    passRate: results.summary.passRate,
    highestMark: results.summary.highestMark,
    lowestMark: results.summary.lowestMark,
    learnerCount: results.summary.totalLearners,
    markedLearners: results.summary.markedLearners,
    questionAnalysisSummary: results.questionAnalysis.map((q) => ({
      questionNumber: q.questionNumber,
      maxMarks: q.maxMarks,
      averageMark: q.averageMark,
      averagePercentage: q.averagePercentage,
      fullMarksCount: q.fullMarksCount,
      belowFiftyCount: q.belowFiftyCount,
      topic: q.topic,
      cognitiveLevel: q.cognitiveLevel,
      difficulty: q.difficulty,
    })),
    weakTopics: results.weakTopics,
    cognitiveLevelSummary: results.cognitiveLevelAnalysis,
    difficultySummary: results.difficultyAnalysis,
    learnersAtRiskCount: results.learnersAtRisk.length,
  };
}

export function parseAnalyticsSnapshot(snapshot: unknown): AnalyticsSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  return snapshot as AnalyticsSnapshot;
}
