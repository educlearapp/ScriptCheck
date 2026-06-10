import { AssessmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  canAccessResults,
  parseAnalyticsSnapshot,
  ResultsError,
} from "./assessmentResults";
import { UserAccessContext } from "./permissions";

export async function getPublishedResultsView(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      workspace: { select: { id: true, name: true, type: true } },
      curriculum: { select: { id: true, code: true, name: true } },
      phase: { select: { id: true, code: true, name: true } },
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      creatorTeacher: { select: { id: true, fullName: true } },
      learnerScripts: {
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
        orderBy: { scriptNumber: "asc" },
      },
    },
  });

  if (!assessment) {
    throw new ResultsError("Assessment not found", 404);
  }

  if (!canAccessResults(access, workspaceId, assessment.creatorTeacherId)) {
    throw new ResultsError("You do not have permission to view these results", 403);
  }

  if (assessment.status !== AssessmentStatus.PUBLISHED) {
    throw new ResultsError("Results are not published yet", 404);
  }

  const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);

  const learners = assessment.learnerScripts.map((script) => {
    const finalTotal = script.finalTotal;
    const percentage =
      finalTotal != null && assessment.totalMarks > 0
        ? Math.round((finalTotal / assessment.totalMarks) * 1000) / 10
        : null;
    return {
      scriptId: script.id,
      learnerId: script.learner.id,
      learnerNumber: script.learner.learnerNumber,
      learnerName: `${script.learner.firstName} ${script.learner.lastName}`.trim(),
      className: script.learner.className,
      finalTotal: script.finalTotal,
      percentage,
      status: script.status,
      passed: percentage != null ? percentage >= 50 : null,
    };
  });

  return {
    portalReady: true,
    readOnly: true,
    assessmentId: assessment.id,
    publishedAt: assessment.publishedAt,
    workspace: assessment.workspace,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      totalMarks: assessment.totalMarks,
      status: assessment.status,
      curriculum: assessment.curriculum,
      phase: assessment.phase,
      grade: assessment.grade,
      subject: assessment.subject,
      teacher: assessment.creatorTeacher,
    },
    summary: snapshot
      ? {
          classAverage: snapshot.classAverage,
          passRate: snapshot.passRate,
          highestMark: snapshot.highestMark,
          lowestMark: snapshot.lowestMark,
          learnerCount: snapshot.learnerCount,
          markedLearners: snapshot.markedLearners,
          learnersAtRiskCount: snapshot.learnersAtRiskCount,
        }
      : null,
    questionAnalysis: snapshot?.questionAnalysisSummary ?? [],
    weakTopics: snapshot?.weakTopics ?? [],
    cognitiveLevelSummary: snapshot?.cognitiveLevelSummary ?? null,
    difficultySummary: snapshot?.difficultySummary ?? null,
    learners,
  };
}
