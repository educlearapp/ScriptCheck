/**
 * Phase 7.3 — Framework auto-detection verification
 * npm run verify:framework-auto --workspace=backend
 */

import { containsOcrGarbage, isValidConceptTerm, sanitizeQuestionText } from "../services/contentSanitizer";
import { extractConcepts } from "../services/contentConcepts";
import {
  assessGenerationReadiness,
  isAssessmentFrameworkText,
  isFrameworkRequiredContext,
  scoreFrameworkSignals,
} from "../services/frameworkDetector";
import { buildBlueprintFromFramework, validateDraftAgainstBlueprint } from "../services/frameworkEngine";
import { generateFromBlueprint } from "../services/aiAssessmentEngine";

const IMG_6633_FRAMEWORK = `
LIFE SKILLS PSW (4 -6) TEST MODIFIED FRAMEWORK.
Question | What learners are expected to do | Cognitive levels | Type of Questions | Score / Marks
Section A | Low order | Multiple choice | 1 mark each
Section B | High order | Paragraph / Essay | 5 marks
Total Marks 30
Middle order | True / False | Explain terms | Matching | Comprehension
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
sl la
0ca1ea37-6905-49f3-8e7a-7ffa0e516847
`;

function assert(condition: boolean, label: string) {
  console.log(`${label}: ${condition ? "PASS" : "FAIL"}`);
  if (!condition) process.exitCode = 1;
}

console.log("=== Phase 7.3 Framework Auto-Detection Verification ===\n");

assert(isAssessmentFrameworkText(IMG_6633_FRAMEWORK), "Auto-detect IMG_6633 framework text");
assert(scoreFrameworkSignals(IMG_6633_FRAMEWORK) >= 3, "Framework signal score >= 3");

assert(
  isFrameworkRequiredContext({
    curriculumName: "CAPS",
    phaseName: "Intermediate Phase",
    gradeName: "Grade 6",
    subjectName: "Life Skills",
    totalMarks: 30,
  }),
  "Framework required for CAPS G6 Life Skills 30 marks"
);

assert(!isValidConceptTerm("Aals 11000 Bil"), "Reject Aals 11000 Bil concept");
assert(!isValidConceptTerm("sl la"), "Reject sl la concept");
assert(containsOcrGarbage("Peacekeeping L (3 i ne."), "Detect truncated peacekeeping garbage");

const concepts = extractConcepts(DIRTY_OCR + "\n" + STUDY_MATERIAL);
assert(!concepts.some((c) => /aals|sl la/i.test(c.term)), "No garbage concepts extracted");

const blueprint = buildBlueprintFromFramework(IMG_6633_FRAMEWORK);
assert(blueprint.slots.length === 18, "Blueprint has 18 slots");
assert(blueprint.totalMarks === 30, "Blueprint total 30");

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

assert(draft.questions.length === 18, "Generated 18 questions");
assert(draft.questions.every((q) => !containsOcrGarbage(q.questionText)), "No OCR garbage in draft");

const validation = validateDraftAgainstBlueprint(draft, blueprint);
assert(validation.passed, "Framework validation passed");

const sectionA = draft.questions.filter((q) => q.section === "Section A").reduce((s, q) => s + q.marks, 0);
const sectionB = draft.questions.filter((q) => q.section === "Section B").reduce((s, q) => s + q.marks, 0);
assert(sectionA === 15, "Section A = 15 marks");
assert(sectionB === 15, "Section B = 15 marks");

const q11 = draft.questions.find((q) => q.questionNumber === "1.1");
assert(q11?.marks === 1 && q11.questionType === "MULTIPLE_CHOICE", "Q1.1 MCQ 1 mark");

const readinessBlocked = assessGenerationReadiness({
  frameworkText: IMG_6633_FRAMEWORK,
  frameworkRequired: true,
  frameworkDetected: true,
  materials: [
    {
      fileName: "poster.jpg",
      extractionStatus: "NEEDS_REVIEW",
      reviewConfirmed: false,
      uploadPurpose: "STUDY_MATERIAL",
    },
  ],
});
assert(!readinessBlocked.canGenerate, "Blocks generation when NEEDS_REVIEW unconfirmed");

const readinessOk = assessGenerationReadiness({
  frameworkText: IMG_6633_FRAMEWORK,
  frameworkRequired: true,
  frameworkDetected: true,
  materials: [
    {
      fileName: "framework.jpg",
      extractionStatus: "EXTRACTED",
      reviewConfirmed: true,
      uploadPurpose: "ASSESSMENT_FRAMEWORK",
    },
    {
      fileName: "notes.jpg",
      extractionStatus: "EXTRACTED",
      reviewConfirmed: true,
      uploadPurpose: "STUDY_MATERIAL",
    },
  ],
});
assert(readinessOk.canGenerate, "Allows generation when framework + study material ready");
assert(readinessOk.blueprint?.slots.length === 18, "Readiness includes blueprint");

const tfStem = sanitizeQuestionText("True or False: Aals 11000 Bil is discussed in the study material.");
assert(!containsOcrGarbage(tfStem), "Sanitized TF stem has no garbage");

if (process.exitCode === 1) {
  console.log("\nPhase 7.3 verification FAILED.");
  process.exit(1);
}

console.log("\nPhase 7.3 framework auto-detection verification passed.");
