/**
 * Pure unit verification for Results list summary helpers (no DB writes).
 * Run after backend build: node backend/dist/scripts/verifyResultsListSummary.js
 */
import {
  applyPercentageAggs,
  applyStatusCountRow,
  derivePublishStatus,
  emptyResultsSummary,
  mergeLiveSummaryWithSnapshot,
} from "../services/resultsListSummary";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  let s = emptyResultsSummary();
  s = applyStatusCountRow(s, "UPLOADED", 3);
  s = applyStatusCountRow(s, "MARKED", 2);
  s = applyStatusCountRow(s, "SUBMITTED_TO_HOD", 1);
  assert(s.learnerPaperCount === 6, "paper count");
  assert(s.markedCount === 3, "marked count includes submitted");
  assert(s.awaitingReviewCount === 3, "awaiting");

  s = applyPercentageAggs(s, { avg: 66.66, max: 90, min: 40 });
  assert(s.classAverage === 66.7, "rounded average");
  assert(s.highestMark === 90, "highest %");
  assert(s.lowestMark === 40, "lowest %");

  const emptyScores = applyPercentageAggs(emptyResultsSummary(), {
    avg: null,
    max: null,
    min: null,
  });
  assert(emptyScores.classAverage === null, "null average");
  assert(emptyScores.highestMark === null, "null highest");

  assert(derivePublishStatus({ publishedAt: new Date(), resultsPublishRequestedAt: null }) === "PUBLISHED", "published");
  assert(derivePublishStatus({ publishedAt: null, resultsPublishRequestedAt: new Date() }) === "REQUESTED", "requested");
  assert(derivePublishStatus({ publishedAt: null, resultsPublishRequestedAt: null }) === "NOT_PUBLISHED", "not published");

  const merged = mergeLiveSummaryWithSnapshot(emptyResultsSummary(), {
    classAverage: 55,
    highestMark: 80,
    lowestMark: 20,
  });
  assert(merged.classAverage === 55, "snapshot average when no scripts");
  assert(merged.highestMark === null, "do not mix raw snapshot extremes");

  console.log("verifyResultsListSummary: PASS");
}

main();
