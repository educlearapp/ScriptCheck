import { LearnerScriptStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/** Teacher marking complete and all later pipeline statuses (except returned). */
export const RESULTS_MARKED_SCRIPT_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.MARKED,
  LearnerScriptStatus.MODERATION,
  LearnerScriptStatus.MODERATED,
  LearnerScriptStatus.FINALISED,
  LearnerScriptStatus.SUBMITTED_TO_HOD,
  LearnerScriptStatus.HOD_REVIEW,
  LearnerScriptStatus.APPROVED,
];

/** Scripts still needing teacher completion / review before send. */
export const RESULTS_AWAITING_TEACHER_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.NOT_MARKED,
  LearnerScriptStatus.IN_PROGRESS,
  LearnerScriptStatus.UPLOADED,
  LearnerScriptStatus.MARKING,
  LearnerScriptStatus.RETURNED_TO_TEACHER,
];

export type AssessmentResultsSummaryLive = {
  learnerPaperCount: number;
  markedCount: number;
  awaitingReviewCount: number;
  classAverage: number | null;
  highestMark: number | null;
  lowestMark: number | null;
  /** Percentage representation for highest/lowest (aligned with classAverage). */
  markUnit: "percentage";
};

export type PublishStatusDerived = "PUBLISHED" | "REQUESTED" | "NOT_PUBLISHED";

export function derivePublishStatus(input: {
  publishedAt: Date | string | null;
  resultsPublishRequestedAt: Date | string | null;
  status?: string;
}): PublishStatusDerived {
  if (input.publishedAt != null || input.status === "PUBLISHED") return "PUBLISHED";
  if (input.resultsPublishRequestedAt != null) return "REQUESTED";
  return "NOT_PUBLISHED";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function emptyResultsSummary(): AssessmentResultsSummaryLive {
  return {
    learnerPaperCount: 0,
    markedCount: 0,
    awaitingReviewCount: 0,
    classAverage: null,
    highestMark: null,
    lowestMark: null,
    markUnit: "percentage",
  };
}

/** Pure helper — apply one status-count row into a live summary (testable without DB). */
export function applyStatusCountRow(
  summary: AssessmentResultsSummaryLive,
  status: LearnerScriptStatus | string,
  count: number
): AssessmentResultsSummaryLive {
  const next = { ...summary };
  next.learnerPaperCount += count;
  if ((RESULTS_MARKED_SCRIPT_STATUSES as string[]).includes(status)) {
    next.markedCount += count;
  }
  if ((RESULTS_AWAITING_TEACHER_STATUSES as string[]).includes(status)) {
    next.awaitingReviewCount += count;
  }
  return next;
}

/** Pure helper — apply percentage aggregates; null when no eligible marks. */
export function applyPercentageAggs(
  summary: AssessmentResultsSummaryLive,
  aggs: {
    avg: number | null;
    max: number | null;
    min: number | null;
  }
): AssessmentResultsSummaryLive {
  return {
    ...summary,
    classAverage: aggs.avg != null ? round1(aggs.avg) : null,
    highestMark: aggs.max != null ? round1(aggs.max) : null,
    lowestMark: aggs.min != null ? round1(aggs.min) : null,
  };
}

/**
 * Batched live script aggregates for Results list.
 * Query budget: 2 groupBy queries for N assessments (no N+1, no page/OCR loads).
 */
export async function loadAssessmentResultsSummaries(
  assessmentIds: string[]
): Promise<Map<string, AssessmentResultsSummaryLive>> {
  const map = new Map<string, AssessmentResultsSummaryLive>();
  for (const id of assessmentIds) {
    map.set(id, emptyResultsSummary());
  }
  if (assessmentIds.length === 0) return map;

  const [statusCounts, scoreAggs] = await Promise.all([
    prisma.learnerScript.groupBy({
      by: ["assessmentId", "status"],
      where: { assessmentId: { in: assessmentIds } },
      _count: { _all: true },
    }),
    prisma.learnerScript.groupBy({
      by: ["assessmentId"],
      where: {
        assessmentId: { in: assessmentIds },
        finalPercentage: { not: null },
      },
      _count: { _all: true },
      _avg: { finalPercentage: true },
      _max: { finalPercentage: true },
      _min: { finalPercentage: true },
    }),
  ]);

  for (const row of statusCounts) {
    const summary = map.get(row.assessmentId) ?? emptyResultsSummary();
    map.set(row.assessmentId, applyStatusCountRow(summary, row.status, row._count._all));
  }

  for (const row of scoreAggs) {
    const summary = map.get(row.assessmentId) ?? emptyResultsSummary();
    map.set(
      row.assessmentId,
      applyPercentageAggs(summary, {
        avg: row._avg.finalPercentage,
        max: row._max.finalPercentage,
        min: row._min.finalPercentage,
      })
    );
  }

  return map;
}

/** Prefer live script aggregates; fall back to analyticsSnapshot when no scripts. */
export function mergeLiveSummaryWithSnapshot(
  live: AssessmentResultsSummaryLive,
  snapshot: {
    classAverage?: number | null;
    learnerCount?: number | null;
    highestMark?: number | null;
    lowestMark?: number | null;
  } | null
): AssessmentResultsSummaryLive {
  if (live.learnerPaperCount > 0) return live;

  // No scripts yet — keep zeros for counts; averages stay null (not false 0).
  return {
    ...live,
    classAverage: snapshot?.classAverage ?? null,
    // Snapshot highest/lowest are raw marks — omit on empty script list rather than mix units.
    highestMark: null,
    lowestMark: null,
  };
}

export type { Prisma };
