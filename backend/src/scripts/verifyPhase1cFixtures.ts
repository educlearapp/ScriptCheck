/**
 * Backend verification for Phase 1C extractable fixtures (production extractors).
 * Run: node backend/dist/scripts/verifyPhase1cFixtures.js
 */
import path from "path";
import {
  extractQuestionsFromPastPaper,
  parseMemoAnswers,
} from "../services/pastPaperExtractor";
import { extractTextFromFile } from "../services/contentExtraction";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const fix = path.resolve(__dirname, "../../../frontend/src/__fixtures__/phase1c");
  const qp = await extractTextFromFile("DOCX", path.join(fix, "question-paper.docx"));
  assert(qp.status === "EXTRACTED" || qp.text.trim().length > 0, "QP extract");
  const qs = extractQuestionsFromPastPaper(qp.text);
  assert(qs.length === 2, `expected 2 questions, got ${qs.length}`);
  assert(qs[0].questionNumber === "1" && qs[0].marks === 2, "q1");
  assert(qs[1].questionNumber === "2" && qs[1].marks === 3, "q2");

  const memo = await extractTextFromFile("DOCX", path.join(fix, "memorandum.docx"));
  const answers = parseMemoAnswers(memo.text);
  assert(answers.get("1")?.toLowerCase().includes("pretoria"), "memo1");
  assert(answers.get("2")?.toLowerCase().includes("red"), "memo2");

  console.log("verifyPhase1cFixtures: PASS", {
    questions: qs.map((q) => ({ n: q.questionNumber, marks: q.marks, text: q.questionText })),
    memo: [...answers.entries()],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
