import {
  AiBloomLevel,
  AiQuestionType,
} from "@prisma/client";
import type { AiGeneratedDraft, AiGeneratedQuestion } from "./aiAssessmentEngine";
import { containsOcrGarbage } from "./contentSanitizer";
import type { PaperBlueprint } from "./frameworkEngine";

export type QualityIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  questionNumber?: string;
};

export type QualityCheckResult = {
  passed: boolean;
  issues: QualityIssue[];
  summary: {
    totalMarks: number;
    targetMarks: number;
    questionCount: number;
    memoCount: number;
    rubricCount: number;
    bloomAssigned: number;
    duplicateCount: number;
    sectionCount: number;
  };
};

const RUBRIC_REQUIRED_TYPES: AiQuestionType[] = ["PARAGRAPH", "CASE_STUDY"];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findDuplicates(questions: AiGeneratedQuestion[]): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  for (const q of questions) {
    const key = normalizeText(q.questionText);
    if (!key) continue;
    const existing = seen.get(key);
    if (existing) {
      duplicates.push(q.questionNumber);
      if (!duplicates.includes(existing)) duplicates.push(existing);
    } else {
      seen.set(key, q.questionNumber);
    }
  }

  return duplicates;
}

export function runQualityChecks(
  draft: AiGeneratedDraft,
  targetMarks: number,
  blueprint?: PaperBlueprint
): QualityCheckResult {
  const issues: QualityIssue[] = [];
  const { questions } = draft;

  const actualTotal = questions.reduce((sum, q) => sum + q.marks, 0);
  const expectedTotal = blueprint?.totalMarks ?? targetMarks;

  if (actualTotal !== expectedTotal) {
    issues.push({
      code: "MARKS_MISMATCH",
      severity: "error",
      message: `Total marks (${actualTotal}) do not match target (${expectedTotal})`,
    });
  }

  if (blueprint) {
    const sectionMarks = new Map<string, number>();
    for (const q of questions) {
      const section = q.section ?? "Unknown";
      sectionMarks.set(section, (sectionMarks.get(section) ?? 0) + q.marks);
    }
    for (const section of blueprint.sections) {
      const actual = sectionMarks.get(section.name) ?? 0;
      if (actual !== section.totalMarks) {
        issues.push({
          code: "FRAMEWORK_SECTION_MARKS",
          severity: "error",
          message: `${section.name} has ${actual} marks but framework requires ${section.totalMarks}`,
        });
      }
    }
  }

  for (const q of questions) {
    if (!q.marks || q.marks <= 0) {
      issues.push({
        code: "MISSING_MARKS",
        severity: "error",
        message: `Question ${q.questionNumber} has no marks allocated`,
        questionNumber: q.questionNumber,
      });
    }

    if (!q.memoAnswer?.trim()) {
      issues.push({
        code: "MISSING_MEMO",
        severity: "error",
        message: `Question ${q.questionNumber} has no memo answer`,
        questionNumber: q.questionNumber,
      });
    }

    if (containsOcrGarbage(q.questionText)) {
      issues.push({
        code: "OCR_GARBAGE_IN_QUESTION",
        severity: "error",
        message: `Question ${q.questionNumber} contains OCR garbage text`,
        questionNumber: q.questionNumber,
      });
    }

    if (blueprint) {
      const slot = blueprint.slots.find((s) => s.questionNumber === q.questionNumber);
      if (slot && q.marks !== slot.marks) {
        issues.push({
          code: "FRAMEWORK_MARKS_MISMATCH",
          severity: "error",
          message: `Question ${q.questionNumber}: framework requires ${slot.marks} mark(s), got ${q.marks}`,
          questionNumber: q.questionNumber,
        });
      }
      if (slot && q.questionType !== slot.questionType) {
        issues.push({
          code: "FRAMEWORK_TYPE_MISMATCH",
          severity: "error",
          message: `Question ${q.questionNumber}: framework requires ${slot.questionType}, got ${q.questionType}`,
          questionNumber: q.questionNumber,
        });
      }
    }

    if (!q.bloomLevel) {
      issues.push({
        code: "MISSING_BLOOM",
        severity: "warning",
        message: `Question ${q.questionNumber} has no Bloom level assigned`,
        questionNumber: q.questionNumber,
      });
    }

    if (RUBRIC_REQUIRED_TYPES.includes(q.questionType) && !q.rubric?.criteria?.length) {
      issues.push({
        code: "MISSING_RUBRIC",
        severity: "error",
        message: `Question ${q.questionNumber} (${q.questionType}) requires a rubric`,
        questionNumber: q.questionNumber,
      });
    }
  }

  const duplicates = findDuplicates(questions);
  for (const num of duplicates) {
    issues.push({
      code: "DUPLICATE_QUESTION",
      severity: "warning",
      message: `Question ${num} appears to duplicate another question`,
      questionNumber: num,
    });
  }

  if (!draft.sections?.length && questions.length > 3) {
    issues.push({
      code: "MISSING_SECTIONS",
      severity: "warning",
      message: "Assessment has no sections defined",
    });
  }

  if (!draft.instructions?.trim()) {
    issues.push({
      code: "MISSING_INSTRUCTIONS",
      severity: "warning",
      message: "Assessment instructions are empty",
    });
  }

  const bloomAssigned = questions.filter((q) => q.bloomLevel).length;
  const rubricCount = questions.filter((q) => q.rubric?.criteria?.length).length;
  const memoCount = questions.filter((q) => q.memoAnswer?.trim()).length;

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    passed: !hasErrors,
    issues,
    summary: {
      totalMarks: actualTotal,
      targetMarks,
      questionCount: questions.length,
      memoCount,
      rubricCount,
      bloomAssigned,
      duplicateCount: duplicates.length,
      sectionCount: draft.sections?.length ?? 0,
    },
  };
}

export function bloomLevelLabel(level: AiBloomLevel): string {
  const labels: Record<AiBloomLevel, string> = {
    KNOWLEDGE: "Knowledge",
    UNDERSTANDING: "Understanding",
    APPLICATION: "Application",
    ANALYSIS: "Analysis",
    EVALUATION: "Evaluation",
    CREATION: "Creation",
  };
  return labels[level];
}
