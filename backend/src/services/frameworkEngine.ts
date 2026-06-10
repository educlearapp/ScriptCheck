import { AiBloomLevel, AiQuestionType } from "@prisma/client";
import { containsOcrGarbage, isValidQuestionText, sanitizeQuestionText } from "./contentSanitizer";
import { PSW_FRAMEWORK_DISPLAY_NAME } from "./frameworkDetector";
import type { AiGeneratedDraft, AiGeneratedQuestion } from "./aiAssessmentEngine";

export type FrameworkSlot = {
  questionNumber: string;
  parentQuestion: string;
  section: string;
  questionType: AiQuestionType;
  style: string;
  marks: number;
  bloom: AiBloomLevel;
  label: string;
};

export type BlueprintSection = {
  name: string;
  totalMarks: number;
  questionNumbers: string[];
};

export type PaperBlueprint = {
  id: string;
  name: string;
  sections: BlueprintSection[];
  slots: FrameworkSlot[];
  totalMarks: number;
};

export type FrameworkValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  questionNumber?: string;
};

export type FrameworkValidationResult = {
  passed: boolean;
  issues: FrameworkValidationIssue[];
  blueprint: PaperBlueprint;
};

const TYPE_ALIASES: { pattern: RegExp; type: AiQuestionType; style: string; label: string }[] = [
  { pattern: /\b(mcq|multiple\s*choice)\b/i, type: "MULTIPLE_CHOICE", style: "mcq", label: "MCQ" },
  { pattern: /\bexplain\s+terms?\b/i, type: "SHORT", style: "definition", label: "Explain terms" },
  { pattern: /\bmatching\b/i, type: "MATCH_COLUMNS", style: "match", label: "Matching" },
  { pattern: /\btrue\s*\/?\s*false\b/i, type: "TRUE_FALSE", style: "tf", label: "True/False" },
  { pattern: /\bcomprehension\b/i, type: "SHORT", style: "comprehension", label: "Comprehension" },
  {
    pattern: /\b(constructed\s+response|short\s+answer)\b/i,
    type: "SHORT",
    style: "explain",
    label: "Constructed Response",
  },
  { pattern: /\b(paragraph|essay)\b/i, type: "PARAGRAPH", style: "paragraph", label: "Paragraph/Essay" },
  {
    pattern: /\b(advice|goal\s*setting)\b/i,
    type: "SHORT",
    style: "advice",
    label: "Advice/Goal Setting",
  },
];

function detectTypeFromLabel(text: string): {
  type: AiQuestionType;
  style: string;
  label: string;
} {
  for (const alias of TYPE_ALIASES) {
    if (alias.pattern.test(text)) {
      return { type: alias.type, style: alias.style, label: alias.label };
    }
  }
  return { type: "SHORT", style: "definition", label: "Short Answer" };
}

function parentFromNumber(num: string): string {
  const parts = num.split(".");
  return parts.length > 1 ? parts[0] : num;
}

function buildSectionsFromSlots(slots: FrameworkSlot[]): BlueprintSection[] {
  const sectionMap = new Map<string, { marks: number; numbers: string[] }>();

  for (const slot of slots) {
    const entry = sectionMap.get(slot.section) ?? { marks: 0, numbers: [] };
    entry.marks += slot.marks;
    if (!entry.numbers.includes(slot.questionNumber)) {
      entry.numbers.push(slot.questionNumber);
    }
    sectionMap.set(slot.section, entry);
  }

  return [...sectionMap.entries()].map(([name, data]) => ({
    name,
    totalMarks: data.marks,
    questionNumbers: data.numbers,
  }));
}

/**
 * Canonical PSW Modified Framework — Grade 6 Life Skills (30 marks).
 * NO DEVIATIONS when this framework is detected.
 */
export function getPswLifeSkillsGrade6Blueprint(): PaperBlueprint {
  const slots: FrameworkSlot[] = [
    // Section A — Question 1: MCQ × 3
    { questionNumber: "1.1", parentQuestion: "1", section: "Section A", questionType: "MULTIPLE_CHOICE", style: "mcq", marks: 1, bloom: "KNOWLEDGE", label: "MCQ" },
    { questionNumber: "1.2", parentQuestion: "1", section: "Section A", questionType: "MULTIPLE_CHOICE", style: "mcq", marks: 1, bloom: "KNOWLEDGE", label: "MCQ" },
    { questionNumber: "1.3", parentQuestion: "1", section: "Section A", questionType: "MULTIPLE_CHOICE", style: "mcq", marks: 1, bloom: "KNOWLEDGE", label: "MCQ" },
    // Question 2: Explain terms × 3
    { questionNumber: "2.1", parentQuestion: "2", section: "Section A", questionType: "SHORT", style: "definition", marks: 1, bloom: "KNOWLEDGE", label: "Explain terms" },
    { questionNumber: "2.2", parentQuestion: "2", section: "Section A", questionType: "SHORT", style: "definition", marks: 1, bloom: "KNOWLEDGE", label: "Explain terms" },
    { questionNumber: "2.3", parentQuestion: "2", section: "Section A", questionType: "SHORT", style: "definition", marks: 1, bloom: "KNOWLEDGE", label: "Explain terms" },
    // Question 3: Matching × 3
    { questionNumber: "3.1", parentQuestion: "3", section: "Section A", questionType: "MATCH_COLUMNS", style: "match_item", marks: 1, bloom: "UNDERSTANDING", label: "Matching" },
    { questionNumber: "3.2", parentQuestion: "3", section: "Section A", questionType: "MATCH_COLUMNS", style: "match_item", marks: 1, bloom: "UNDERSTANDING", label: "Matching" },
    { questionNumber: "3.3", parentQuestion: "3", section: "Section A", questionType: "MATCH_COLUMNS", style: "match_item", marks: 1, bloom: "UNDERSTANDING", label: "Matching" },
    // Question 4: True/False × 3
    { questionNumber: "4.1", parentQuestion: "4", section: "Section A", questionType: "TRUE_FALSE", style: "tf", marks: 1, bloom: "UNDERSTANDING", label: "True/False" },
    { questionNumber: "4.2", parentQuestion: "4", section: "Section A", questionType: "TRUE_FALSE", style: "tf", marks: 1, bloom: "UNDERSTANDING", label: "True/False" },
    { questionNumber: "4.3", parentQuestion: "4", section: "Section A", questionType: "TRUE_FALSE", style: "tf", marks: 1, bloom: "UNDERSTANDING", label: "True/False" },
    // Question 5: Comprehension × 3
    { questionNumber: "5.1", parentQuestion: "5", section: "Section A", questionType: "SHORT", style: "comprehension", marks: 1, bloom: "APPLICATION", label: "Comprehension" },
    { questionNumber: "5.2", parentQuestion: "5", section: "Section A", questionType: "SHORT", style: "comprehension", marks: 1, bloom: "APPLICATION", label: "Comprehension" },
    { questionNumber: "5.3", parentQuestion: "5", section: "Section A", questionType: "SHORT", style: "comprehension", marks: 1, bloom: "APPLICATION", label: "Comprehension" },
    // Section B
    { questionNumber: "6", parentQuestion: "6", section: "Section B", questionType: "SHORT", style: "explain", marks: 5, bloom: "APPLICATION", label: "Constructed Response" },
    { questionNumber: "7", parentQuestion: "7", section: "Section B", questionType: "PARAGRAPH", style: "paragraph", marks: 5, bloom: "ANALYSIS", label: "Paragraph/Essay" },
    { questionNumber: "8", parentQuestion: "8", section: "Section B", questionType: "SHORT", style: "advice", marks: 5, bloom: "EVALUATION", label: "Advice/Goal Setting" },
  ];

  return {
    id: "psw-life-skills-grade6",
    name: PSW_FRAMEWORK_DISPLAY_NAME,
    slots,
    sections: buildSectionsFromSlots(slots),
    totalMarks: 30,
  };
}

function isPswFramework(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("psw") ||
    t.includes("modified framework") ||
    (t.includes("section a") && t.includes("15") && t.includes("section b")) ||
    (t.includes("1.1") && t.includes("1.2") && t.includes("1.3") && t.includes("mcq"))
  );
}

const SUB_NUMBER_RE = /^(\d+)\.(\d+)\s*(?:[\[(]?\s*(\d+)\s*(?:mark|m)\s*[\])]?)?/i;
const TOP_NUMBER_RE = /^(\d+)\s*(?:[\[(]?\s*(\d+)\s*(?:mark|m)\s*[\])]?)?(?:\s*[-–:])?\s*(.*)/i;
const SECTION_RE = /^section\s+([a-z])\s*(?:[=:\-–]?\s*(\d+)\s*marks?)?/i;
const QUESTION_GROUP_RE = /^question\s+(\d+)/i;

/**
 * Parse uploaded framework text into a paper blueprint.
 * Falls back to PSW Grade 6 blueprint when PSW patterns are detected.
 */
export function parseFrameworkText(text: string): PaperBlueprint | null {
  if (!text?.trim()) return null;

  if (isPswFramework(text)) {
    return getPswLifeSkillsGrade6Blueprint();
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const slots: FrameworkSlot[] = [];
  let currentSection = "Section A";
  let currentParent = "1";
  let pendingType = detectTypeFromLabel("");
  let pendingMarks = 1;

  for (const line of lines) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentSection = `Section ${sectionMatch[1].toUpperCase()}`;
      continue;
    }

    const groupMatch = line.match(QUESTION_GROUP_RE);
    if (groupMatch) {
      currentParent = groupMatch[1];
      const typeInfo = detectTypeFromLabel(line);
      pendingType = typeInfo;
      const marksInLine = line.match(/(\d+)\s*marks?/i);
      if (marksInLine) pendingMarks = parseInt(marksInLine[1], 10);
      continue;
    }

    const typeInLine = detectTypeFromLabel(line);
    if (typeInLine.label !== "Short Answer" && line.length < 80) {
      pendingType = typeInLine;
      const marksInLine = line.match(/(\d+)\s*mark(?:s)?(?:\s*each)?/i);
      if (marksInLine) pendingMarks = parseInt(marksInLine[1], 10);
    }

    const subMatch = line.match(SUB_NUMBER_RE);
    if (subMatch) {
      const parent = subMatch[1];
      const sub = subMatch[2];
      const marks = subMatch[3] ? parseInt(subMatch[3], 10) : pendingMarks;
      currentParent = parent;
      slots.push({
        questionNumber: `${parent}.${sub}`,
        parentQuestion: parent,
        section: currentSection,
        questionType: pendingType.type,
        style: pendingType.style,
        marks,
        bloom: "KNOWLEDGE",
        label: pendingType.label,
      });
      continue;
    }

    const topMatch = line.match(TOP_NUMBER_RE);
    if (topMatch && !line.match(/^\d+\.\d+/)) {
      const num = topMatch[1];
      const marks = topMatch[2] ? parseInt(topMatch[2], 10) : pendingMarks;
      const rest = topMatch[3] ?? "";
      const typeInfo = rest ? detectTypeFromLabel(rest) : pendingType;
      if (typeInfo.label !== "Short Answer") pendingType = typeInfo;

      slots.push({
        questionNumber: num,
        parentQuestion: num,
        section: currentSection,
        questionType: pendingType.type,
        style: pendingType.style,
        marks,
        bloom: pendingType.type === "PARAGRAPH" ? "ANALYSIS" : "APPLICATION",
        label: pendingType.label,
      });
      currentParent = num;
    }
  }

  if (slots.length < 3) return null;

  const totalMarks = slots.reduce((s, sl) => s + sl.marks, 0);
  return {
    id: "parsed-framework",
    name: "Parsed Assessment Framework",
    slots,
    sections: buildSectionsFromSlots(slots),
    totalMarks,
  };
}

export function buildBlueprintFromFramework(text: string): PaperBlueprint {
  const parsed = parseFrameworkText(text);
  if (parsed) return parsed;
  return getPswLifeSkillsGrade6Blueprint();
}

export function validateDraftAgainstBlueprint(
  draft: AiGeneratedDraft,
  blueprint: PaperBlueprint
): FrameworkValidationResult {
  const issues: FrameworkValidationIssue[] = [];
  const draftByNumber = new Map(draft.questions.map((q) => [q.questionNumber, q]));

  for (const slot of blueprint.slots) {
    const q = draftByNumber.get(slot.questionNumber);
    if (!q) {
      issues.push({
        code: "FRAMEWORK_MISSING_QUESTION",
        severity: "error",
        message: `Missing required question ${slot.questionNumber} (${slot.label}, ${slot.marks} mark(s))`,
        questionNumber: slot.questionNumber,
      });
      continue;
    }

    if (q.marks !== slot.marks) {
      issues.push({
        code: "FRAMEWORK_MARKS_MISMATCH",
        severity: "error",
        message: `Question ${slot.questionNumber}: expected ${slot.marks} mark(s), got ${q.marks}`,
        questionNumber: slot.questionNumber,
      });
    }

    if (q.questionType !== slot.questionType) {
      issues.push({
        code: "FRAMEWORK_TYPE_MISMATCH",
        severity: "error",
        message: `Question ${slot.questionNumber}: expected ${slot.questionType}, got ${q.questionType}`,
        questionNumber: slot.questionNumber,
      });
    }

    if (q.section !== slot.section) {
      issues.push({
        code: "FRAMEWORK_SECTION_MISMATCH",
        severity: "warning",
        message: `Question ${slot.questionNumber}: expected ${slot.section}, got ${q.section ?? "none"}`,
        questionNumber: slot.questionNumber,
      });
    }

    if (containsOcrGarbage(q.questionText)) {
      issues.push({
        code: "OCR_GARBAGE_IN_QUESTION",
        severity: "error",
        message: `Question ${slot.questionNumber} contains OCR garbage text`,
        questionNumber: slot.questionNumber,
      });
    }
  }

  const expectedNumbers = new Set(blueprint.slots.map((s) => s.questionNumber));
  for (const q of draft.questions) {
    if (!expectedNumbers.has(q.questionNumber)) {
      issues.push({
        code: "FRAMEWORK_EXTRA_QUESTION",
        severity: "error",
        message: `Unexpected question ${q.questionNumber} not in framework`,
        questionNumber: q.questionNumber,
      });
    }
  }

  const actualTotal = draft.questions.reduce((s, q) => s + q.marks, 0);
  if (actualTotal !== blueprint.totalMarks) {
    issues.push({
      code: "FRAMEWORK_TOTAL_MISMATCH",
      severity: "error",
      message: `Total marks (${actualTotal}) do not match framework total (${blueprint.totalMarks})`,
    });
  }

  if (draft.questions.length !== blueprint.slots.length) {
    issues.push({
      code: "FRAMEWORK_QUESTION_COUNT",
      severity: "error",
      message: `Expected ${blueprint.slots.length} questions, got ${draft.questions.length}`,
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    passed: !hasErrors,
    issues,
    blueprint,
  };
}

export function blueprintToDraftSections(blueprint: PaperBlueprint) {
  return blueprint.sections.map((s) => ({
    name: s.name,
    questionNumbers: s.questionNumbers,
  }));
}

export function slotCompatibleWithQuestion(
  slot: FrameworkSlot,
  questionText: string,
  marks: number,
  questionType?: string
): boolean {
  if (marks !== slot.marks) return false;

  const t = questionText.toLowerCase();
  const slotType = slot.questionType;

  if (questionType) {
    const normalised = questionType.toUpperCase().replace(/\s+/g, "_");
    if (normalised === slotType || (normalised === "MCQ" && slotType === "MULTIPLE_CHOICE")) {
      return true;
    }
  }

  switch (slotType) {
    case "MULTIPLE_CHOICE":
      return /which\s+(one\s+of\s+the\s+)?following|choose\s+the\s+correct/i.test(t);
    case "TRUE_FALSE":
      return /true\s+or\s+false/i.test(t);
    case "MATCH_COLUMNS":
      return /match/i.test(t);
    case "PARAGRAPH":
      return /paragraph|essay|write\s+a\s+/i.test(t);
    case "SHORT":
      if (slot.style === "definition") return /what\s+(is|are)|explain|define/i.test(t);
      if (slot.style === "comprehension") return /read|comprehension|according|passage/i.test(t);
      if (slot.style === "advice") return /advice|goal|recommend/i.test(t);
      if (slot.style === "explain") return /explain|describe|discuss/i.test(t);
      return true;
    default:
      return true;
  }
}

export type BankItemForSlot = {
  id: string;
  questionText: string;
  marks: number;
  expectedAnswer?: string | null;
  memoNotes?: string | null;
  cognitiveLevel?: string | null;
  difficulty?: string | null;
  rubricNotes?: string | null;
  metadata?: unknown;
};

export type ExtractedItemForSlot = {
  questionNumber: string;
  questionText: string;
  marks: number;
  questionType: string;
  memoAnswer?: string;
  rubricNotes?: string;
  options?: string[];
};

export function pickBankItemForSlot(
  slot: FrameworkSlot,
  items: BankItemForSlot[],
  usedIds: Set<string>
): BankItemForSlot | null {
  for (const item of items) {
    if (usedIds.has(item.id)) continue;
    const meta = item.metadata as { questionType?: string } | null;
    if (slotCompatibleWithQuestion(slot, item.questionText, item.marks, meta?.questionType)) {
      return item;
    }
  }
  return null;
}

export function pickExtractedForSlot(
  slot: FrameworkSlot,
  extracted: ExtractedItemForSlot[],
  usedNumbers: Set<string>
): ExtractedItemForSlot | null {
  const exact = extracted.find(
    (e) => e.questionNumber === slot.questionNumber && !usedNumbers.has(e.questionNumber)
  );
  if (exact && slotCompatibleWithQuestion(slot, exact.questionText, exact.marks, exact.questionType)) {
    return exact;
  }

  for (const item of extracted) {
    if (usedNumbers.has(item.questionNumber)) continue;
    if (slotCompatibleWithQuestion(slot, item.questionText, item.marks, item.questionType)) {
      return item;
    }
  }
  return null;
}

export function mapExtractedToGenerated(
  slot: FrameworkSlot,
  item: ExtractedItemForSlot,
  difficulty: string
): AiGeneratedQuestion | null {
  const cleaned = sanitizeQuestionText(item.questionText);
  if (!isValidQuestionText(cleaned)) return null;

  return {
    questionNumber: slot.questionNumber,
    section: slot.section,
    questionType: slot.questionType,
    questionText: cleaned,
    marks: slot.marks,
    bloomLevel: slot.bloom,
    difficulty,
    memoAnswer: item.memoAnswer ?? `Marking guide for ${slot.questionNumber}.`,
    memoNotes: item.rubricNotes,
    ...(item.options?.length ? { options: item.options } : {}),
  };
}

export function mapBankToGenerated(
  slot: FrameworkSlot,
  item: BankItemForSlot,
  difficulty: string
): AiGeneratedQuestion | null {
  const cleaned = sanitizeQuestionText(item.questionText);
  if (!isValidQuestionText(cleaned)) return null;

  const q: AiGeneratedQuestion = {
    questionNumber: slot.questionNumber,
    section: slot.section,
    questionType: slot.questionType,
    questionText: cleaned,
    marks: slot.marks,
    bloomLevel: slot.bloom,
    difficulty: item.difficulty ?? difficulty,
    memoAnswer: item.expectedAnswer ?? `Marking guide for ${slot.questionNumber}.`,
    memoNotes: item.memoNotes ?? undefined,
  };

  if (slot.questionType === "PARAGRAPH" && item.rubricNotes) {
    q.rubric = {
      criteria: [{ name: "Rubric", description: item.rubricNotes, maxMarks: slot.marks }],
    };
  }

  return q;
}
