export const MARKING_PACK_METADATA = { markingPack: true } as const;

export const QUICK_SCAN_MEMO_BLOCKER =
  "No memo or answers detected. Upload memo before AI marking.";

export type ScriptFormat = "ANSWER_SHEET" | "ON_QUESTION_PAPER";

const PLACEHOLDER_QUESTION_RE = /quick scan placeholder/i;

export function isMarkingPackAssessment(assessment: { aiMetadata?: unknown }): boolean {
  if (!assessment.aiMetadata || typeof assessment.aiMetadata !== "object") return false;
  return (assessment.aiMetadata as Record<string, unknown>).markingPack === true;
}

function workbenchMeta(aiMetadata: unknown): Record<string, unknown> {
  if (!aiMetadata || typeof aiMetadata !== "object") return {};
  const wb = (aiMetadata as Record<string, unknown>).markingWorkbench;
  return wb && typeof wb === "object" ? { ...(wb as Record<string, unknown>) } : {};
}

export function getScriptFormat(assessment: { aiMetadata?: unknown }): ScriptFormat {
  const format = workbenchMeta(assessment.aiMetadata).scriptFormat;
  return format === "ON_QUESTION_PAPER" ? "ON_QUESTION_PAPER" : "ANSWER_SHEET";
}

export function mergeMarkingWorkbenchMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return {
    ...base,
    markingPack: true,
    markingWorkbench: {
      ...workbenchMeta(existing),
      ...patch,
    },
  };
}

export function isQuickScanPlaceholderQuestion(questionText: string): boolean {
  return PLACEHOLDER_QUESTION_RE.test(questionText);
}
