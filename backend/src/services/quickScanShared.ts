export const MARKING_PACK_METADATA = { markingPack: true } as const;

export const QUICK_SCAN_MEMO_BLOCKER =
  "No memo or answers detected. Upload memo before AI marking.";

export const QUICK_SCAN_ON_PAPER_MEMO_BLOCKER =
  "Could not detect answers in the question paper. Include a memorandum or answers section on the question paper, or upload a memo separately.";

export type ScriptFormat = "ANSWER_SHEET" | "ON_QUESTION_PAPER";

/** Tony's three marking workflows — Options 1 & 2 use marking packs; Option 3 uses existing assessments. */
export type MarkingMode =
  | "QP_LEARNER_ONLY"
  | "QP_WITH_ANSWERS"
  | "SCRIPTCHECK_ASSESSMENT";

export type QuickScanMasterFiles = {
  questionPaper: boolean;
  memorandum: boolean;
};

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

export function getMarkingMode(assessment: { aiMetadata?: unknown }): MarkingMode {
  if (!isMarkingPackAssessment(assessment)) return "SCRIPTCHECK_ASSESSMENT";
  const mode = workbenchMeta(assessment.aiMetadata).markingMode;
  if (mode === "QP_WITH_ANSWERS") return "QP_WITH_ANSWERS";
  return "QP_LEARNER_ONLY";
}

export function requiresMemoForMarking(assessment: { aiMetadata?: unknown }): boolean {
  return getMarkingMode(assessment) === "QP_WITH_ANSWERS";
}

export function getScriptFormat(assessment: { aiMetadata?: unknown }): ScriptFormat {
  const format = workbenchMeta(assessment.aiMetadata).scriptFormat;
  return format === "ON_QUESTION_PAPER" ? "ON_QUESTION_PAPER" : "ANSWER_SHEET";
}

export function isOnQuestionPaperFormat(assessment: { aiMetadata?: unknown }): boolean {
  return getScriptFormat(assessment) === "ON_QUESTION_PAPER";
}

/** Question paper alone can supply expected answers (Option 2). */
export function usesQuestionPaperAsMemoSource(
  assessment: { aiMetadata?: unknown },
  masterFiles: QuickScanMasterFiles
): boolean {
  return (
    getMarkingMode(assessment) === "QP_WITH_ANSWERS" &&
    isOnQuestionPaperFormat(assessment) &&
    masterFiles.questionPaper &&
    !masterFiles.memorandum
  );
}

export function quickScanMemoBlockerMessage(
  assessment: { aiMetadata?: unknown },
  masterFiles: QuickScanMasterFiles
): string {
  if (usesQuestionPaperAsMemoSource(assessment, masterFiles)) {
    return QUICK_SCAN_ON_PAPER_MEMO_BLOCKER;
  }
  return QUICK_SCAN_MEMO_BLOCKER;
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
