/** Prefer batch analytics when a script batch is in scope. */
export function getModerationReviewPath(opts: {
  assessmentId: string;
  batchId?: string | null;
  type?: string;
}): string {
  if (opts.batchId) {
    return `/script-batches/${opts.batchId}/analytics`;
  }
  return `/assessments/${opts.assessmentId}`;
}
