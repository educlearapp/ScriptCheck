/**
 * Phase 7.2 — Framework Enforcement verification
 * npm run verify:framework --workspace=backend
 */

import { sanitizeOcrText, containsOcrGarbage } from "../services/contentSanitizer";
import {
  buildBlueprintFromFramework,
  getPswLifeSkillsGrade6Blueprint,
  validateDraftAgainstBlueprint,
} from "../services/frameworkEngine";
import { generateFromBlueprint } from "../services/aiAssessmentEngine";

const PSW_FRAMEWORK = `
PSW MODIFIED FRAMEWORK — GRADE 6 LIFE SKILLS

SECTION A = 15 MARKS

Question 1
1.1 1.2 1.3
MCQ — 1 mark each

Question 2
2.1 2.2 2.3
Explain terms — 1 mark each

Question 3
3.1 3.2 3.3
Matching — 1 mark each

Question 4
4.1 4.2 4.3
True / False — 1 mark each

Question 5
5.1 5.2 5.3
Comprehension — 1 mark each

SECTION B = 15 MARKS

Question 6 — Constructed Response — 5 marks
Question 7 — Paragraph / Essay — 5 marks
Question 8 — Advice / Goal Setting — 5 marks

TOTAL = 30
`;

const STUDY_MATERIAL = `
BODY CHANGES AND ADOLESCENCE
Adolescence is the period between childhood and adulthood when the body changes rapidly.
Hormones are chemical messengers that control growth and development during puberty.

BULLYING
Bullying is repeated aggressive behaviour intended to hurt another person.
Social bullying includes spreading rumours and excluding someone from a group.

MEDIATION AND PEACEKEEPING
Mediation is a peaceful way to resolve conflict between people.
Peacekeeping means creating a calm environment where everyone feels safe.

CULTURAL RITES
Lobola is a custom where the groom's family gives gifts to the bride's family.
A rite of passage marks an important stage in a person's life.

DIGNITY
Dignity means treating every person with respect and worth.
`;

const DIRTY_OCR = `
Adolescence is the period between childhood and adulthood.
Aals 11000 Bil spreading rumours is social bullying.
Peacekeeping L (3 i ne.) means creating calm.
Oca1ea37 hormones control growth.
IMG_6633
`;

function assert(condition: boolean, label: string) {
  console.log(`${label}: ${condition ? "PASS" : "FAIL"}`);
  if (!condition) process.exitCode = 1;
}

console.log("=== Framework Enforcement Verification ===\n");

const blueprint = buildBlueprintFromFramework(PSW_FRAMEWORK);
assert(blueprint.totalMarks === 30, "Blueprint total = 30 marks");
assert(blueprint.slots.length === 18, "Blueprint has 18 question slots");
assert(blueprint.slots[0].questionNumber === "1.1", "First slot is 1.1");
assert(blueprint.slots[0].marks === 1, "1.1 is 1 mark");
assert(blueprint.slots[0].questionType === "MULTIPLE_CHOICE", "1.1 is MCQ");
assert(blueprint.slots[15].questionNumber === "6", "Question 6 exists");
assert(blueprint.slots[15].marks === 5, "Question 6 is 5 marks");
assert(blueprint.slots[17].questionNumber === "8", "Question 8 exists");
assert(blueprint.slots[17].marks === 5, "Question 8 is 5 marks");

const pswDefault = getPswLifeSkillsGrade6Blueprint();
assert(pswDefault.slots.length === 18, "PSW default blueprint has 18 slots");

const cleaned = sanitizeOcrText(DIRTY_OCR);
assert(!containsOcrGarbage(cleaned), "Sanitizer removes OCR garbage");
assert(!cleaned.toLowerCase().includes("aals"), "No 'Aals' garbage");
assert(!cleaned.includes("IMG_6633"), "No filename garbage");
assert(cleaned.toLowerCase().includes("adolescence"), "Keeps valid content");

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

console.log(`\nGenerated ${draft.questions.length} questions, total ${draft.totalMarks} marks\n`);

for (const q of draft.questions) {
  console.log(
    `${q.section} Q${q.questionNumber} (${q.marks}m) [${q.questionType}] ${q.questionText.slice(0, 60)}…`
  );
}

const validation = validateDraftAgainstBlueprint(draft, blueprint);
assert(validation.passed, "Framework validation passed");
assert(draft.totalMarks === 30, "Draft total = 30");

const q11 = draft.questions.find((q) => q.questionNumber === "1.1");
assert(q11?.marks === 1, "Q1.1 = 1 mark");
assert(q11?.questionType === "MULTIPLE_CHOICE", "Q1.1 = MCQ");
assert(
  Boolean(
    q11?.questionText.toLowerCase().includes("social bullying") ||
      q11?.questionText.toLowerCase().includes("following")
  ),
  "Q1.1 social bullying MCQ"
);

const q31 = draft.questions.find((q) => q.questionNumber === "3.1");
assert(q31?.questionType === "MATCH_COLUMNS", "Q3.1 = Matching");

const q6 = draft.questions.find((q) => q.questionNumber === "6");
assert(q6?.marks === 5, "Q6 = 5 marks");

const q8 = draft.questions.find((q) => q.questionNumber === "8");
assert(q8?.marks === 5, "Q8 = 5 marks");

const hasGarbage = draft.questions.some((q) => containsOcrGarbage(q.questionText));
assert(!hasGarbage, "No OCR garbage in generated questions");

const allHaveMemo = draft.questions.every((q) => q.memoAnswer?.trim());
assert(allHaveMemo, "All questions have memo answers");

const paragraphQ = draft.questions.find((q) => q.questionNumber === "7");
assert(Boolean(paragraphQ?.rubric?.criteria?.length), "Q7 has rubric");

if (process.exitCode === 1) {
  console.log("\nFramework verification FAILED.");
  process.exit(1);
}

console.log("\nFramework enforcement verification passed.");
