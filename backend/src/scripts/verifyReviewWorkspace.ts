/**
 * Phase 7.5 — Review Workspace verification
 * npm run verify:review-workspace --workspace=backend
 */

import { generateFromBlueprint } from "../services/aiAssessmentEngine";
import { getPswLifeSkillsGrade6Blueprint } from "../services/frameworkEngine";
import {
  buildReviewReport,
  computeCognitiveAnalysis,
  computeFrameworkCompliance,
} from "../services/reviewAnalysis";
import { generateAiAssessmentPdf } from "../services/aiAssessmentExport";

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

function assert(condition: boolean, label: string) {
  console.log(`${label}: ${condition ? "PASS" : "FAIL"}`);
  if (!condition) process.exitCode = 1;
}

console.log("=== Phase 7.5 Review Workspace Verification ===\n");

const blueprint = getPswLifeSkillsGrade6Blueprint();
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

const materials = [
  { reviewConfirmed: true, uploadPurpose: "STUDY_MATERIAL" },
  { reviewConfirmed: true, uploadPurpose: "ASSESSMENT_FRAMEWORK" },
];

const cognitive = computeCognitiveAnalysis(draft, blueprint);
assert(cognitive.totals.lowOrder === 12, "Low Order = 12 marks");
assert(cognitive.totals.middleOrder === 12, "Middle Order = 12 marks");
assert(cognitive.totals.highOrder === 6, "High Order = 6 marks");
assert(cognitive.passed, "Cognitive 40/40/20 validation PASS");
assert(cognitive.rows.length === 18, "Cognitive table has 18 rows");

const framework = computeFrameworkCompliance(draft, blueprint, materials);
assert(framework.passed, "Framework compliance PASS");
assert(framework.overallStatus === "FRAMEWORK COMPLIANT", "Overall FRAMEWORK COMPLIANT");
assert(
  framework.checks.some((c) => c.id === "section_a" && c.passed),
  "Section A = 15 marks check"
);
assert(
  framework.checks.some((c) => c.id === "section_b" && c.passed),
  "Section B = 15 marks check"
);
assert(
  framework.checks.some((c) => c.id === "memo" && c.passed),
  "Memo generated check"
);
assert(
  framework.checks.some((c) => c.id === "rubric" && c.passed),
  "Rubric generated check"
);

const report = buildReviewReport(draft, blueprint, materials);
assert(report.reviewComplete, "Review report complete — ready for approval");

const numbering = draft.questions.map((q) => q.questionNumber);
assert(numbering.includes("1.1") && numbering.includes("5.3"), "Numbering 1.1–5.3 present");
assert(numbering.includes("6") && numbering.includes("7") && numbering.includes("8"), "Q6–8 present");

const hasMemo = draft.questions.every((q) => q.memoAnswer?.trim());
assert(hasMemo, "Every question has memo answer");

const q7 = draft.questions.find((q) => q.questionNumber === "7");
assert(Boolean(q7?.rubric?.criteria?.length), "Question 7 has rubric");

async function verifyExports() {
  const paper = await generateAiAssessmentPdf(draft, "Test", "question-paper");
  const memo = await generateAiAssessmentPdf(draft, "Test", "memorandum");
  const rubric = await generateAiAssessmentPdf(draft, "Test", "rubric");
  const pack = await generateAiAssessmentPdf(draft, "Test", "complete-pack");

  assert(paper.length > 500, "Question paper PDF generated");
  assert(memo.length > 500, "Memorandum PDF generated");
  assert(rubric.length > 500, "Rubric PDF generated");
  assert(pack.length > paper.length, "Complete pack PDF merges documents");
}

verifyExports()
  .then(() => {
    if (process.exitCode === 1) {
      console.log("\nPhase 7.5 verification FAILED.");
      process.exit(1);
    }
    console.log("\nPhase 7.5 review workspace verification passed.");
  })
  .catch((err) => {
    console.error("Export verification failed:", err);
    process.exit(1);
  });
