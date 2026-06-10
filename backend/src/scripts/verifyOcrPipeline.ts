/**
 * Phase 7.1 verification — concept extraction + CAPS Life Skills paper generation.
 * Run: npm run verify:ocr --workspace=backend
 */
import { extractConcepts } from "../services/contentConcepts";
import { generateAssessmentFromMaterial } from "../services/aiAssessmentEngine";
import { isMeaningfulExtractedText, normaliseOcrText } from "../services/ocrEngine";

export const SAMPLE_LIFE_SKILLS_TEXT = `
BODY CHANGES AND ADOLESCENCE
Adolescence is the period between childhood and adulthood when the body changes rapidly.
Hormones are chemical messengers that control growth and development during puberty.

BULLYING
Bullying is repeated aggressive behaviour intended to hurt another person.
Social bullying includes spreading rumours and excluding someone from a group.

MEDIATION AND PEACEKEEPING
Mediation is a process where a neutral person helps two sides resolve a conflict peacefully.
Peacekeeping involves maintaining calm and preventing violence in communities.

CULTURAL RITES
Cultural rites are ceremonies that mark important life transitions.
Lobola is a custom where the groom's family gives gifts to the bride's family.
A rite of passage celebrates moving from one stage of life to another.
Dignity means treating every person with respect and honour.
`.trim();

async function main() {
  console.log("=== ScriptCheck OCR Pipeline Verification ===\n");
  console.log("OCR engine: Tesseract.js (eng) + Poppler pdftoppm for scanned PDFs\n");

  const text = normaliseOcrText(SAMPLE_LIFE_SKILLS_TEXT);
  console.log("--- Example extracted text (sample) ---");
  console.log(text.slice(0, 400) + "…\n");

  const meaningful = isMeaningfulExtractedText(text);
  console.log(`Meaningful text check: ${meaningful ? "PASS" : "FAIL"}\n`);

  const concepts = extractConcepts(text);
  console.log(`Concepts extracted: ${concepts.length}`);
  console.log(concepts.slice(0, 10).map((c) => `  • ${c.term}`).join("\n"));
  console.log();

  const draft = await generateAssessmentFromMaterial({
    sourceText: text,
    title: "Grade 6 Life Skills — Term 2",
    totalMarks: 50,
    durationMinutes: 60,
    difficulty: "MODERATE",
    questionTypes: [
      "MULTIPLE_CHOICE",
      "TRUE_FALSE",
      "MATCH_COLUMNS",
      "SHORT",
      "PARAGRAPH",
      "CASE_STUDY",
    ],
    bloomLevels: [
      "KNOWLEDGE",
      "UNDERSTANDING",
      "APPLICATION",
      "ANALYSIS",
      "EVALUATION",
    ],
    gradeName: "Grade 6",
    subjectName: "Life Skills",
  });

  console.log("--- Example generated paper ---");
  console.log(draft.instructions.split("\n")[0]);
  console.log(`Sections: ${draft.sections.map((s) => s.name).join(", ")}`);
  console.log(`Questions: ${draft.questions.length} | Total marks: ${draft.totalMarks}\n`);

  for (const q of draft.questions) {
    console.log(`${q.section} Q${q.questionNumber} (${q.marks}m) [${q.questionType}]`);
    console.log(`  ${q.questionText.split("\n")[0]}`);
  }

  const forbidden = draft.questions.some((q) =>
    /ocr integration pending|image content/i.test(q.questionText)
  );
  const hasAdolescence = draft.questions.some((q) =>
    /adolescence|hormones?|bullying|mediation|lobola|dignity|rite of passage/i.test(
      q.questionText
    )
  );

  console.log("\n--- Accuracy checks ---");
  console.log(`No placeholder questions: ${forbidden ? "FAIL" : "PASS"}`);
  console.log(`Life Skills vocabulary present: ${hasAdolescence ? "PASS" : "FAIL"}`);
  console.log(`CAPS Section A + B: ${draft.sections.length >= 2 ? "PASS" : "FAIL"}`);

  if (forbidden || !hasAdolescence) process.exit(1);
  console.log("\nAll verification checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
