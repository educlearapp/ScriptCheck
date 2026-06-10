import { prisma } from "../prisma";
import { ResultsError, canAccessResults } from "./assessmentResults";
import { UserAccessContext } from "./permissions";
import { PASS_THRESHOLD_PERCENT } from "./atRisk";
import { logAudit } from "./auditLog";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const DISTINCTION_THRESHOLD = 80;

type CapturedMarkRow = {
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  finalMark: number | null;
  finalPercentage: number | null;
};

async function loadCapturedMarksForAssessment(
  assessmentId: string,
  workspaceId: string
): Promise<{
  assessment: {
    id: string;
    title: string;
    term: string | null;
    totalMarks: number;
    creatorTeacherId: string;
    subject: { id: string; name: string };
    grade: { id: string; name: string };
  };
  marks: CapturedMarkRow[];
}> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: {
      id: true,
      title: true,
      term: true,
      totalMarks: true,
      creatorTeacherId: true,
      subject: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
    },
  });
  if (!assessment) throw new ResultsError("Assessment not found", 404);

  const captured = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, assessmentId },
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
  });

  const marks: CapturedMarkRow[] = captured.map((m) => ({
    learnerId: m.learner.id,
    learnerNumber: m.learner.learnerNumber,
    learnerName: `${m.learner.firstName} ${m.learner.lastName}`.trim(),
    className: m.learner.className,
    finalMark: m.finalMark,
    finalPercentage: m.finalPercentage,
  }));

  if (marks.length === 0) {
    const scripts = await prisma.learnerScript.findMany({
      where: { assessmentId, batch: { workspaceId } },
      include: { learner: true },
    });
    for (const script of scripts) {
      if (script.finalTotal == null && script.finalPercentage == null) continue;
      marks.push({
        learnerId: script.learner.id,
        learnerNumber: script.learner.learnerNumber,
        learnerName: `${script.learner.firstName} ${script.learner.lastName}`.trim(),
        className: script.learner.className,
        finalMark: script.finalTotal,
        finalPercentage:
          script.finalPercentage ??
          (assessment.totalMarks > 0 && script.finalTotal != null
            ? round1((script.finalTotal / assessment.totalMarks) * 100)
            : null),
      });
    }
  }

  return { assessment, marks };
}

function computeSummary(marks: CapturedMarkRow[]) {
  const scored = marks.filter((m) => m.finalPercentage != null);
  const percentages = scored.map((m) => m.finalPercentage as number);
  const totals = scored
    .map((m) => m.finalMark)
    .filter((t): t is number => t != null);

  return {
    totalLearners: marks.length,
    markedLearners: scored.length,
    classAverage:
      percentages.length > 0
        ? round1(percentages.reduce((s, p) => s + p, 0) / percentages.length)
        : null,
    highestMark: totals.length > 0 ? Math.max(...totals) : null,
    lowestMark: totals.length > 0 ? Math.min(...totals) : null,
    passRate:
      percentages.length > 0
        ? round1(
            (percentages.filter((p) => p >= PASS_THRESHOLD_PERCENT).length /
              percentages.length) *
              100
          )
        : null,
    distinctionCount: percentages.filter((p) => p >= DISTINCTION_THRESHOLD).length,
    failureCount: percentages.filter((p) => p < PASS_THRESHOLD_PERCENT).length,
    passThresholdPercent: PASS_THRESHOLD_PERCENT,
  };
}

function buildDistribution(percentages: number[]) {
  const bands = [
    { label: "0–29%", min: 0, max: 29, count: 0 },
    { label: "30–49%", min: 30, max: 49, count: 0 },
    { label: "50–69%", min: 50, max: 69, count: 0 },
    { label: "70–79%", min: 70, max: 79, count: 0 },
    { label: "80–100%", min: 80, max: 100, count: 0 },
  ];

  for (const pct of percentages) {
    const band = bands.find((b) => pct >= b.min && pct <= b.max);
    if (band) band.count++;
  }

  const maxCount = Math.max(...bands.map((b) => b.count), 1);
  return bands.map((b) => ({
    ...b,
    percentage: percentages.length > 0 ? round1((b.count / percentages.length) * 100) : 0,
    barWidth: round1((b.count / maxCount) * 100),
  }));
}

export async function getClassAnalysis(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext,
  actorId?: string
) {
  const { assessment, marks } = await loadCapturedMarksForAssessment(
    assessmentId,
    workspaceId
  );

  if (!canAccessResults(access, workspaceId, assessment.creatorTeacherId)) {
    throw new ResultsError("You do not have permission to view this analysis", 403);
  }

  const overall = computeSummary(marks);
  const percentages = marks
    .filter((m) => m.finalPercentage != null)
    .map((m) => m.finalPercentage as number);

  const classGroups = new Map<string, CapturedMarkRow[]>();
  for (const mark of marks) {
    const key = mark.className?.trim() || "Unassigned";
    const group = classGroups.get(key) ?? [];
    group.push(mark);
    classGroups.set(key, group);
  }

  const classes = Array.from(classGroups.entries()).map(([className, classMarks]) => ({
    className,
    ...computeSummary(classMarks),
    distribution: buildDistribution(
      classMarks
        .filter((m) => m.finalPercentage != null)
        .map((m) => m.finalPercentage as number)
    ),
  }));

  const topPerformer = marks
    .filter((m) => m.finalPercentage != null)
    .sort((a, b) => (b.finalPercentage ?? 0) - (a.finalPercentage ?? 0))[0] ?? null;

  const lowestPerformer = marks
    .filter((m) => m.finalPercentage != null)
    .sort((a, b) => (a.finalPercentage ?? 0) - (b.finalPercentage ?? 0))[0] ?? null;

  if (actorId) {
    await logAudit({
      action: "ANALYSIS_GENERATED",
      actorId,
      workspaceId,
      metadata: { type: "class", assessmentId },
    });
  }

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      grade: assessment.grade,
      term: assessment.term,
    },
    summary: overall,
    distribution: buildDistribution(percentages),
    performanceBands: buildDistribution(percentages),
    classes,
    topPerformer,
    lowestPerformer,
    source: "LearnerAssessmentMark" as const,
  };
}

export async function getSubjectAnalysis(
  workspaceId: string,
  access: UserAccessContext,
  filters: { subjectId?: string; term?: string; assessmentId?: string },
  actorId?: string
) {
  const assessments = await prisma.assessment.findMany({
    where: {
      workspaceId,
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.term ? { term: filters.term } : {}),
      ...(filters.assessmentId ? { id: filters.assessmentId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
    },
    orderBy: { assessmentDate: "asc" },
  });

  const assessmentStats = [];
  for (const assessment of assessments) {
    if (!canAccessResults(access, workspaceId, assessment.creatorTeacherId)) continue;

    const { marks } = await loadCapturedMarksForAssessment(assessment.id, workspaceId);
    const summary = computeSummary(marks);
    assessmentStats.push({
      assessmentId: assessment.id,
      title: assessment.title,
      term: assessment.term,
      grade: assessment.grade,
      subject: assessment.subject,
      assessmentDate: assessment.assessmentDate?.toISOString() ?? null,
      ...summary,
    });
  }

  const subjectAverages = assessmentStats
    .filter((a) => a.classAverage != null)
    .map((a) => a.classAverage as number);

  const trend =
    assessmentStats.length >= 2
      ? {
          direction:
            (assessmentStats[assessmentStats.length - 1].classAverage ?? 0) >
            (assessmentStats[0].classAverage ?? 0)
              ? ("improving" as const)
              : (assessmentStats[assessmentStats.length - 1].classAverage ?? 0) <
                  (assessmentStats[0].classAverage ?? 0)
                ? ("declining" as const)
                : ("stable" as const),
          dataPoints: assessmentStats.map((a) => ({
            assessmentId: a.assessmentId,
            title: a.title,
            average: a.classAverage,
            date: a.assessmentDate,
          })),
        }
      : null;

  if (actorId) {
    await logAudit({
      action: "ANALYSIS_GENERATED",
      actorId,
      workspaceId,
      metadata: { type: "subject", subjectId: filters.subjectId, term: filters.term },
    });
  }

  return {
    subjectAverage:
      subjectAverages.length > 0
        ? round1(subjectAverages.reduce((s, v) => s + v, 0) / subjectAverages.length)
        : null,
    assessments: assessmentStats,
    trend,
    source: "LearnerAssessmentMark" as const,
  };
}

export async function getGradeAnalysis(
  workspaceId: string,
  gradeId: string,
  access: UserAccessContext,
  actorId?: string
) {
  const assessments = await prisma.assessment.findMany({
    where: { workspaceId, gradeId },
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  const classMap = new Map<
    string,
    { className: string; percentages: number[]; learnerCount: number }
  >();

  for (const assessment of assessments) {
    if (!canAccessResults(access, workspaceId, assessment.creatorTeacherId)) continue;

    const { marks } = await loadCapturedMarksForAssessment(assessment.id, workspaceId);
    for (const mark of marks) {
      if (mark.finalPercentage == null) continue;
      const className = mark.className?.trim() || "Unassigned";
      const entry = classMap.get(className) ?? {
        className,
        percentages: [],
        learnerCount: 0,
      };
      entry.percentages.push(mark.finalPercentage);
      entry.learnerCount++;
      classMap.set(className, entry);
    }
  }

  const classes = Array.from(classMap.values())
    .map((c) => ({
      className: c.className,
      learnerCount: c.learnerCount,
      averagePercentage:
        c.percentages.length > 0
          ? round1(c.percentages.reduce((s, p) => s + p, 0) / c.percentages.length)
          : null,
      passRate:
        c.percentages.length > 0
          ? round1(
              (c.percentages.filter((p) => p >= PASS_THRESHOLD_PERCENT).length /
                c.percentages.length) *
                100
            )
          : null,
      atRisk: (() => {
        const avg =
          c.percentages.length > 0
            ? c.percentages.reduce((s, p) => s + p, 0) / c.percentages.length
            : null;
        return avg != null && avg < PASS_THRESHOLD_PERCENT;
      })(),
    }))
    .sort((a, b) => (b.averagePercentage ?? 0) - (a.averagePercentage ?? 0));

  const gradeAverages = classes
    .map((c) => c.averagePercentage)
    .filter((v): v is number => v != null);

  if (actorId) {
    await logAudit({
      action: "ANALYSIS_GENERATED",
      actorId,
      workspaceId,
      metadata: { type: "grade", gradeId },
    });
  }

  return {
    grade: assessments[0]?.grade ?? { id: gradeId, name: "Unknown" },
    gradeAverage:
      gradeAverages.length > 0
        ? round1(gradeAverages.reduce((s, v) => s + v, 0) / gradeAverages.length)
        : null,
    classes,
    topPerformingClass: classes[0] ?? null,
    atRiskClasses: classes.filter((c) => c.atRisk),
    source: "LearnerAssessmentMark" as const,
  };
}

export async function getLearnerPerformanceHistory(
  workspaceId: string,
  learnerId: string,
  access: UserAccessContext,
  actorId?: string
) {
  const learner = await prisma.learner.findFirst({
    where: { id: learnerId, workspaceId },
    include: { grade: { select: { id: true, name: true } } },
  });
  if (!learner) throw new ResultsError("Learner not found", 404);

  const marks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, learnerId },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          term: true,
          totalMarks: true,
          assessmentType: true,
          assessmentDate: true,
          creatorTeacherId: true,
          subject: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { capturedAt: "asc" },
  });

  const accessible = marks.filter((m) =>
    canAccessResults(access, workspaceId, m.assessment.creatorTeacherId)
  );

  const timeline = accessible.map((m) => ({
    id: m.id,
    assessmentId: m.assessment.id,
    title: m.assessment.title,
    term: m.assessment.term,
    subject: m.assessment.subject,
    grade: m.assessment.grade,
    assessmentType: m.assessment.assessmentType,
    assessmentDate: m.assessment.assessmentDate?.toISOString() ?? null,
    finalMark: m.finalMark,
    finalPercentage: m.finalPercentage,
    totalMarks: m.assessment.totalMarks,
    passed:
      m.finalPercentage != null ? m.finalPercentage >= PASS_THRESHOLD_PERCENT : null,
    capturedAt: m.capturedAt.toISOString(),
    source: m.source,
  }));

  const termMap = new Map<string, number[]>();
  const subjectMap = new Map<string, number[]>();
  for (const entry of timeline) {
    if (entry.finalPercentage == null) continue;
    const termKey = entry.term?.trim() || "Unspecified";
    const termPcts = termMap.get(termKey) ?? [];
    termPcts.push(entry.finalPercentage);
    termMap.set(termKey, termPcts);

    const subKey = entry.subject.name;
    const subPcts = subjectMap.get(subKey) ?? [];
    subPcts.push(entry.finalPercentage);
    subjectMap.set(subKey, subPcts);
  }

  const percentages = timeline
    .filter((t) => t.finalPercentage != null)
    .map((t) => t.finalPercentage as number);

  const trend =
    percentages.length >= 2
      ? {
          direction:
            percentages[percentages.length - 1] > percentages[0]
              ? ("improving" as const)
              : percentages[percentages.length - 1] < percentages[0]
                ? ("declining" as const)
                : ("stable" as const),
          change: round1(percentages[percentages.length - 1] - percentages[0]),
        }
      : null;

  if (actorId) {
    await logAudit({
      action: "ANALYSIS_GENERATED",
      actorId,
      workspaceId,
      metadata: { type: "learner_history", learnerId },
    });
  }

  return {
    learner: {
      id: learner.id,
      learnerNumber: learner.learnerNumber,
      firstName: learner.firstName,
      lastName: learner.lastName,
      className: learner.className,
      grade: learner.grade,
    },
    overallAverage:
      percentages.length > 0
        ? round1(percentages.reduce((s, p) => s + p, 0) / percentages.length)
        : null,
    assessmentCount: timeline.length,
    timeline,
    averageByTerm: Array.from(termMap.entries()).map(([term, pcts]) => ({
      term,
      average: round1(pcts.reduce((s, p) => s + p, 0) / pcts.length),
      assessmentCount: pcts.length,
    })),
    averageBySubject: Array.from(subjectMap.entries()).map(([subject, pcts]) => ({
      subject,
      average: round1(pcts.reduce((s, p) => s + p, 0) / pcts.length),
      assessmentCount: pcts.length,
    })),
    trend,
    source: "LearnerAssessmentMark" as const,
  };
}
