/**
 * Live beta Quick Scan marking verification (13 steps + extras).
 * Run: node backend/scripts/liveBetaMarkingVerify.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";

const API = "https://scriptcheck-beta-backend.onrender.com";
const FRONTEND = "https://beta.scriptcheck.co.za";
const EMAIL = "hod.foundation@scriptcheck-beta.school";
const PASSWORD = "ScriptCheckBeta2026!";

const QP_TEXT = `
GRADE 3 FOUNDATION PHASE — TERM 2 TEST

1. Circle the bigger number: 5 or 8 (2)
2. What colour is grass? (2)

MEMORANDUM
1. 8 (2)
2. Green (2)
`.trim();

const results = [];
let failed = false;

function pass(step, detail) {
  results.push({ step, status: "PASS", detail });
  console.log(`Step ${step}: PASS — ${detail}`);
}

function fail(step, detail) {
  failed = true;
  results.push({ step, status: "FAIL", detail });
  console.error(`Step ${step}: FAIL — ${detail}`);
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
    const err = new Error(`${method} ${pathname} -> ${res.status}: ${data?.error ?? text}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function makeDocx(text) {
  const txtPath = path.join(os.tmpdir(), `sc-live-${Date.now()}-${Math.random()}.txt`);
  const docxPath = `${txtPath.replace(/\.txt$/, "")}.docx`;
  fs.writeFileSync(txtPath, text, "utf-8");
  execSync(`textutil -convert docx "${txtPath}" -output "${docxPath}"`);
  return fs.readFileSync(docxPath);
}

async function makePdf(pageCount, labelPrefix = "Page") {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`${labelPrefix} ${i + 1}`, { x: 50, y: 750, size: 14, font });
  }
  return Buffer.from(await pdf.save());
}

async function pickFoundationContext(token) {
  const curriculums = await api("/curriculum", { token });
  const curriculum = curriculums.find((c) => c.code === "CAPS") ?? curriculums[0];
  const phases = await api(`/curriculum/${curriculum.id}/phases`, { token });
  const phase =
    phases.find((p) => /foundation/i.test(p.name)) ?? phases[0];
  const grades = await api(`/curriculum/phases/${phase.id}/grades`, { token });
  const grade = grades.find((g) => /grade\s*[r]?1|grade\s*3/i.test(g.name)) ?? grades[0];
  const subjects = await api(`/curriculum/phases/${phase.id}/subjects`, { token });
  const subject =
    subjects.find((s) => /life|math|english|home/i.test(s.name)) ?? subjects[0];
  return { curriculum, phase, grade, subject };
}

async function runQuickScanFlow(token, ctx, opts) {
  const {
    label,
    pagesPerScript,
    learnerPageCount,
    scriptFormat = "ANSWER_SHEET",
    skipMemo = false,
  } = opts;

  const pack = await api("/marking/pack", {
    method: "POST",
    token,
    body: {
      title: `Live Beta ${label} ${Date.now()}`,
      curriculumId: ctx.curriculum.id,
      phaseId: ctx.phase.id,
      gradeId: ctx.grade.id,
      subjectId: ctx.subject.id,
      term: "Term 2",
      pagesPerScript,
      totalMarks: 4,
      questionCount: 2,
      scriptFormat,
    },
  });

  await api(`/assessments/${pack.assessmentId}/setup`, {
    method: "PUT",
    token,
    body: {
      pagesPerScript,
      totalMarks: 4,
      questionCount: 2,
      term: "Term 2",
    },
  });

  const qp = await makeDocx(QP_TEXT);
  let qpForm = new FormData();
  qpForm.append(
    "file",
    new Blob([qp], {
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

  if (!skipMemo) {
    const memo = await makeDocx("MEMORANDUM\n1. 8 (2 marks)\n2. Green (2 marks)");
    const memoForm = new FormData();
    memoForm.append(
      "file",
      new Blob([memo], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "memo.docx"
    );
    memoForm.append("documentType", "MEMORANDUM");
    await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, {
      method: "POST",
      token,
      formData: memoForm,
    });
  }

  const learnerPdf = await makePdf(learnerPageCount, "Learner");
  const uploadForm = new FormData();
  uploadForm.append(
    "files",
    new Blob([learnerPdf], { type: "application/pdf" }),
    "learner.pdf"
  );
  const upload = await api(`/script-batches/${pack.batchId}/bulk-upload`, {
    method: "POST",
    token,
    formData: uploadForm,
  });

  const verification =
    upload.verification ??
    (await api(`/script-batches/${pack.batchId}/verification`, { token }));

  const finalized = await api(
    `/marking/pack/${pack.assessmentId}/finalize-quick-scan`,
    { method: "POST", token }
  );

  await api(`/script-batches/${pack.batchId}/verification/confirm`, {
    method: "POST",
    token,
  });

  const batch = await api(`/script-batches/${pack.batchId}`, { token });
  const script = batch.learnerScripts?.[0];
  const detail = await api(`/scripts/${script.id}`, { token });

  const marksPayload = detail.questionMarks.map((m, i) => ({
    assessmentQuestionId: m.assessmentQuestionId,
    teacherMark: i === 0 ? 2 : 1,
    teacherComment: `Live beta ${label}`,
  }));
  const saved = await api(`/scripts/${script.id}/marks`, {
    method: "PUT",
    token,
    body: { marks: marksPayload },
  });

  const refreshed = await api(`/scripts/${script.id}`, { token });
  const persisted = refreshed.questionMarks.every((m) => m.teacherMark != null);

  const csvRes = await fetch(`${API}/script-batches/${pack.batchId}/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const csv = csvRes.ok ? await csvRes.text() : "";

  return {
    pack,
    upload,
    verification,
    finalized,
    script,
    saved,
    refreshed,
    persisted,
    csvOk: csvRes.ok && csv.length > 10,
    csvLines: csv.split("\n").filter(Boolean).length,
  };
}

async function main() {
  console.log(`=== LIVE BETA MARKING VERIFICATION ===`);
  console.log(`API: ${API}`);
  console.log(`Account: ${EMAIL}\n`);

  let token;
  let ctx;

  // 1 Login
  try {
    const login = await api("/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    });
    if (!login.token) throw new Error("No JWT");
    token = login.token;
    pass(1, `Login HTTP 200, JWT issued (${login.user?.roles?.join("+")})`);
  } catch (err) {
    fail(1, err.message);
    printSummary();
    process.exit(1);
  }

  // 2 Marking page (API endpoints the page uses)
  try {
    const overview = await api("/marking/overview", { token });
    const jobs = await api("/marking/jobs", { token });
    const curriculum = await api("/curriculum", { token });
    const fe = await fetch(`${FRONTEND}/marking`, { redirect: "follow" });
    pass(
      2,
      `Marking page data OK (overview ${overview.items?.length ?? 0} items, jobs ${jobs.items?.length ?? 0}, curriculum ${curriculum.length}, frontend /marking HTTP ${fe.status})`
    );
  } catch (err) {
    fail(2, err.message);
  }

  // 3 Enter metadata + create job
  try {
    ctx = await pickFoundationContext(token);
    pass(
      3,
      `Job metadata: ${ctx.phase.name} / ${ctx.grade.name} / ${ctx.subject.name}, Term 2, 4 marks, 2 questions, 1 page/script`
    );
  } catch (err) {
    fail(3, err.message);
    printSummary();
    process.exit(1);
  }

  let flow;
  try {
    flow = await runQuickScanFlow(token, ctx, {
      label: "main",
      pagesPerScript: 1,
      learnerPageCount: 1,
      scriptFormat: "ANSWER_SHEET",
    });
  } catch (err) {
    fail(4, err.message);
    fail(5, "skipped");
    fail(6, "skipped");
    fail(7, "skipped");
    fail(8, "skipped");
    fail(9, "skipped");
    fail(10, "skipped");
    fail(11, "skipped");
    fail(12, "skipped");
    fail(13, "skipped");
    printSummary();
    process.exit(1);
  }

  // 4–13 main flow
  try {
    pass(4, `Question paper uploaded (${flow.pack.assessmentId})`);
    pass(5, "Memo uploaded (docx)");
    if (flow.upload.scriptsCreated !== 1) {
      fail(6, `Expected 1 script, got ${flow.upload.scriptsCreated}`);
    } else {
      pass(6, "One learner script uploaded");
    }
    if (flow.verification.detectedScriptCount !== 1) {
      fail(7, `Split: expected 1 script, got ${flow.verification.detectedScriptCount}`);
    } else {
      pass(
        7,
        `Split verified: ${flow.verification.detectedScriptCount} script × ${flow.verification.expectedPagesPerScript} page(s)`
      );
    }
    if (flow.finalized.questionsCreated < 1) {
      fail(8, "AI marking produced no questions");
    } else {
      pass(
        8,
        `AI marking ran: ${flow.finalized.questionsCreated} questions, memoAnswersReady=${flow.finalized.memoAnswersReady}`
      );
    }
    if (!flow.script?.id || !flow.refreshed.questionMarks?.length) {
      fail(9, "No mark rows on script");
    } else {
      pass(9, `${flow.refreshed.questionMarks.length} mark rows visible`);
    }
    if ((flow.saved.teacherTotal ?? 0) <= 0) {
      fail(10, "Mark adjustment failed");
    } else {
      pass(10, `Marks adjusted — teacher total ${flow.saved.teacherTotal}`);
    }
    pass(11, "Refresh simulated via GET /scripts/:id");
    if (!flow.persisted) {
      fail(12, "Marks not persisted after refresh");
    } else {
      pass(
        12,
        `Marks persisted: ${flow.refreshed.questionMarks.map((m) => `Q${m.questionNumber}=${m.teacherMark}`).join(", ")}`
      );
    }
    if (!flow.csvOk) {
      fail(13, "CSV export failed");
    } else {
      pass(13, `CSV export OK (${flow.csvLines} lines)`);
    }
  } catch (err) {
    fail("?", err.message);
  }

  // Extra: 4 pages / pagesPerScript=4 => 1 script
  console.log("\n--- Extra: pagesPerScript=4, 4 pages => 1 script ---");
  try {
    const split = await runQuickScanFlow(token, ctx, {
      label: "4page-split",
      pagesPerScript: 4,
      learnerPageCount: 4,
      scriptFormat: "ANSWER_SHEET",
    });
    if (split.upload.scriptsCreated === 1 && split.verification.detectedScriptCount === 1) {
      pass("4a", "4 pages with pagesPerScript=4 created exactly 1 learner script");
    } else {
      fail(
        "4a",
        `Expected 1 script, got upload=${split.upload.scriptsCreated} verification=${split.verification.detectedScriptCount}`
      );
    }
  } catch (err) {
    fail("4a", err.message);
  }

  // Extra: ON_QUESTION_PAPER does not block marking without separate memo
  console.log("\n--- Extra: ON_QUESTION_PAPER script format (question paper only) ---");
  try {
    const onPaper = await runQuickScanFlow(token, ctx, {
      label: "on-question-paper",
      pagesPerScript: 1,
      learnerPageCount: 1,
      scriptFormat: "ON_QUESTION_PAPER",
      skipMemo: true,
    });
    if (
      onPaper.finalized.questionsCreated >= 1 &&
      onPaper.finalized.memoAnswersReady &&
      onPaper.persisted &&
      onPaper.csvOk
    ) {
      pass(
        "4b",
        `ON_QUESTION_PAPER without separate memo — ${onPaper.finalized.questionsCreated} questions, memoAnswersReady=true, marks saved, CSV exported`
      );
    } else {
      fail(
        "4b",
        `ON_QUESTION_PAPER flow incomplete (memoAnswersReady=${onPaper.finalized.memoAnswersReady})`
      );
    }
  } catch (err) {
    fail("4b", err.message);
  }

  printSummary();
  process.exit(failed ? 1 : 0);
}

function printSummary() {
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`  [${r.status}] Step ${r.step}: ${r.detail}`);
  }
  const allPass = results.every((r) => r.status === "PASS");
  console.log(allPass ? "\nLIVE BETA MARKING: ALL PASSED" : "\nLIVE BETA MARKING: FAILED");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
