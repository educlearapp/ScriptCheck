export const MARKING_PACK_METADATA = { markingPack: true } as const;

export const QUICK_SCAN_MEMO_BLOCKER =
  "No memo or answers detected. Upload memo before AI marking.";

const PLACEHOLDER_QUESTION_RE = /quick scan placeholder/i;

export function isMarkingPackAssessment(assessment: { aiMetadata?: unknown }): boolean {
  if (!assessment.aiMetadata || typeof assessment.aiMetadata !== "object") return false;
  return (assessment.aiMetadata as Record<string, unknown>).markingPack === true;
}

export function isQuickScanPlaceholderQuestion(questionText: string): boolean {
  return PLACEHOLDER_QUESTION_RE.test(questionText);
}
