/**
 * Phase 7.1 — Grade 6 Life Skills past paper extraction verification.
 * Run: npm run verify:past-paper --workspace=backend
 */
import { extractQuestionsFromPastPaper } from "../services/pastPaperExtractor";
import { isPlaceholderText } from "../services/contentConcepts";

const SAMPLE_PAST_PAPER = `
GRADE 6 LIFE SKILLS — TERM 2 EXAMINATION

SECTION A

1.1 Which one of the following acts is a form of social bullying? (2)
A) Helping a friend with homework
B) Spreading rumours about a classmate
C) Sharing lunch with someone
D) Inviting someone to join a game

1.2 What are hormones? (2)

1.3 The time between childhood and adulthood is called... (2)

1.4 True or False: Mediation always involves punishment. (2)

SECTION B

2.1 Explain priorities. (4)

2.2 Explain dignity. (4)

2.3 Explain lobola. (4)

MEMORANDUM

1.1 B — Spreading rumours is social bullying (2)
1.2 Hormones are chemical messengers that control growth and development (2)
1.3 Adolescence (2)
1.4 False — Mediation resolves conflict peacefully (2)
2.1 Priorities are the things that are most important in your life (4)
2.2 Dignity means treating every person with respect (4)
2.3 Lobola is a custom where the groom's family gives gifts to the bride's family (4)
`.trim();

const EXPECTED_SNIPPETS = [
  "social bullying",
  "hormones",
  "childhood and adulthood",
  "priorities",
  "dignity",
  "lobola",
];

function main() {
  console.log("=== Past Paper Extraction Verification ===\n");

  if (isPlaceholderText(SAMPLE_PAST_PAPER)) {
    console.error("FAIL: sample treated as placeholder");
    process.exit(1);
  }

  const questions = extractQuestionsFromPastPaper(SAMPLE_PAST_PAPER, "grade-6-life-skills.pdf");

  console.log(`Extracted ${questions.length} questions:\n`);
  for (const q of questions) {
    console.log(
      `${q.section ?? ""} Q${q.questionNumber} (${q.marks}m) [${q.questionType}] ${q.questionText.slice(0, 70)}…`
    );
    if (q.memoAnswer) console.log(`   Memo: ${q.memoAnswer.slice(0, 60)}…`);
  }

  const allText = questions.map((q) => q.questionText.toLowerCase()).join(" ");
  let passed = 0;
  for (const snippet of EXPECTED_SNIPPETS) {
    const ok = allText.includes(snippet);
    console.log(`\nContains "${snippet}": ${ok ? "PASS" : "FAIL"}`);
    if (ok) passed += 1;
  }

  const hasMemos = questions.filter((q) => q.memoAnswer).length;
  console.log(`\nQuestions with memo: ${hasMemos}/${questions.length}`);
  console.log(`Sections detected: ${[...new Set(questions.map((q) => q.section).filter(Boolean))].join(", ")}`);

  if (passed < EXPECTED_SNIPPETS.length - 1 || questions.length < 5) {
    process.exit(1);
  }

  console.log("\nPast paper verification passed.");
}

main();
