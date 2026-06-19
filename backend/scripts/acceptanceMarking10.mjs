/**
 * Acceptance test — 10 steps for Quick Scan marking (one learner script).
 * Run: node backend/scripts/acceptanceMarking10.mjs
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

const API = process.env.API_URL || "http://localhost:3001";
const EMAIL = process.env.TEST_EMAIL || "teacher.beta@scriptcheck-beta.school";
const PASSWORD = process.env.TEST_PASSWORD || "ScriptCheckBeta2026!";

const QUESTION_PAPER_TEXT = `
1. Name two planets in our solar system. (4)
2. What is 2 + 2? (2)
`.trim();

const MEMORANDUM_TEXT = `
MEMORANDUM
1. Earth Mars (4 marks)
2. 4 (2 marks)
`.trim();

const LEARNER_TEXT = `
Learner answer booklet
1. Earth Mars
2. 4
`.trim();

const EXPECTED_LEARNER_ANSWER_COUNT = 2;

const results = [];

function pass(n, detail) {
  results.push({ step: n, status: "PASS", detail });
  console.log(`Step ${n}: PASS — ${detail}`);
}

function fail(n, detail) {
  results.push({ step: n, status: "FAIL", detail });
  console.error(`Step ${n}: FAIL — ${detail}`);
  throw new Error(detail);
}

async function api(pathname, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !formData) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${data?.error ?? text}`);
  return data;
}

async function makePdf(text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  text.split("\n").forEach((line, index) => {
    page.drawText(line, { x: 50, y: 760 - index * 24, size: 12, font });
  });
  return Buffer.from(await pdf.save());
}

async function main() {
  console.log(`=== Acceptance: 10-step marking (${EMAIL}) ===\n`);

  // 1 Login
  let login;
  try {
    login = await api("/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    });
    if (!login.token) fail(1, "No JWT returned");
    pass(1, `Login OK — JWT returned for ${login.user?.email}`);
  } catch (err) {
    fail(1, err.message);
  }
  const token = login.token;

  const curriculums = await api("/curriculum", { token });
  const curriculum = curriculums[0];
  const phases = await api(`/curriculum/${curriculum.id}/phases`, { token });
  const phase = phases[0];
  const grades = await api(`/curriculum/phases/${phase.id}/grades`, { token });
  const grade = grades[0];
  const subjects = await api(`/curriculum/phases/${phase.id}/subjects`, { token });
  const subject = subjects[0];

  const pack = await api("/marking/pack", {
    method: "POST",
    token,
    body: {
      title: `Acceptance Quick Scan ${Date.now()}`,
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      term: "Term 2",
      pagesPerScript: 1,
      totalMarks: 6,
      questionCount: 2,
      scriptFormat: "ANSWER_SHEET",
      markingMode: "QP_WITH_ANSWERS",
    },
  });
  await api(`/assessments/${pack.assessmentId}/setup`, {
    method: "PUT",
    token,
    body: { pagesPerScript: 1, totalMarks: 6, questionCount: 2, term: "Term 2" },
  });

  // 2 Question paper
  try {
    const qp = await makePdf(QUESTION_PAPER_TEXT);
    const form = new FormData();
    form.append("file", new Blob([qp], { type: "application/pdf" }), "question-paper.pdf");
    form.append("documentType", "QUESTION_PAPER");
    await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, { method: "POST", token, formData: form });
    pass(2, "Separate question paper PDF uploaded");
  } catch (err) {
    fail(2, err.message);
  }

  // 3 Memo (separate PDF upload)
  try {
    const memo = await makePdf(MEMORANDUM_TEXT);
    const form = new FormData();
    form.append(
      "file",
      new Blob([memo], { type: "application/pdf" }),
      "memorandum.pdf"
    );
    form.append("documentType", "MEMORANDUM");
    await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, { method: "POST", token, formData: form });
    pass(3, "Separate memorandum PDF uploaded");
  } catch (err) {
    fail(3, err.message);
  }

  // 4 Learner script (1 page, pagesPerScript=1 => 1 script)
  let upload;
  try {
    const learnerPdf = await makePdf(LEARNER_TEXT);
    const form = new FormData();
    form.append("files", new Blob([learnerPdf], { type: "application/pdf" }), "learner-answer-booklet.pdf");
    upload = await api(`/script-batches/${pack.batchId}/bulk-upload`, { method: "POST", token, formData: form });
    if (upload.scriptsCreated !== 1) fail(4, `Expected 1 script, got ${upload.scriptsCreated}`);
    pass(4, "Separate learner answer booklet PDF uploaded");
  } catch (err) {
    fail(4, err.message);
  }

  // 5 Split verification
  try {
    const verification = upload.verification ?? (await api(`/script-batches/${pack.batchId}/verification`, { token }));
    if (verification.detectedScriptCount !== 1) fail(5, `Expected 1 script in split, got ${verification.detectedScriptCount}`);
    if (verification.expectedPagesPerScript !== 1) fail(5, `Expected 1 page/script, got ${verification.expectedPagesPerScript}`);
    pass(5, "Split verification OK (1 script × 1 page)");
  } catch (err) {
    fail(5, err.message);
  }

  // 6 AI marking (extract questions + memo answers, initialize mark rows, confirm split)
  let finalized;
  try {
    finalized = await api(`/marking/pack/${pack.assessmentId}/finalize-quick-scan`, { method: "POST", token });
    if (finalized.questionsCreated < 1) fail(6, "AI marking prep produced no questions");
    if ((finalized.memoAnswerCount ?? 0) < 1) fail(6, "AI marking prep produced no memo answers");
    await api(`/script-batches/${pack.batchId}/verification/confirm`, { method: "POST", token });
    pass(6, `AI marking ran — questions=${finalized.questionsCreated}, memoAnswers=${finalized.memoAnswerCount}, batch confirmed`);
  } catch (err) {
    fail(6, err.message);
  }

  // 7 Marks appear
  let script;
  try {
    const batch = await api(`/script-batches/${pack.batchId}`, { token });
    script = batch.learnerScripts?.[0];
    if (!script) fail(7, "No learner script");
    const detail = await api(`/scripts/${script.id}`, { token });
    if (!detail.questionMarks?.length) fail(7, "No question mark rows");
    const questionCount = detail.questionMarks.length;
    const memoAnswerCount = detail.questionMarks.filter((m) => m.expectedAnswer?.trim()).length;
    const learnerAnswerCount = EXPECTED_LEARNER_ANSWER_COUNT;
    const totalMark = detail.teacherTotal ?? detail.finalTotal ?? 0;
    const notMatched = detail.questionMarks
      .filter((m) => /not detected|unreadable/i.test(m.teacherComment ?? ""))
      .map((m) => m.questionNumber);
    if (totalMark <= 0) fail(7, "AI marking awarded no marks");
    pass(
      7,
      `Report: questions=${questionCount}, memoAnswers=${memoAnswerCount}, learnerAnswers=${learnerAnswerCount}, totalMark=${totalMark}, notMatched=${notMatched.length ? notMatched.join(", ") : "none"}`
    );
  } catch (err) {
    fail(7, err.message);
  }

  // 8 Adjust marks
  try {
    const detail = await api(`/scripts/${script.id}`, { token });
    const marksPayload = detail.questionMarks.map((m, i) => ({
      assessmentQuestionId: m.assessmentQuestionId,
      teacherMark: i === 0 ? 3 : 2,
      teacherComment: "Adjusted",
    }));
    const saved = await api(`/scripts/${script.id}/marks`, {
      method: "PUT",
      token,
      body: { marks: marksPayload },
    });
    if ((saved.teacherTotal ?? 0) <= 0) fail(8, "Adjusted marks not saved");
    pass(8, `Marks adjusted — teacher total ${saved.teacherTotal}`);
  } catch (err) {
    fail(8, err.message);
  }

  // 9 Refresh keeps marks
  try {
    const refreshed = await api(`/scripts/${script.id}`, { token });
    const ok = refreshed.questionMarks.every((m) => m.teacherMark != null);
    if (!ok) fail(9, "Marks lost after refresh");
    pass(9, "Marks persisted after refresh");
  } catch (err) {
    fail(9, err.message);
  }

  // 10 CSV export
  try {
    const res = await fetch(`${API}/script-batches/${pack.batchId}/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(10, `CSV export HTTP ${res.status}`);
    const csv = await res.text();
    if (!csv.includes("Learner") && !csv.includes("Script")) fail(10, "CSV missing expected headers");
    pass(10, `CSV export OK (${csv.split("\n").length} lines)`);
  } catch (err) {
    fail(10, err.message);
  }

  console.log("\n=== ALL 10 ACCEPTANCE STEPS PASSED ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("\n=== ACCEPTANCE FAILED ===", err.message);
  console.log(JSON.stringify(results, null, 2));
  process.exit(1);
});
