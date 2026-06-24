import {
  AiBloomLevel,
  AiBuilderDifficulty,
  AiQuestionType,
} from "@prisma/client";
import {
  conceptQuestionStem,
  extractConcepts,
  filterQualityConcepts,
  isPlaceholderText,
  isQualityConcept,
  orderConceptsForAssessment,
  sanitiseSourceText,
  type StudyConcept,
} from "./contentConcepts";
import {
  sanitizeOcrText,
  sanitizeQuestionText,
  containsOcrGarbage,
  validateQuestionConceptQuality,
  CAPS_LIFE_SKILLS_VOCABULARY,
} from "./contentSanitizer";
import {
  blueprintToDraftSections,
  type BankItemForSlot,
  type ExtractedItemForSlot,
  type FrameworkSlot,
  type PaperBlueprint,
  pickBankItemForSlot,
  pickExtractedForSlot,
  mapBankToGenerated,
  mapExtractedToGenerated,
} from "./frameworkEngine";

export type AiRubricCriterion = {
  name: string;
  description: string;
  maxMarks: number;
};

export type AiGeneratedQuestion = {
  questionNumber: string;
  section?: string;
  questionType: AiQuestionType;
  questionText: string;
  marks: number;
  bloomLevel: AiBloomLevel;
  difficulty: string;
  options?: string[];
  memoAnswer: string;
  memoNotes?: string;
  rubric?: { criteria: AiRubricCriterion[] };
};

export type AiGeneratedSection = {
  name: string;
  questionNumbers: string[];
};

export type AiGeneratedDraft = {
  instructions: string;
  sections: AiGeneratedSection[];
  questions: AiGeneratedQuestion[];
  totalMarks: number;
  generatedAt: string;
  sourceExcerpt: string;
  mock: boolean;
};

export type AiGenerationInput = {
  sourceText: string;
  title: string;
  totalMarks: number;
  durationMinutes?: number | null;
  difficulty: AiBuilderDifficulty;
  questionTypes: AiQuestionType[];
  bloomLevels: AiBloomLevel[];
  instructions?: string | null;
  subjectName?: string;
  gradeName?: string;
  frameworkText?: string | null;
};

export type BlueprintGenerationInput = {
  blueprint: PaperBlueprint;
  studyText: string;
  bankItems?: BankItemForSlot[];
  extractedQuestions?: ExtractedItemForSlot[];
  genInput: AiGenerationInput;
};

const BLOOM_LABELS: Record<AiBloomLevel, string> = {
  KNOWLEDGE: "Knowledge",
  UNDERSTANDING: "Understanding",
  APPLICATION: "Application",
  ANALYSIS: "Analysis",
  EVALUATION: "Evaluation",
  CREATION: "Creation",
};

type CapsQuestionPlan = {
  section: string;
  questionType: AiQuestionType;
  style: string;
  bloom: AiBloomLevel;
};

const LIFE_SKILLS_CAPS_PLAN: CapsQuestionPlan[] = [
  { section: "Section A", questionType: "MULTIPLE_CHOICE", style: "mcq", bloom: "KNOWLEDGE" },
  { section: "Section A", questionType: "SHORT", style: "definition", bloom: "KNOWLEDGE" },
  { section: "Section A", questionType: "MATCH_COLUMNS", style: "match", bloom: "UNDERSTANDING" },
  { section: "Section A", questionType: "TRUE_FALSE", style: "tf", bloom: "UNDERSTANDING" },
  { section: "Section A", questionType: "SHORT", style: "comprehension", bloom: "APPLICATION" },
  { section: "Section B", questionType: "SHORT", style: "explain", bloom: "APPLICATION" },
  { section: "Section B", questionType: "PARAGRAPH", style: "paragraph", bloom: "ANALYSIS" },
  { section: "Section B", questionType: "SHORT", style: "advice", bloom: "EVALUATION" },
];

function allocateMarks(totalMarks: number, count: number): number[] {
  const base = Math.floor(totalMarks / count);
  const remainder = totalMarks % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function difficultyLabel(d: AiBuilderDifficulty): string {
  switch (d) {
    case "EASY":
      return "Easy";
    case "DIFFICULT":
      return "Difficult";
    case "MIXED":
      return "Mixed";
    default:
      return "Moderate";
  }
}

function pickDifficulty(index: number, overall: AiBuilderDifficulty): string {
  if (overall === "MIXED") {
    return ["Easy", "Moderate", "Difficult"][index % 3];
  }
  return difficultyLabel(overall);
}

function isLifeSkillsCaps(input: AiGenerationInput): boolean {
  const subject = input.subjectName?.toLowerCase() ?? "";
  const grade = input.gradeName?.toLowerCase() ?? "";
  return subject.includes("life skills") || (subject.includes("life") && grade.includes("6"));
}

function buildMemoAnswer(
  type: AiQuestionType,
  concept: StudyConcept,
  marks: number
): string {
  if (concept.definition) {
    return `${concept.term}: ${concept.definition} (${marks} marks).`;
  }

  switch (type) {
    case "MULTIPLE_CHOICE":
      return `B) Accurate description of ${concept.term.toLowerCase()} (${marks} marks).`;
    case "TRUE_FALSE":
      return `True — supported by the study material on ${concept.term.toLowerCase()} (${marks} marks).`;
    case "MATCH_COLUMNS":
      return `All pairs correctly matched for terms related to ${concept.term.toLowerCase()} (${marks} marks).`;
    case "PARAGRAPH":
      return `Paragraph explains ${concept.term.toLowerCase()} with accurate facts and examples (${marks} marks).`;
    default:
      return `Clear, accurate explanation of ${concept.term.toLowerCase()} (${marks} marks).`;
  }
}

function buildRubric(concept: StudyConcept, marks: number): AiRubricCriterion[] {
  const half = Math.floor(marks / 2);
  const rest = marks - half;
  return [
    {
      name: "Content accuracy",
      description: `Accurate facts about ${concept.term.toLowerCase()}`,
      maxMarks: half,
    },
    {
      name: "Examples and clarity",
      description: "Relevant examples and clear organisation",
      maxMarks: rest,
    },
  ];
}

function buildMcqOptions(concept: StudyConcept): string[] {
  const correct = concept.definition
    ? concept.definition.split(/[.;]/)[0].trim()
    : `A correct statement about ${concept.term.toLowerCase()}`;

  return [
    `A) An unrelated concept`,
    `B) ${correct.slice(0, 90)}${correct.length > 90 ? "…" : ""}`,
    `C) The opposite of ${concept.term.toLowerCase()}`,
    `D) A vague or incomplete answer`,
  ];
}

const PSW_SLOT_CONCEPT_FOCUS: { style: string; keyword: string }[] = [
  { style: "mcq", keyword: "social bullying" },
  { style: "mcq", keyword: "bullying" },
  { style: "mcq", keyword: "adolescence" },
  { style: "definition", keyword: "hormones" },
  { style: "definition", keyword: "adolescence" },
  { style: "definition", keyword: "dignity" },
  { style: "match_item", keyword: "bullying" },
  { style: "match_item", keyword: "mediation" },
  { style: "match_item", keyword: "peacekeeping" },
  { style: "tf", keyword: "mediation" },
  { style: "tf", keyword: "peacekeeping" },
  { style: "tf", keyword: "bullying" },
  { style: "comprehension", keyword: "peacekeeping" },
  { style: "comprehension", keyword: "dignity" },
  { style: "comprehension", keyword: "cultural rites" },
  { style: "explain", keyword: "lobola" },
  { style: "paragraph", keyword: "rite of passage" },
  { style: "advice", keyword: "dignity" },
];

function pickConceptByKeyword(
  concepts: StudyConcept[],
  keyword: string,
  fallbackIndex: number
): StudyConcept {
  const quality = filterQualityConcepts(concepts);
  const pool = quality.length > 0 ? quality : concepts;
  const lower = keyword.toLowerCase();

  const exact = pool.find((c) => c.term.toLowerCase() === lower);
  if (exact) return exact;

  const capsHit = Object.entries(CAPS_LIFE_SKILLS_VOCABULARY).find(
    ([key]) => key === lower || key.includes(lower) || lower.includes(key)
  );
  if (capsHit) {
    const [, entry] = capsHit;
    const fromPool = pool.find((c) => c.term.toLowerCase() === entry.term.toLowerCase());
    if (fromPool) return fromPool;
    return {
      term: entry.term,
      definition: entry.definition,
      context: entry.definition,
      topic: undefined,
    };
  }

  const shortMatch = pool.find(
    (c) =>
      (c.term.toLowerCase().includes(lower) || c.context.toLowerCase().includes(lower)) &&
      c.term.length <= lower.length + 20 &&
      isQualityConcept(c)
  );
  if (shortMatch) return shortMatch;

  const contextMatch = pool.find(
    (c) => c.context.toLowerCase().includes(lower) && isQualityConcept(c)
  );
  if (contextMatch) return contextMatch;

  return pool[fallbackIndex % pool.length];
}

const CAPS_MATCHING_SETS: { term: string; desc: string }[][] = [
  [
    { term: "Hormones", desc: "Chemical messengers controlling growth and development" },
    { term: "Adolescence", desc: "Period between childhood and adulthood" },
    { term: "Social Bullying", desc: "Excluding someone from a group" },
  ],
  [
    { term: "Mediation", desc: "A peaceful way to resolve conflict between people" },
    { term: "Peacekeeping", desc: "Creating calm and preventing violence" },
    { term: "Dignity", desc: "Treating every person with respect and worth" },
  ],
];

function buildMatchingColumnsStem(matchSlotOffset: number): string {
  const set = CAPS_MATCHING_SETS[0];
  const colA = set.map((p, i) => `${i + 1} ${p.term}`).join("\n");
  const letters = ["A", "B", "C"];
  const colB = set
    .map((p, i) => `${letters[i]} ${p.desc}`)
    .join("\n");
  const target = set[matchSlotOffset % set.length];

  return (
    `Match Column A with Column B.\n\n` +
    `COLUMN A\n${colA}\n\n` +
    `COLUMN B\n${colB}\n\n` +
    `Write the letter (${letters.join(", ")}) that correctly describes ${target.term}.`
  );
}

function buildMatchingMemo(matchSlotOffset: number): string {
  const set = CAPS_MATCHING_SETS[0];
  const letters = ["A", "B", "C"];
  const target = set[matchSlotOffset % set.length];
  const correctLetter = letters[matchSlotOffset % set.length];
  return `${correctLetter}) ${target.desc} (1 mark).`;
}

function buildCapsInstructions(input: AiGenerationInput): string {
  const duration = input.durationMinutes ? ` Time allowed: ${input.durationMinutes} minutes.` : "";
  return (
    input.instructions?.trim() ||
    `GRADE ${input.gradeName ?? "6"} LIFE SKILLS — ${input.title}\n\n` +
      `Answer ALL questions. Write neatly and in full sentences where required.\n` +
      `Section A: Multiple choice, definitions, matching, true/false and comprehension.${duration}\n` +
      `Section B: Constructed responses, paragraph writing and advice/goals.\n` +
      `Total marks: ${input.totalMarks}.`
  );
}

function buildMcqStemForBullying(concept: StudyConcept, index: number): string {
  const stems = [
    "Which one of the following acts is a form of social bullying?",
    "Which statement best describes adolescence?",
    "Which of the following is a healthy way to respond to conflict?",
  ];
  return stems[index % stems.length] ?? conceptQuestionStem(concept, "mcq");
}

function buildMcqOptionsForStem(stemIndex: number, concept: StudyConcept): string[] {
  if (stemIndex === 0) {
    return [
      "A) Helping a friend who is being teased",
      "B) Spreading rumours about a classmate",
      "C) Including everyone in a group activity",
      "D) Telling a teacher about a problem",
    ];
  }
  return buildMcqOptions(concept);
}

function buildComprehensionStem(concept: StudyConcept): string {
  const context = sanitizeQuestionText(concept.context);
  const excerpt =
    context.length > 20 && !containsOcrGarbage(context)
      ? context.slice(0, 220)
      : `During adolescence, learners experience many changes. ${concept.definition ?? `Understanding ${concept.term.toLowerCase()} is important for healthy development.`}`;

  return `Read the following passage and answer the question below.\n\n"${excerpt}${excerpt.length >= 220 ? "…" : ""}"\n\nWhat is the main idea of this passage?`;
}

function fillSlotFromConcepts(
  slot: FrameworkSlot,
  concepts: StudyConcept[],
  slotIndex: number,
  difficulty: string
): AiGeneratedQuestion {
  const focus = PSW_SLOT_CONCEPT_FOCUS[slotIndex];
  const concept = focus
    ? pickConceptByKeyword(concepts, focus.keyword, slotIndex)
    : concepts[slotIndex % concepts.length];

  let questionText: string;
  let options: string[] | undefined;

  switch (slot.style) {
    case "mcq":
      questionText = buildMcqStemForBullying(concept, slotIndex % 3);
      options = buildMcqOptionsForStem(slotIndex % 3, concept);
      break;
    case "match_item": {
      const matchOffset = slotIndex - 6;
      questionText = buildMatchingColumnsStem(matchOffset >= 0 ? matchOffset : slotIndex % 3);
      break;
    }
    case "comprehension":
      questionText = buildComprehensionStem(concept);
      break;
    default:
      questionText = conceptQuestionStem(concept, slot.style);
  }

  questionText = slot.style === "match_item" ? questionText : sanitizeQuestionText(questionText);
  const qualityCheck = validateQuestionConceptQuality(questionText);
  if (!qualityCheck.valid && slot.style === "definition") {
    const fallback = pickConceptByKeyword(concepts, focus?.keyword ?? "dignity", slotIndex);
    questionText = sanitizeQuestionText(
      conceptQuestionStem(fallback, "definition")
    );
  }

  const question: AiGeneratedQuestion = {
    questionNumber: slot.questionNumber,
    section: slot.section,
    questionType: slot.questionType,
    questionText,
    marks: slot.marks,
    bloomLevel: slot.bloom,
    difficulty,
    memoAnswer:
      slot.style === "match_item"
        ? buildMatchingMemo(slotIndex - 6 >= 0 ? slotIndex - 6 : slotIndex % 3)
        : buildMemoAnswer(slot.questionType, concept, slot.marks),
    memoNotes: `Award full marks for accurate CAPS-aligned response on ${concept.term.toLowerCase()}.`,
  };

  if (options) question.options = options;
  if (slot.questionType === "PARAGRAPH" || slot.questionType === "CASE_STUDY") {
    question.rubric = { criteria: buildRubric(concept, slot.marks) };
  }

  return question;
}

function buildFrameworkInstructions(input: AiGenerationInput, blueprint: PaperBlueprint): string {
  const duration = input.durationMinutes ? ` Time allowed: ${input.durationMinutes} minutes.` : "";
  const grade = input.gradeName ?? "6";
  const subject = input.subjectName ?? "LIFE SKILLS";

  return (
    input.instructions?.trim() ||
    `GRADE ${grade} ${subject.toUpperCase()} — ${input.title}\n\n` +
      `Answer ALL questions. Write neatly and in full sentences where required.${duration}\n\n` +
      `SECTION A (${blueprint.sections.find((s) => s.name === "Section A")?.totalMarks ?? 15} marks)\n` +
      `Questions 1–5: Multiple choice, explain terms, matching, true/false and comprehension.\n\n` +
      `SECTION B (${blueprint.sections.find((s) => s.name === "Section B")?.totalMarks ?? 15} marks)\n` +
      `Questions 6–8: Constructed response, paragraph writing and advice/goal setting.\n\n` +
      `Total marks: ${blueprint.totalMarks}.`
  );
}

/**
 * Block generation when more than 5% of questions fail concept validation.
 */
export function assertContentQualityGate(questions: AiGeneratedQuestion[]): void {
  if (questions.length === 0) return;

  const failed = questions.filter((q) => !validateQuestionConceptQuality(q.questionText).valid);
  const failureRate = failed.length / questions.length;

  if (failureRate > 0.05) {
    const examples = failed
      .slice(0, 3)
      .map((q) => q.questionNumber)
      .join(", ");
    throw new Error(
      `Content quality gate failed: ${failed.length} of ${questions.length} questions (${Math.round(failureRate * 100)}%) contain invalid concepts or OCR fragments (e.g. questions ${examples}). Review study material and try again.`
    );
  }
}

/**
 * Framework-first generation — structure comes from blueprint only.
 * AI fills content into fixed slots. Priority: Question Library -> Past Paper -> AI fill.
 */
export function generateFromBlueprint(input: BlueprintGenerationInput): AiGeneratedDraft {
  const { blueprint, bankItems = [], extractedQuestions = [], genInput } = input;
  const studyText = sanitizeOcrText(genInput.sourceText || input.studyText);

  if (!studyText || isPlaceholderText(studyText)) {
    throw new Error(
      "No usable study material text. Upload study material and run extraction before generating with a framework."
    );
  }

  const concepts = orderConceptsForAssessment(filterQualityConcepts(extractConcepts(studyText)));
  if (concepts.length === 0) {
    throw new Error("Could not identify quality concepts in study material. Review extracted text.");
  }

  const usedBankIds = new Set<string>();
  const usedExtractedNumbers = new Set<string>();
  const questions: AiGeneratedQuestion[] = [];

  for (let i = 0; i < blueprint.slots.length; i++) {
    const slot = blueprint.slots[i];
    const diff = pickDifficulty(i, genInput.difficulty);
    let filled: AiGeneratedQuestion | null = null;

    const bankHit = pickBankItemForSlot(slot, bankItems, usedBankIds);
    if (bankHit) {
      const mapped = mapBankToGenerated(slot, bankHit, diff);
      if (mapped) {
        usedBankIds.add(bankHit.id);
        filled = mapped;
      }
    }

    if (!filled) {
      const extractedHit = pickExtractedForSlot(slot, extractedQuestions, usedExtractedNumbers);
      if (extractedHit) {
        const mapped = mapExtractedToGenerated(slot, extractedHit, diff);
        if (mapped) {
          usedExtractedNumbers.add(extractedHit.questionNumber);
          filled = mapped;
        }
      }
    }

    if (!filled) {
      filled = fillSlotFromConcepts(slot, concepts, i, diff);
    }

    questions.push(filled);
  }

  assertContentQualityGate(questions);

  return {
    instructions: buildFrameworkInstructions(genInput, blueprint),
    sections: blueprintToDraftSections(blueprint),
    questions,
    totalMarks: blueprint.totalMarks,
    generatedAt: new Date().toISOString(),
    sourceExcerpt: studyText.slice(0, 500),
    mock: false,
  };
}

function generateLifeSkillsPaper(
  input: AiGenerationInput,
  rawConcepts: StudyConcept[]
): AiGeneratedQuestion[] {
  const concepts = orderConceptsForAssessment(rawConcepts);
  const plan = LIFE_SKILLS_CAPS_PLAN;
  const markSplit = allocateMarks(input.totalMarks, plan.length);

  return plan.map((item, index) => {
    const focus = PSW_SLOT_CONCEPT_FOCUS[index];
    const style = focus?.style === "match_item" ? "match" : (focus?.style ?? item.style);
    const concept = focus
      ? pickConceptByKeyword(concepts, focus.keyword, index)
      : concepts[index % concepts.length];
    const marks = markSplit[index];
    const diff = pickDifficulty(index, input.difficulty);
    const questionNumber = String(index + 1);

    const question: AiGeneratedQuestion = {
      questionNumber,
      section: item.section,
      questionType: item.questionType,
      questionText: sanitizeQuestionText(conceptQuestionStem(concept, style)),
      marks,
      bloomLevel: item.bloom,
      difficulty: diff,
      memoAnswer: buildMemoAnswer(item.questionType, concept, marks),
      memoNotes: `Award full marks for accurate ${BLOOM_LABELS[item.bloom].toLowerCase()}-level response using study material on ${concept.term.toLowerCase()}.`,
    };

    if (item.questionType === "MULTIPLE_CHOICE") {
      question.options = buildMcqOptions(concept);
    }

    if (item.questionType === "PARAGRAPH" || item.questionType === "CASE_STUDY") {
      question.rubric = { criteria: buildRubric(concept, marks) };
    }

    return question;
  });
}

function generateGenericPaper(
  input: AiGenerationInput,
  concepts: StudyConcept[]
): AiGeneratedQuestion[] {
  const types =
    input.questionTypes.length > 0
      ? input.questionTypes
      : (["SHORT", "MULTIPLE_CHOICE", "TRUE_FALSE"] as AiQuestionType[]);

  const blooms =
    input.bloomLevels.length > 0
      ? input.bloomLevels
      : (["KNOWLEDGE", "UNDERSTANDING", "APPLICATION"] as AiBloomLevel[]);

  const count = Math.min(Math.max(concepts.length, 4), 10);
  const markSplit = allocateMarks(input.totalMarks, count);

  return markSplit.map((marks, index) => {
    const concept = concepts[index % concepts.length];
    const questionType = types[index % types.length];
    const bloomLevel = blooms[index % blooms.length];
    const style =
      questionType === "MULTIPLE_CHOICE"
        ? "mcq"
        : questionType === "TRUE_FALSE"
          ? "tf"
          : questionType === "MATCH_COLUMNS"
            ? "match"
            : questionType === "PARAGRAPH"
              ? "paragraph"
              : "definition";

    const question: AiGeneratedQuestion = {
      questionNumber: String(index + 1),
      section: index < Math.ceil(count / 2) ? "Section A" : "Section B",
      questionType,
      questionText: conceptQuestionStem(concept, style),
      marks,
      bloomLevel,
      difficulty: pickDifficulty(index, input.difficulty),
      memoAnswer: buildMemoAnswer(questionType, concept, marks),
      memoNotes: `Mark using study material on ${concept.term.toLowerCase()}.`,
    };

    if (questionType === "MULTIPLE_CHOICE") question.options = buildMcqOptions(concept);
    if (questionType === "PARAGRAPH" || questionType === "CASE_STUDY") {
      question.rubric = { criteria: buildRubric(concept, marks) };
    }

    return question;
  });
}

/**
 * Content-aware generator — derives questions from OCR/extracted study material.
 * Never uses placeholder OCR text.
 */
export async function generateAssessmentFromMaterial(
  input: AiGenerationInput
): Promise<AiGeneratedDraft> {
  const sourceText = sanitizeOcrText(sanitiseSourceText(input.sourceText));

  if (!sourceText || isPlaceholderText(sourceText)) {
    throw new Error(
      "No usable study material text. Run content extraction or enter text manually before generating."
    );
  }

  const concepts = orderConceptsForAssessment(filterQualityConcepts(extractConcepts(sourceText)));
  if (concepts.length === 0) {
    throw new Error(
      "Could not identify quality concepts in the extracted text. Review OCR output and try again."
    );
  }

  const questions = isLifeSkillsCaps(input)
    ? generateLifeSkillsPaper(input, concepts)
    : generateGenericPaper(input, concepts);

  assertContentQualityGate(questions);

  const sectionA = questions.filter((q) => q.section === "Section A").map((q) => q.questionNumber);
  const sectionB = questions.filter((q) => q.section === "Section B").map((q) => q.questionNumber);

  const sections: AiGeneratedSection[] = [];
  if (sectionA.length) sections.push({ name: "Section A", questionNumbers: sectionA });
  if (sectionB.length) sections.push({ name: "Section B", questionNumbers: sectionB });

  const instructions = isLifeSkillsCaps(input)
    ? buildCapsInstructions(input)
    : input.instructions?.trim() ||
      `Answer ALL questions. Total marks: ${input.totalMarks}.` +
        (input.durationMinutes ? ` Time allowed: ${input.durationMinutes} minutes.` : "");

  return {
    instructions,
    sections,
    questions,
    totalMarks: input.totalMarks,
    generatedAt: new Date().toISOString(),
    sourceExcerpt: sourceText.slice(0, 500),
    mock: false,
  };
}

type ExtractedQ = {
  questionNumber: string;
  section?: string;
  questionText: string;
  marks: number;
  questionType: string;
  bloomLevel?: string;
  cognitiveLevel?: string;
  difficulty?: string;
  memoAnswer?: string;
  rubricNotes?: string;
  options?: string[];
};

function mapBloom(level?: string): AiBloomLevel {
  const l = (level ?? "").toLowerCase();
  if (l.includes("evaluat")) return "EVALUATION";
  if (l.includes("analys")) return "ANALYSIS";
  if (l.includes("applic")) return "APPLICATION";
  if (l.includes("understand")) return "UNDERSTANDING";
  if (l.includes("creat")) return "CREATION";
  return "KNOWLEDGE";
}

function mapQuestionType(type: string): AiQuestionType {
  switch (type.toUpperCase()) {
    case "MULTIPLE_CHOICE":
      return "MULTIPLE_CHOICE";
    case "TRUE_FALSE":
      return "TRUE_FALSE";
    case "MATCH_COLUMNS":
      return "MATCH_COLUMNS";
    case "PARAGRAPH":
      return "PARAGRAPH";
    case "CASE_STUDY":
      return "CASE_STUDY";
    default:
      return "SHORT";
  }
}

export function generateDraftFromExtractedQuestions(
  input: AiGenerationInput,
  extracted: ExtractedQ[],
  sourceExcerpt?: string
): AiGeneratedDraft {
  if (extracted.length === 0) {
    throw new Error("No extracted past paper questions available");
  }

  const questions: AiGeneratedQuestion[] = extracted.map((q) => {
    const questionType = mapQuestionType(q.questionType);
    const bloomLevel = mapBloom(q.cognitiveLevel ?? q.bloomLevel);

    const question: AiGeneratedQuestion = {
      questionNumber: q.questionNumber,
      section: q.section,
      questionType,
      questionText: q.questionText,
      marks: q.marks,
      bloomLevel,
      difficulty: q.difficulty ?? "Moderate",
      memoAnswer: q.memoAnswer ?? `See marking guide for question ${q.questionNumber}.`,
      memoNotes: q.rubricNotes ?? undefined,
      ...(q.options?.length ? { options: q.options } : {}),
    };

    if (questionType === "PARAGRAPH" || questionType === "CASE_STUDY") {
      question.rubric = {
        criteria: buildRubric(
          { term: q.questionText.slice(0, 40), context: q.questionText },
          q.marks
        ),
      };
    }

    return question;
  });

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const sectionNames = [...new Set(questions.map((q) => q.section).filter(Boolean))] as string[];
  const sections: AiGeneratedSection[] =
    sectionNames.length > 0
      ? sectionNames.map((name) => ({
          name,
          questionNumbers: questions.filter((q) => q.section === name).map((q) => q.questionNumber),
        }))
      : [
          {
            name: "Section A",
            questionNumbers: questions.map((q) => q.questionNumber),
          },
        ];

  return {
    instructions:
      input.instructions?.trim() ||
      `Past paper assessment — ${input.title}. Total marks: ${totalMarks}.`,
    sections,
    questions,
    totalMarks,
    generatedAt: new Date().toISOString(),
    sourceExcerpt: (sourceExcerpt ?? extracted.map((q) => q.questionText).join(" ")).slice(0, 500),
    mock: false,
  };
}

export function generateDraftFromQuestionBank(
  input: AiGenerationInput,
  bankItems: {
    questionText: string;
    marks: number;
    expectedAnswer?: string | null;
    memoNotes?: string | null;
    cognitiveLevel?: string | null;
    difficulty?: string | null;
    topic?: string | null;
    rubricNotes?: string | null;
  }[]
): AiGeneratedDraft {
  const questions: AiGeneratedQuestion[] = bankItems.map((item, index) => {
    const questionNumber = String(index + 1);
    const questionType = mapQuestionType(detectQuestionTypeFromText(item.questionText));

    return {
      questionNumber,
      section: index < Math.ceil(bankItems.length / 2) ? "Section A" : "Section B",
      questionType,
      questionText: item.questionText,
      marks: item.marks,
      bloomLevel: mapBloom(item.cognitiveLevel ?? undefined),
      difficulty: item.difficulty ?? "Moderate",
      memoAnswer: item.expectedAnswer ?? `Marking guide for question ${questionNumber}.`,
      memoNotes: item.memoNotes ?? undefined,
      ...(item.rubricNotes
        ? {
            rubric: {
              criteria: [{ name: "Rubric", description: item.rubricNotes, maxMarks: item.marks }],
            },
          }
        : {}),
    };
  });

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);

  return {
    instructions: input.instructions?.trim() || `Assessment from question library - ${input.title}.`,
    sections: [
      {
        name: "Section A",
        questionNumbers: questions.filter((q) => q.section === "Section A").map((q) => q.questionNumber),
      },
      {
        name: "Section B",
        questionNumbers: questions.filter((q) => q.section === "Section B").map((q) => q.questionNumber),
      },
    ].filter((s) => s.questionNumbers.length > 0),
    questions,
    totalMarks,
    generatedAt: new Date().toISOString(),
    sourceExcerpt: "Question bank selection",
    mock: false,
  };
}

function detectQuestionTypeFromText(text: string): string {
  const t = text.toLowerCase();
  if (/which\s+one\s+of\s+the\s+following/.test(t)) return "MULTIPLE_CHOICE";
  if (/true\s+or\s+false/.test(t)) return "TRUE_FALSE";
  if (/match/.test(t)) return "MATCH_COLUMNS";
  if (/paragraph/.test(t)) return "PARAGRAPH";
  return "SHORT";
}
