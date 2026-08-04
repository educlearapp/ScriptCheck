/**
 * Results list display helpers (Phase 1B).
 * Missing values render as em dash — never a false 0 for averages/extremes.
 */

export function formatResultsPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export function formatResultsCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

export function formatResultsPublishStatus(input: {
  publishStatus?: "PUBLISHED" | "REQUESTED" | "NOT_PUBLISHED" | null;
  publishedAt?: string | null;
  resultsPublishRequestedAt?: string | null;
}): string {
  if (input.publishStatus === "PUBLISHED" || input.publishedAt) return "Published";
  if (input.publishStatus === "REQUESTED" || input.resultsPublishRequestedAt) {
    return "Asked to publish";
  }
  return "Not published";
}

export function markedProgressLabel(
  markedCount: number | null | undefined,
  learnerPaperCount: number | null | undefined
): string {
  if (markedCount == null || learnerPaperCount == null) return "—";
  return `${markedCount} of ${learnerPaperCount} marked`;
}

/** Pure mirrors of backend resultsListSummary status rules for frontend tests. */
export const RESULTS_MARKED_STATUSES = [
  "MARKED",
  "MODERATION",
  "MODERATED",
  "FINALISED",
  "SUBMITTED_TO_HOD",
  "HOD_REVIEW",
  "APPROVED",
] as const;

export const RESULTS_AWAITING_STATUSES = [
  "NOT_MARKED",
  "IN_PROGRESS",
  "UPLOADED",
  "MARKING",
  "RETURNED_TO_TEACHER",
] as const;

export type ResultsSummaryCounts = {
  learnerPaperCount: number;
  markedCount: number;
  awaitingReviewCount: number;
  classAverage: number | null;
  highestMark: number | null;
  lowestMark: number | null;
};

export function summarizeScriptStatuses(
  statuses: string[],
  percentages: Array<number | null>
): ResultsSummaryCounts {
  let markedCount = 0;
  let awaitingReviewCount = 0;
  for (const status of statuses) {
    if ((RESULTS_MARKED_STATUSES as readonly string[]).includes(status)) markedCount += 1;
    if ((RESULTS_AWAITING_STATUSES as readonly string[]).includes(status)) awaitingReviewCount += 1;
  }
  const eligible = percentages.filter((p): p is number => p != null);
  const classAverage =
    eligible.length === 0
      ? null
      : Math.round((eligible.reduce((a, b) => a + b, 0) / eligible.length) * 10) / 10;
  return {
    learnerPaperCount: statuses.length,
    markedCount,
    awaitingReviewCount,
    classAverage,
    highestMark: eligible.length ? Math.max(...eligible) : null,
    lowestMark: eligible.length ? Math.min(...eligible) : null,
  };
}

export function clampMarkInput(raw: string, maxMarks: number): string | null {
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > maxMarks) return null;
  return raw;
}
