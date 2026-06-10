import { AssessmentStatus, AtRiskReason } from "@prisma/client";
import { prisma } from "../prisma";
import { PASS_THRESHOLD_PERCENT } from "./atRisk";
import { getRubricMarksForScript } from "./rubricMarking";
import { PortalError } from "../middleware/portalAuth";

const DISTINCTION_THRESHOLD = 80;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const AT_RISK_LABELS: Record<AtRiskReason, string> = {
  BELOW_THRESHOLD: "Below Average",
  CONSECUTIVE_DECLINE: "Declining Performance",
  MULTIPLE_FAILURES: "Multiple Failed Assessments",
};

const AT_RISK_GUIDANCE =
  "Please contact the school or teacher for support.";

async function loadLearner(workspaceId: string, learnerId: string) {
  const learner = await prisma.learner.findFirst({
    where: { id: learnerId, workspaceId, active: true },
    include: { grade: { select: { id: true, name: true } } },
  });
  if (!learner) throw new PortalError("Learner not found", 404);
  return learner;
}

async function loadPublishedMarks(workspaceId: string, learnerId: string) {
  return prisma.learnerAssessmentMark.findMany({
    where: {
      workspaceId,
      learnerId,
      assessment: { status: AssessmentStatus.PUBLISHED },
    },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          term: true,
          totalMarks: true,
          assessmentType: true,
          assessmentDate: true,
          dueDate: true,
          creatorTeacher: { select: { id: true, fullName: true } },
          subject: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
          analyticsSnapshot: true,
        },
      },
    },
    orderBy: { capturedAt: "desc" },
  });
}

export async function getPortalLearnerDashboard(
  workspaceId: string,
  learnerId: string
) {
  const learner = await loadLearner(workspaceId, learnerId);
  const marks = await loadPublishedMarks(workspaceId, learnerId);

  const percentages = marks
    .map((m) => m.finalPercentage)
    .filter((p): p is number => p != null);

  const subjectMap = new Map<string, number[]>();
  for (const m of marks) {
    if (m.finalPercentage == null) continue;
    const key = m.assessment.subject.name;
    const arr = subjectMap.get(key) ?? [];
    arr.push(m.finalPercentage);
    subjectMap.set(key, arr);
  }

  const subjectAverages = Array.from(subjectMap.entries()).map(([subject, pcts]) => ({
    subject,
    average: round1(pcts.reduce((s, p) => s + p, 0) / pcts.length),
    assessmentCount: pcts.length,
    atRisk: pcts.reduce((s, p) => s + p, 0) / pcts.length < PASS_THRESHOLD_PERCENT,
  }));

  const distinctions = percentages.filter((p) => p >= DISTINCTION_THRESHOLD).length;
  const subjectsAtRisk = subjectAverages.filter((s) => s.atRisk).length;

  const now = new Date();
  const upcoming = await prisma.assessment.findMany({
    where: {
      workspaceId,
      gradeId: learner.gradeId,
      status: { not: AssessmentStatus.PUBLISHED },
      OR: [
        { assessmentDate: { gte: now } },
        { dueDate: { gte: now } },
      ],
    },
    include: {
      subject: { select: { name: true } },
      creatorTeacher: { select: { fullName: true } },
    },
    orderBy: [{ assessmentDate: "asc" }, { dueDate: "asc" }],
    take: 8,
  });

  const recentAssessments = marks.slice(0, 8).map((m) => ({
    assessmentId: m.assessment.id,
    title: m.assessment.title,
    subject: m.assessment.subject.name,
    date: m.assessment.assessmentDate?.toISOString() ?? null,
    mark: m.finalMark,
    percentage: m.finalPercentage,
    totalMarks: m.assessment.totalMarks,
    passed: m.finalPercentage != null ? m.finalPercentage >= PASS_THRESHOLD_PERCENT : null,
  }));

  const trend =
    percentages.length >= 2
      ? {
          direction:
            percentages[0] > percentages[percentages.length - 1]
              ? ("improving" as const)
              : percentages[0] < percentages[percentages.length - 1]
                ? ("declining" as const)
                : ("stable" as const),
          change: round1(percentages[0] - percentages[percentages.length - 1]),
        }
      : null;

  const atRisk = await getPortalAtRisk(workspaceId, learnerId);

  return {
    learner: {
      id: learner.id,
      learnerNumber: learner.learnerNumber,
      firstName: learner.firstName,
      lastName: learner.lastName,
      fullName: `${learner.firstName} ${learner.lastName}`.trim(),
      className: learner.className,
      grade: learner.grade,
    },
    cards: {
      academicAverage:
        percentages.length > 0
          ? round1(percentages.reduce((s, p) => s + p, 0) / percentages.length)
          : null,
      assessmentsCompleted: marks.length,
      distinctions,
      subjectsAtRisk,
    },
    subjectAverages,
    recentAssessments,
    upcomingAssessments: upcoming.map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject.name,
      date: a.assessmentDate?.toISOString() ?? a.dueDate?.toISOString() ?? null,
      teacher: a.creatorTeacher.fullName,
    })),
    performanceTrend: trend,
    atRisk,
    attendancePlaceholder: null,
    readOnly: true,
  };
}

export async function getPortalParentDashboard(
  workspaceId: string,
  learnerIds: string[]
) {
  const summaries = await Promise.all(
    learnerIds.map(async (learnerId) => {
      const dash = await getPortalLearnerDashboard(workspaceId, learnerId);
      return {
        learner: dash.learner,
        currentAverage: dash.cards.academicAverage,
        assessmentsCompleted: dash.cards.assessmentsCompleted,
        distinctions: dash.cards.distinctions,
        subjectsAtRisk: dash.cards.subjectsAtRisk,
        recentResults: dash.recentAssessments.slice(0, 3),
        upcomingAssessments: dash.upcomingAssessments.slice(0, 3),
        atRisk: dash.atRisk,
      };
    })
  );

  return { learners: summaries, readOnly: true };
}

export async function getPortalAtRisk(workspaceId: string, learnerId: string) {
  const flags = await prisma.learnerAtRiskFlag.findMany({
    where: { workspaceId, learnerId, active: true },
    orderBy: { flaggedAt: "desc" },
  });

  if (flags.length === 0) {
    return { active: false, alerts: [], guidance: null };
  }

  const reasons = [...new Set(flags.map((f) => f.reason))];

  return {
    active: true,
    alerts: reasons.map((r) => ({
      reason: r,
      label: AT_RISK_LABELS[r],
    })),
    guidance: AT_RISK_GUIDANCE,
  };
}

export async function getPortalAssessmentDetail(
  workspaceId: string,
  learnerId: string,
  assessmentId: string
) {
  await loadLearner(workspaceId, learnerId);

  const mark = await prisma.learnerAssessmentMark.findFirst({
    where: {
      workspaceId,
      learnerId,
      assessmentId,
      assessment: { status: AssessmentStatus.PUBLISHED },
    },
    include: {
      assessment: {
        include: {
          subject: { select: { name: true } },
          creatorTeacher: { select: { fullName: true } },
        },
      },
    },
  });

  if (!mark) {
    throw new PortalError("Published result not found for this assessment", 404);
  }

  const allMarks = await prisma.learnerAssessmentMark.findMany({
    where: { workspaceId, assessmentId },
    select: { finalMark: true, finalPercentage: true },
  });

  const scored = allMarks.filter((m) => m.finalPercentage != null);
  const percentages = scored.map((m) => m.finalPercentage as number);
  const totals = scored.map((m) => m.finalMark).filter((t): t is number => t != null);

  const script = await prisma.learnerScript.findFirst({
    where: { assessmentId, learnerId, batch: { workspaceId } },
    include: {
      feedback: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  let rubricBreakdown: {
    templateName: string | null;
    criteria: Array<{
      name: string;
      maxMarks: number;
      mark: number | null;
      teacherComment: string | null;
      moderatorComment: string | null;
    }>;
    total: number | null;
    maxTotal: number | null;
    percentage: number | null;
  } | null = null;

  let teacherComments: string | null = null;
  let moderatorComments: string | null = null;

  if (script) {
    const feedback = script.feedback[0];
    teacherComments = feedback?.teacherFeedback ?? null;
    moderatorComments = feedback?.hodFeedback ?? null;

    try {
      const rubric = await getRubricMarksForScript(script.id, workspaceId);
      if (rubric.rubricTemplate && rubric.marks.length > 0) {
        rubricBreakdown = {
          templateName: rubric.rubricTemplate.name,
          criteria: rubric.marks.map((m) => ({
            name: m.name,
            maxMarks: m.maxMarks,
            mark: m.finalMark ?? m.teacherMark,
            teacherComment: m.teacherComment,
            moderatorComment: m.hodComment,
          })),
          total: rubric.totals?.finalTotal ?? null,
          maxTotal: rubric.rubricTemplate.totalMarks,
          percentage: rubric.totals?.percentage ?? null,
        };
      }
    } catch {
      // rubric optional
    }
  }

  return {
    assessment: {
      id: mark.assessment.id,
      title: mark.assessment.title,
      subject: mark.assessment.subject.name,
      date: mark.assessment.assessmentDate?.toISOString() ?? null,
      teacher: mark.assessment.creatorTeacher.fullName,
      totalMarks: mark.assessment.totalMarks,
    },
    result: {
      mark: mark.finalMark,
      percentage: mark.finalPercentage,
      comment: mark.comment,
      passed:
        mark.finalPercentage != null
          ? mark.finalPercentage >= PASS_THRESHOLD_PERCENT
          : null,
    },
    classStats: {
      classAverage:
        percentages.length > 0
          ? round1(percentages.reduce((s, p) => s + p, 0) / percentages.length)
          : null,
      highestMark: totals.length > 0 ? Math.max(...totals) : null,
      learnerCount: scored.length,
    },
    rubricBreakdown,
    teacherComments,
    moderatorComments,
    readOnly: true,
  };
}

export async function getPortalLearnerHistory(
  workspaceId: string,
  learnerId: string
) {
  const learner = await loadLearner(workspaceId, learnerId);
  const marks = await loadPublishedMarks(workspaceId, learnerId);

  const timeline = marks
    .slice()
    .reverse()
    .map((m) => ({
      assessmentId: m.assessment.id,
      title: m.assessment.title,
      term: m.assessment.term ?? "Unspecified",
      subject: m.assessment.subject.name,
      date: m.assessment.assessmentDate?.toISOString() ?? null,
      mark: m.finalMark,
      percentage: m.finalPercentage,
      totalMarks: m.assessment.totalMarks,
      passed:
        m.finalPercentage != null ? m.finalPercentage >= PASS_THRESHOLD_PERCENT : null,
    }));

  const termMap = new Map<string, { percentages: number[]; assessments: typeof timeline }>();
  for (const entry of timeline) {
    const termKey = entry.term;
    const bucket = termMap.get(termKey) ?? { percentages: [], assessments: [] };
    if (entry.percentage != null) bucket.percentages.push(entry.percentage);
    bucket.assessments.push(entry);
    termMap.set(termKey, bucket);
  }

  const terms = Array.from(termMap.entries()).map(([term, data]) => ({
    term,
    subjectAverages: (() => {
      const subMap = new Map<string, number[]>();
      for (const a of data.assessments) {
        if (a.percentage == null) continue;
        const arr = subMap.get(a.subject) ?? [];
        arr.push(a.percentage);
        subMap.set(a.subject, arr);
      }
      return Array.from(subMap.entries()).map(([subject, pcts]) => ({
        subject,
        average: round1(pcts.reduce((s, p) => s + p, 0) / pcts.length),
      }));
    })(),
    assessmentAverage:
      data.percentages.length > 0
        ? round1(data.percentages.reduce((s, p) => s + p, 0) / data.percentages.length)
        : null,
    assessmentCount: data.assessments.length,
    trend:
      data.percentages.length >= 2
        ? data.percentages[data.percentages.length - 1] > data.percentages[0]
          ? "up"
          : data.percentages[data.percentages.length - 1] < data.percentages[0]
            ? "down"
            : "stable"
        : null,
  }));

  const percentages = timeline
    .map((t) => t.percentage)
    .filter((p): p is number => p != null);

  return {
    learner: {
      id: learner.id,
      learnerNumber: learner.learnerNumber,
      firstName: learner.firstName,
      lastName: learner.lastName,
      grade: learner.grade,
    },
    overallAverage:
      percentages.length > 0
        ? round1(percentages.reduce((s, p) => s + p, 0) / percentages.length)
        : null,
    terms,
    timeline,
    readOnly: true,
  };
}

export async function getPortalAnalytics(
  workspaceId: string,
  learnerId: string
) {
  const history = await getPortalLearnerHistory(workspaceId, learnerId);

  const subjectTrends = new Map<string, Array<{ date: string | null; percentage: number }>>();
  for (const entry of history.timeline) {
    if (entry.percentage == null) continue;
    const arr = subjectTrends.get(entry.subject) ?? [];
    arr.push({ date: entry.date, percentage: entry.percentage });
    subjectTrends.set(entry.subject, arr);
  }

  const assessmentTrends = history.timeline
    .filter((t) => t.percentage != null)
    .map((t) => ({
      title: t.title,
      subject: t.subject,
      date: t.date,
      percentage: t.percentage as number,
    }));

  const gradeComparison = await prisma.learner.findFirst({
    where: { id: learnerId, workspaceId },
    select: { gradeId: true, grade: { select: { name: true } } },
  });

  let gradeAverage: number | null = null;
  if (gradeComparison) {
    const gradeMarks = await prisma.learnerAssessmentMark.findMany({
      where: {
        workspaceId,
        assessment: {
          status: AssessmentStatus.PUBLISHED,
          gradeId: gradeComparison.gradeId,
        },
        finalPercentage: { not: null },
      },
      select: { finalPercentage: true },
    });
    if (gradeMarks.length > 0) {
      gradeAverage = round1(
        gradeMarks.reduce((s, m) => s + (m.finalPercentage ?? 0), 0) / gradeMarks.length
      );
    }
  }

  const learnerAvg = history.overallAverage;
  const growth =
    assessmentTrends.length >= 2
      ? round1(
          assessmentTrends[assessmentTrends.length - 1].percentage -
            assessmentTrends[0].percentage
        )
      : null;

  return {
    subjectTrends: Array.from(subjectTrends.entries()).map(([subject, points]) => ({
      subject,
      points,
    })),
    assessmentTrends,
    performanceGrowth: growth,
    gradeComparison: {
      grade: gradeComparison?.grade.name ?? "Unknown",
      gradeAverage,
      learnerAverage: learnerAvg,
      difference:
        learnerAvg != null && gradeAverage != null
          ? round1(learnerAvg - gradeAverage)
          : null,
    },
    readOnly: true,
  };
}

export async function listPortalAssessments(
  workspaceId: string,
  learnerId: string
) {
  const marks = await loadPublishedMarks(workspaceId, learnerId);
  return marks.map((m) => ({
    assessmentId: m.assessment.id,
    title: m.assessment.title,
    subject: m.assessment.subject.name,
    date: m.assessment.assessmentDate?.toISOString() ?? null,
    mark: m.finalMark,
    percentage: m.finalPercentage,
    totalMarks: m.assessment.totalMarks,
    passed:
      m.finalPercentage != null ? m.finalPercentage >= PASS_THRESHOLD_PERCENT : null,
  }));
}
