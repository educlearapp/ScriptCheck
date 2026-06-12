/** Prefer batch analytics when a script batch is in scope. */
export function getModerationReviewPath(opts: {
  assessmentId: string;
  batchId?: string | null;
  type?: string;
  /** Teacher sample review before DH submission. */
  sampleReview?: boolean;
}): string {
  if (opts.batchId) {
    return `/script-batches/${opts.batchId}/analytics`;
  }
  if (opts.sampleReview) {
    return `/assessments/${opts.assessmentId}/setup`;
  }
  return `/assessments/${opts.assessmentId}`;
}
