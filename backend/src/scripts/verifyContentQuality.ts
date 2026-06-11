/**
 * Phase 7.4 — Content Quality Engine verification
 * npm run verify:content-quality --workspace=backend
 */

import {
  containsOcrGarbage,
  isIncompleteOcrFragment,
  isValidConceptTerm,
  validateQuestionConceptQuality,
} from "../services/contentSanitizer";
import { extractConcepts, conceptQuestionStem } from "../services/contentConcepts";
import { buildBlueprintFromFramework } from "../services/frameworkEngine";
import { generateFromBlueprint } from "../services/aiAssessmentEngine";

const FRAMEWORK = `
LIFE SKILLS PSW (4 -6) TEST MODIFIED FRAMEWORK.
Section A | Multiple choice | Explain terms | Matching | True / False | Comprehension
Section B | Constructed response | Paragraph | Advice
Total Marks 30
`;

const STUDY_MATERIAL = `
BODY CHANGES AND ADOLESCENCE
Adolescence is the period between childhood and adulthood.
Hormones are chemical messengers that control growth and development.

BULLYING
Social bullying includes spreading rumours and excluding someone from a group.

MEDIATION AND PEACEKEEPING
Mediation is a peaceful way to resolve conflict.

CULTURAL RITES
Lobola is a custom where the groom's family gives gifts to the bride's family.

DIGNITY
Dignity means treating every person with respect and worth.
`;

const DIRTY_OCR = `
AALS 11000 bil spreading rumours is social bullying.
Peacekeeping L (3 i ne. means creating calm.
IMG_6633
weddings funerals ards
sl la
`;

function assert(condition: boolean, label: string) {
  console.log(`${label}: ${condition ? "PASS" : "FAIL"}`);
  if (!condition) process.exitCode = 1;
}

console.log("=== Phase 7.4 Content Quality Engine Verification ===\n");

assert(!isValidConceptTerm("ards"), "Reject fragment: ards");
assert(!isValidConceptTerm("weddings"), "Reject fragment: weddings");
assert(!isValidConceptTerm("funerals"), "Reject fragment: funerals");
assert(!isValidConceptTerm("IMG_6633"), "Reject filename: IMG_6633");
assert(!isValidConceptTerm("Aals 11000 Bil"), "Reject OCR garbage: Aals 11000 Bil");
assert(isIncompleteOcrFragment("ards"), "Detect incomplete OCR: ards");

const concepts = extractConcepts(DIRTY_OCR + "\n" + STUDY_MATERIAL);
assert(!concepts.some((c) => /^(ards|weddings|funerals|aals)/i.test(c.term)), "No garbage concepts");
assert(concepts.some((c) => c.term === "Hormones"), "Extract Hormones");
assert(concepts.some((c) => c.term === "Adolescence"), "Extract Adolescence");
assert(concepts.some((c) => c.term === "Dignity"), "Extract Dignity");

const hormones = concepts.find((c) => c.term === "Hormones")!;
assert(
  conceptQuestionStem(hormones, "definition") === "Explain the term Hormones.",
  "Definition stem: Explain the term Hormones."
);

const badStem = validateQuestionConceptQuality("What funerals?");
assert(!badStem.valid, "Reject weak stem: What funerals?");

const blueprint = buildBlueprintFromFramework(FRAMEWORK);
const draft = generateFromBlueprint({
  blueprint,
  studyText: STUDY_MATERIAL,
  genInput: {
    sourceText: STUDY_MATERIAL,
    title: "Grade 6 Life Skills PSW Test",
    totalMarks: 30,
    difficulty: "MODERATE",
    questionTypes: [],
    bloomLevels: [],
    gradeName: "Grade 6",
    subjectName: "Life Skills",
  },
});

assert(draft.questions.every((q) => !containsOcrGarbage(q.questionText)), "No OCR garbage in draft");
assert(
  draft.questions.every((q) => validateQuestionConceptQuality(q.questionText).valid),
  "All questions pass concept validation"
);

const q21 = draft.questions.find((q) => q.questionNumber === "2.1");
const q22 = draft.questions.find((q) => q.questionNumber === "2.2");
const q23 = draft.questions.find((q) => q.questionNumber === "2.3");
assert(q21?.questionText === "Explain the term Hormones.", "Q2.1 Explain the term Hormones.");
assert(q22?.questionText === "Explain the term Adolescence.", "Q2.2 Explain the term Adolescence.");
assert(q23?.questionText === "Explain the term Dignity.", "Q2.3 Explain the term Dignity.");

const q31 = draft.questions.find((q) => q.questionNumber === "3.1");
assert(q31?.questionText.includes("COLUMN A") ?? false, "Q3.1 has COLUMN A");
assert(q31?.questionText.includes("COLUMN B") ?? false, "Q3.1 has COLUMN B");
assert(!(q31?.questionText.includes("IMG_") ?? false), "Q3.1 no merged OCR fragments");

assert(!draft.questions.some((q) => /^what (?:is|are) /i.test(q.questionText)), "No weak What is/are stems");

console.log("\nDone.");
