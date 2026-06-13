/**
 * E2E: Mark one learner paper via Quick Scan path (steps 1–13).
 * Run: node backend/scripts/e2eMarkOnePaper.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || "http://localhost:3001";

const QUESTION_PAPER_TEXT = `
GRADE 6 LIFE SKILLS — TERM 2 EXAMINATION

SECTION A

1.1 Which one of the following acts is a form of social bullying? (2)
A) Helping a friend with homework
B) Spreading rumours about a classmate
C) Sharing lunch with someone
D) Inviting someone to join a game

1.2 What are hormones? (2)

1.3 The time between childhood and adulthood is called... (2)

MEMORANDUM

1.1 B — Spreading rumours is social bullying (2)
1.2 Hormones are chemical messengers that control growth and development (2)
1.3 Adolescence (2)
`.trim();

const steps = [];
let failedStep = null;
let rootCause = null;

function pass(step, detail) {
  steps.push({ step, status: "PASS", detail });
  console.log(`Step ${step}: PASS — ${detail}`);
}

function fail(step, cause) {
  failedStep = step;
  rootCause = cause;
  steps.push({ step, status: "FAIL", detail: cause });
  console.error(`Step ${step}: FAIL — ${cause}`);
  throw new Error(`Failed at step ${step}: ${cause}`);
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

  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status}: ${data?.error ?? text}`);
  }
  return data;
}

async function makeQuestionPaperDocx(text) {
  const txtPath = path.join(os.tmpdir(), `sc-qp-${Date.now()}.txt`);
  const docxPath = `${txtPath.replace(/\.txt$/, "")}.docx`;
  fs.writeFileSync(txtPath, text, "utf-8");
  execSync(`textutil -convert docx "${txtPath}" -output "${docxPath}"`);
  return fs.readFileSync(docxPath);
}
async function makeTextPdf(lines) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const lineHeight = 14;

  for (const line of lines) {
    if (y < 72) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(line, { x: 50, y, size: 11, font, maxWidth: 500 });
    y -= lineHeight;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function main() {
  console.log("=== E2E: Mark One Paper (Quick Scan) ===\n");

  // Step 1 — /marking reachable (frontend dev server optional; API health)
  try {
    await api("/auth/login", {
      method: "POST",
      body: {
        email: "teacher@scriptcheck-demo.school",
        password: "ScriptCheck2026!",
      },
    });
    pass(1, "Backend reachable; /marking flow can proceed (login OK)");
  } catch (err) {
    fail(1, err.message);
  }

  const login = await api("/auth/login", {
    method: "POST",
    body: {
      email: "teacher@scriptcheck-demo.school",
      password: "ScriptCheck2026!",
    },
  });
  const token = login.token;

  const curriculums = await api("/curriculum", { token });
  const curriculum = curriculums.find((c) => c.code === "CAPS") ?? curriculums[0];
  const phases = await api(`/curriculum/${curriculum.id}/phases`, { token });
  const phase = phases[0];
  const grades = await api(`/curriculum/phases/${phase.id}/grades`, { token });
  const grade = grades[0];
  const subjects = await api(`/curriculum/phases/${phase.id}/subjects`, { token });
  const subject = subjects[0];

  // Step 2 — Quick Scan (create marking pack)
  let pack;
  try {
    pack = await api("/marking/pack", {
      method: "POST",
      token,
      body: {
        title: `E2E Quick Scan ${Date.now()}`,
        curriculumId: curriculum.id,
        phaseId: phase.id,
        gradeId: grade.id,
        subjectId: subject.id,
        pagesPerScript: 1,
        totalMarks: 6,
      },
    });
    await api(`/assessments/${pack.assessmentId}/setup`, {
      method: "PUT",
      token,
      body: {
        term: "Term 2",
        totalMarks: 6,
        questionCount: 3,
        pagesPerScript: 1,
      },
    });
    pass(2, `Quick Scan pack created (${pack.assessmentId})`);
  } catch (err) {
    fail(2, err.message);
  }

  // Step 3 — Upload question paper
  try {
    const qpDocx = await makeQuestionPaperDocx(QUESTION_PAPER_TEXT);
    const qpForm = new FormData();
    qpForm.append(
      "file",
      new Blob([qpDocx], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "question-paper.docx"
    );
    qpForm.append("documentType", "QUESTION_PAPER");
    await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, {
      method: "POST",
      token,
      formData: qpForm,
    });
    pass(3, "Question paper uploaded");
  } catch (err) {
    fail(3, err.message);
  }

  // Step 4 — Memo embedded in paper (skip separate memo)
  pass(4, "Memo embedded in question paper MEMORANDUM section");

  // Step 5 — Upload one learner answer booklet
  let upload;
  try {
    const answersPdf = await makeTextPdf(["Learner 1 answer page"], "learner-answers");
    const uploadForm = new FormData();
    uploadForm.append(
      "files",
      new Blob([answersPdf], { type: "application/pdf" }),
      "learner-answers.pdf"
    );
    upload = await api(`/script-batches/${pack.batchId}/bulk-upload`, {
      method: "POST",
      token,
      formData: uploadForm,
    });
    if (upload.scriptsCreated !== 1) {
      fail(5, `Expected 1 script, got ${upload.scriptsCreated}`);
    }
    pass(5, "One learner answer booklet uploaded (1 script)");
  } catch (err) {
    fail(5, err.message);
  }

  // Step 6 — Upload & Verify (finalize quick scan)
  let finalize;
  try {
    finalize = await api(`/marking/pack/${pack.assessmentId}/finalize-quick-scan`, {
      method: "POST",
      token,
    });
    if (finalize.questionsCreated < 1) {
      fail(6, `No questions extracted (${finalize.questionsCreated})`);
    }
    pass(6, `Finalize OK — ${finalize.questionsCreated} questions extracted`);
  } catch (err) {
    fail(6, err.message);
  }

  // Step 7 — Confirm split
  try {
    const verification =
      upload.verification ??
      (await api(`/script-batches/${pack.batchId}/verification`, { token }));
    if (verification.detectedScriptCount !== 1) {
      fail(7, `Expected 1 script in verification, got ${verification.detectedScriptCount}`);
    }
    const confirmed = await api(`/script-batches/${pack.batchId}/verification/confirm`, {
      method: "POST",
      token,
    });
    pass(7, `Split confirmed — ${confirmed.detectedScriptCount} script(s)`);
  } catch (err) {
    fail(7, err.message);
  }

  // Step 8 — Open Learner Script 1
  let script;
  try {
    const batch = await api(`/script-batches/${pack.batchId}`, { token });
    script = batch.learnerScripts?.[0];
    if (!script) fail(8, "No learner script found");
    pass(8, `Learner Script 1 opened (${script.id}, #${script.scriptNumber})`);
  } catch (err) {
    fail(8, err.message);
  }

  // Step 9 — Show questions + memo answers
  try {
    const questions = await api(`/assessments/${pack.assessmentId}/questions`, { token });
    const qList = questions.questions ?? questions;
    const placeholders = qList.filter((q) =>
      /quick scan placeholder/i.test(q.questionText ?? "")
    );
    if (placeholders.length) {
      fail(9, "Placeholder questions still present");
    }
    const withMemo = qList.filter((q) => q.expectedAnswer?.trim());
    if (withMemo.length < qList.length) {
      fail(
        9,
        `Missing memo answers: ${withMemo.length}/${qList.length} questions have expectedAnswer`
      );
    }

    const scriptDetail = await api(`/scripts/${script.id}`, { token });
    if (!scriptDetail.questionMarks?.length) {
      fail(9, "Script has no question mark rows");
    }
    const withText = scriptDetail.questionMarks.filter((m) => m.questionText?.trim());
    const scriptWithMemo = scriptDetail.questionMarks.filter((m) => m.expectedAnswer?.trim());
    if (!withText.length) {
      fail(9, "Script question marks missing questionText");
    }
    if (!scriptWithMemo.length) {
      fail(9, "Script question marks missing expectedAnswer (memo)");
    }

    pass(
      9,
      `${qList.length} real questions, ${scriptWithMemo.length} memo answers on script, ${scriptDetail.questionMarks.length} mark rows`
    );
  } catch (err) {
    fail(9, err.message);
  }

  // Steps 10–11 — Enter marks and save
  let saved;
  try {
    const scriptDetail = await api(`/scripts/${script.id}`, { token });
    const marksPayload = scriptDetail.questionMarks.map((m, i) => ({
      assessmentQuestionId: m.assessmentQuestionId,
      teacherMark: i === 0 ? 2 : 1,
      teacherComment: `E2E mark Q${m.questionNumber}`,
    }));

    saved = await api(`/scripts/${script.id}/marks`, {
      method: "PUT",
      token,
      body: { marks: marksPayload },
    });

    const totalAwarded = saved.questionMarks.reduce(
      (sum, m) => sum + (m.teacherMark ?? 0),
      0
    );
    if (totalAwarded <= 0) fail(11, "Saved marks total is 0");
    pass(10, `Entered marks on ${marksPayload.length} questions`);
    pass(11, `Marks saved (teacher total: ${saved.teacherTotal ?? totalAwarded})`);
  } catch (err) {
    if (!failedStep) fail(10, err.message);
    else fail(11, err.message);
  }

  // Steps 12–13 — Refresh and verify persistence
  try {
    const refreshed = await api(`/scripts/${script.id}`, { token });
    const persisted = refreshed.questionMarks.every((m) => m.teacherMark != null);
    if (!persisted) {
      fail(13, "Marks not persisted after refresh");
    }
    pass(12, "Refreshed script detail from API");
    pass(
      13,
      `Marks persisted: ${refreshed.questionMarks.map((m) => `Q${m.questionNumber}=${m.teacherMark}`).join(", ")}`
    );
  } catch (err) {
    if (!failedStep) fail(12, err.message);
    else fail(13, err.message);
  }

  console.log("\n=== ALL 13 STEPS PASSED ===");
  console.log(JSON.stringify({ assessmentId: pack.assessmentId, scriptId: script.id, steps }, null, 2));
}

main().catch((err) => {
  console.error("\n=== E2E FAILED ===");
  console.error(`Failed step: ${failedStep ?? "unknown"}`);
  console.error(`Root cause: ${rootCause ?? err.message}`);
  process.exit(1);
});
