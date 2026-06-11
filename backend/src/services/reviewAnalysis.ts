import { AiBloomLevel } from "@prisma/client";
import type { AiGeneratedDraft, AiGeneratedQuestion } from "./aiAssessmentEngine";
import { bloomLevelLabel } from "./aiAssessmentQuality";
import type { FrameworkSlot, PaperBlueprint } from "./frameworkEngine";
import { validateDraftAgainstBlueprint } from "./frameworkEngine";

export type CognitiveOrder = "LOW" | "MIDDLE" | "HIGH";

export type CognitiveAnalysisRow = {
  questionNumber: string;
  questionType: string;
  marks: number;
  cognitiveLevel: string;
  cognitiveOrder: CognitiveOrder;
};

export type CognitiveAnalysisReport = {
  rows: CognitiveAnalysisRow[];
  totals: {
    lowOrder: number;
    middleOrder: number;
    highOrder: number;
  };
  percentages: {
    lowOrder: number;
    middleOrder: number;
    highOrder: number;
  };
  targets: {
    lowOrder: number;
    middleOrder: number;
    highOrder: number;
  };
  passed: boolean;
};

export type FrameworkComplianceCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type FrameworkComplianceReport = {
  checks: FrameworkComplianceCheck[];
  overallStatus: "FRAMEWORK COMPLIANT" | "FRAMEWORK FAILED";
  passed: boolean;
};

const TARGET_LOW_PCT = 40;
const TARGET_MIDDLE_PCT = 40;
const TARGET_HIGH_PCT = 20;

const BLOOM_TO_ORDER: Record<AiBloomLevel, CognitiveOrder> = {
  KNOWLEDGE: "LOW",
  UNDERSTANDING: "LOW",
  APPLICATION: "MIDDLE",
  ANALYSIS: "HIGH",
  EVALUATION: "HIGH",
  CREATION: "HIGH",
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple Choice",
  TRUE_FALSE: "True/False",
  MATCH_COLUMNS: "Matching",
  SHORT: "Short Answer",
  PARAGRAPH: "Paragraph/Essay",
  CASE_STUDY: "Case Study",
};

function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

function sortQuestionNumbers(questions: AiGeneratedQuestion[]): AiGeneratedQuestion[] {
  return [...questions].sort((a, b) => {
    const aParts = a.questionNumber.split(".").map((p) => parseInt(p, 10));
    const bParts = b.questionNumber.split(".").map((p) => parseInt(p, 10));
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

export function cognitiveOrderForQuestion(
  question: AiGeneratedQuestion,
  slot?: FrameworkSlot
): CognitiveOrder {
  if (slot?.cognitiveOrder) return slot.cognitiveOrder;
  return BLOOM_TO_ORDER[question.bloomLevel] ?? "MIDDLE";
}

export function computeCognitiveAnalysis(
  draft: AiGeneratedDraft,
  blueprint?: PaperBlueprint | null
): CognitiveAnalysisReport {
  const slotMap = new Map(blueprint?.slots.map((s) => [s.questionNumber, s]) ?? []);
  const sorted = sortQuestionNumbers(draft.questions);

  const rows: CognitiveAnalysisRow[] = sorted.map((q) => {
    const slot = slotMap.get(q.questionNumber);
    const order = cognitiveOrderForQuestion(q, slot);
    return {
      questionNumber: q.questionNumber,
      questionType: questionTypeLabel(q.questionType),
      marks: q.marks,
      cognitiveLevel: bloomLevelLabel(q.bloomLevel),
      cognitiveOrder: order,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      if (row.cognitiveOrder === "LOW") acc.lowOrder += row.marks;
      else if (row.cognitiveOrder === "MIDDLE") acc.middleOrder += row.marks;
      else acc.highOrder += row.marks;
      return acc;
    },
    { lowOrder: 0, middleOrder: 0, highOrder: 0 }
  );

  const totalMarks = draft.totalMarks || totals.lowOrder + totals.middleOrder + totals.highOrder;
  const percentages = {
    lowOrder: totalMarks > 0 ? Math.round((totals.lowOrder / totalMarks) * 100) : 0,
    middleOrder: totalMarks > 0 ? Math.round((totals.middleOrder / totalMarks) * 100) : 0,
    highOrder: totalMarks > 0 ? Math.round((totals.highOrder / totalMarks) * 100) : 0,
  };

  const targets = {
    lowOrder: Math.round((TARGET_LOW_PCT / 100) * totalMarks),
    middleOrder: Math.round((TARGET_MIDDLE_PCT / 100) * totalMarks),
    highOrder: Math.round((TARGET_HIGH_PCT / 100) * totalMarks),
  };

  const passed =
    totals.lowOrder === targets.lowOrder &&
    totals.middleOrder === targets.middleOrder &&
    totals.highOrder === targets.highOrder;

  return {
    rows,
    totals,
    percentages,
    targets,
    passed,
  };
}

function ocrQualityPassed(materials: { reviewConfirmed: boolean; uploadPurpose: string }[]): boolean {
  const reviewable = materials.filter((m) => m.uploadPurpose !== "ASSESSMENT_FRAMEWORK");
  if (reviewable.length === 0) return true;
  return reviewable.every((m) => m.reviewConfirmed);
}

function numberingValid(draft: AiGeneratedDraft, blueprint?: PaperBlueprint | null): boolean {
  if (blueprint) {
    const expected = new Set(blueprint.slots.map((s) => s.questionNumber));
    const actual = new Set(draft.questions.map((q) => q.questionNumber));
    if (expected.size !== actual.size) return false;
    for (const num of expected) {
      if (!actual.has(num)) return false;
    }
    return true;
  }
  return draft.questions.length > 0;
}

export function computeFrameworkCompliance(
  draft: AiGeneratedDraft,
  blueprint: PaperBlueprint | null | undefined,
  materials: { reviewConfirmed: boolean; uploadPurpose: string }[]
): FrameworkComplianceReport {
  const sectionA = draft.questions
    .filter((q) => q.section === "Section A")
    .reduce((s, q) => s + q.marks, 0);
  const sectionB = draft.questions
    .filter((q) => q.section === "Section B")
    .reduce((s, q) => s + q.marks, 0);
  const total = draft.questions.reduce((s, q) => s + q.marks, 0);

  const expectedSlots = blueprint?.slots.length ?? 0;
  const hasMemo = draft.questions.every((q) => q.memoAnswer?.trim());
  const rubricQ = draft.questions.find((q) => q.questionNumber === "7" || q.questionType === "PARAGRAPH");
  const hasRubric = Boolean(rubricQ?.rubric?.criteria?.length);

  const frameworkValidation = blueprint
    ? validateDraftAgainstBlueprint(draft, blueprint)
    : null;

  const checks: FrameworkComplianceCheck[] = [
    {
      id: "section_a",
      label: `Section A = ${blueprint?.sections.find((s) => s.name === "Section A")?.totalMarks ?? 15} marks`,
      passed: blueprint ? sectionA === (blueprint.sections.find((s) => s.name === "Section A")?.totalMarks ?? 15) : sectionA > 0,
      detail: `Actual: ${sectionA} marks`,
    },
    {
      id: "section_b",
      label: `Section B = ${blueprint?.sections.find((s) => s.name === "Section B")?.totalMarks ?? 15} marks`,
      passed: blueprint ? sectionB === (blueprint.sections.find((s) => s.name === "Section B")?.totalMarks ?? 15) : sectionB > 0,
      detail: `Actual: ${sectionB} marks`,
    },
    {
      id: "total",
      label: `Total = ${blueprint?.totalMarks ?? draft.totalMarks} marks`,
      passed: blueprint ? total === blueprint.totalMarks : total === draft.totalMarks,
      detail: `Actual: ${total} marks`,
    },
    {
      id: "slots",
      label: `${expectedSlots || draft.questions.length} required slots present`,
      passed: blueprint ? draft.questions.length === expectedSlots : draft.questions.length > 0,
      detail: `Found ${draft.questions.length} question(s)`,
    },
    {
      id: "numbering",
      label: "Question numbering valid",
      passed: numberingValid(draft, blueprint),
    },
    {
      id: "memo",
      label: "Memo generated",
      passed: hasMemo,
      detail: `${draft.questions.filter((q) => q.memoAnswer?.trim()).length}/${draft.questions.length} answers`,
    },
    {
      id: "rubric",
      label: "Rubric generated",
      passed: hasRubric,
    },
    {
      id: "ocr",
      label: "OCR quality passed",
      passed: ocrQualityPassed(materials),
    },
  ];

  if (frameworkValidation) {
    checks.push({
      id: "framework_validation",
      label: "Blueprint alignment",
      passed: frameworkValidation.passed,
    });
  }

  const passed = checks.every((c) => c.passed);

  return {
    checks,
    overallStatus: passed ? "FRAMEWORK COMPLIANT" : "FRAMEWORK FAILED",
    passed,
  };
}

export type ReviewReport = {
  cognitiveAnalysis: CognitiveAnalysisReport;
  frameworkCompliance: FrameworkComplianceReport;
  reviewComplete: boolean;
};

export function buildReviewReport(
  draft: AiGeneratedDraft,
  blueprint: PaperBlueprint | null | undefined,
  materials: { reviewConfirmed: boolean; uploadPurpose: string }[]
): ReviewReport {
  const cognitiveAnalysis = computeCognitiveAnalysis(draft, blueprint);
  const frameworkCompliance = computeFrameworkCompliance(draft, blueprint, materials);

  const reviewComplete =
    draft.questions.length > 0 &&
    draft.questions.every((q) => q.memoAnswer?.trim()) &&
    draft.questions.some((q) => q.rubric?.criteria?.length) &&
    cognitiveAnalysis.passed &&
    frameworkCompliance.passed;

  return {
    cognitiveAnalysis,
    frameworkCompliance,
    reviewComplete,
  };
}
