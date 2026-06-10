import { AssessmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  buildAnalyticsSnapshot,
  getAssessmentResults,
  ResultsError,
} from "./assessmentResults";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";

const PUBLISHABLE_STATUSES: AssessmentStatus[] = [
  AssessmentStatus.MARKED,
  AssessmentStatus.APPROVED,
  AssessmentStatus.HOD_REVIEW,
];

export function isResultsPublished(status: AssessmentStatus): boolean {
  return status === AssessmentStatus.PUBLISHED;
}

export function canRequestResultsPublish(
  access: UserAccessContext,
  workspaceId: string,
  assessment: {
    creatorTeacherId: string;
    status: AssessmentStatus;
    resultsPublishRequestedAt: Date | null;
  }
): boolean {
  if (isResultsPublished(assessment.status)) return false;
  if (!PUBLISHABLE_STATUSES.includes(assessment.status)) return false;
  if (assessment.resultsPublishRequestedAt) return false;
  return assessment.creatorTeacherId === access.userId;
}

export function canPublishResults(
  access: UserAccessContext,
  workspaceId: string,
  assessment: { status: AssessmentStatus }
): boolean {
  if (!hasPermission(access, workspaceId, PERMISSIONS.RESULTS_PUBLISH)) {
    return false;
  }
  if (isResultsPublished(assessment.status)) return false;
  return PUBLISHABLE_STATUSES.includes(assessment.status);
}

export function canReopenResults(
  access: UserAccessContext,
  workspaceId: string,
  assessment: { status: AssessmentStatus }
): boolean {
  if (!hasPermission(access, workspaceId, PERMISSIONS.RESULTS_REOPEN)) {
    return false;
  }
  return assessment.status === AssessmentStatus.PUBLISHED;
}

async function loadAssessmentForPublishing(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      learnerScripts: { select: { id: true } },
    },
  });

  if (!assessment) {
    throw new ResultsError("Assessment not found", 404);
  }

  return assessment;
}

export async function requestResultsPublish(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const assessment = await loadAssessmentForPublishing(assessmentId, workspaceId);

  if (!canRequestResultsPublish(access, workspaceId, assessment)) {
    throw new ResultsError("Cannot request publish for this assessment", 403);
  }

  if (assessment.learnerScripts.length === 0) {
    throw new ResultsError("Add learner scripts before requesting publish", 400);
  }

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      resultsPublishRequestedAt: new Date(),
      status:
        assessment.status === AssessmentStatus.APPROVED
          ? AssessmentStatus.HOD_REVIEW
          : assessment.status,
    },
    select: {
      id: true,
      status: true,
      resultsPublishRequestedAt: true,
      publishedAt: true,
    },
  });

  return updated;
}

export async function publishAssessmentResults(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const assessment = await loadAssessmentForPublishing(assessmentId, workspaceId);

  if (!canPublishResults(access, workspaceId, assessment)) {
    throw new ResultsError("Cannot publish results for this assessment", 403);
  }

  if (assessment.learnerScripts.length === 0) {
    throw new ResultsError("No learner scripts to publish", 400);
  }

  const results = await getAssessmentResults(assessmentId, workspaceId, access);

  if (results.summary.markedLearners === 0) {
    throw new ResultsError("At least one learner must be marked before publishing", 400);
  }

  const publishedAt = new Date();
  const analyticsSnapshot = buildAnalyticsSnapshot(results, publishedAt);

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: AssessmentStatus.PUBLISHED,
      publishedAt,
      resultsPublishRequestedAt: null,
      analyticsSnapshot,
    },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      resultsPublishRequestedAt: true,
      analyticsSnapshot: true,
    },
  });

  return { assessment: updated, analyticsSnapshot };
}

export async function reopenAssessmentResults(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const assessment = await loadAssessmentForPublishing(assessmentId, workspaceId);

  if (!canReopenResults(access, workspaceId, assessment)) {
    throw new ResultsError("Cannot reopen results for this assessment", 403);
  }

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: AssessmentStatus.MARKED,
      publishedAt: null,
      resultsPublishRequestedAt: null,
    },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      resultsPublishRequestedAt: true,
    },
  });

  return updated;
}
