/**
 * Option 1 API acceptance — QP + 4 learner pages, no memo.
 * Run: node backend/scripts/option1Acceptance.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";

const API = process.env.API_URL || "http://localhost:3001";

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

async function makeQpDocx() {
  const txtPath = path.join(os.tmpdir(), `sc-opt1-${Date.now()}.txt`);
  const docxPath = txtPath.replace(/\.txt$/, ".docx");
  fs.writeFileSync(
    txtPath,
    "GRADE 3 TEST\n\n1. Name two colours. (2)\n2. What is 1+1? (2)\n",
    "utf-8"
  );
  execSync(`textutil -convert docx "${txtPath}" -output "${docxPath}"`);
  return fs.readFileSync(docxPath);
}

async function makeLearnerPdf(label) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`${label}: red, blue. 1+1=2`, { x: 50, y: 750, size: 12, font });
  return Buffer.from(await pdf.save());
}

async function main() {
  console.log("=== Option 1 API Acceptance ===\n");

  const login = await api("/auth/login", {
    method: "POST",
    body: { email: "teacher@scriptcheck-demo.school", password: "ScriptCheck2026!" },
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

  const pack = await api("/marking/pack", {
    method: "POST",
    token,
    body: {
      title: `Option 1 Test ${Date.now()}`,
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      pagesPerScript: 1,
      totalMarks: 4,
      questionCount: 2,
      markingMode: "QP_LEARNER_ONLY",
      scriptFormat: "ANSWER_SHEET",
    },
  });
  console.log("✓ marking pack created", pack.assessmentId);

  const qpBuf = await makeQpDocx();
  const qpForm = new FormData();
  qpForm.append(
    "file",
    new Blob([qpBuf], {
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
  console.log("✓ question paper uploaded (no memo)");

  const learnerBuf = await makeLearnerPdf("Learner 1");
  const uploadForm = new FormData();
  uploadForm.append("files", new Blob([learnerBuf]), "learner-1.pdf");
  uploadForm.append("files", new Blob([learnerBuf]), "learner-2.pdf");
  uploadForm.append("files", new Blob([learnerBuf]), "learner-3.pdf");
  uploadForm.append("files", new Blob([learnerBuf]), "learner-4.pdf");
  await api(`/script-batches/${pack.batchId}/bulk-upload`, {
    method: "POST",
    token,
    formData: uploadForm,
  });
  console.log("✓ 4 learner pages uploaded");

  const confirmed = await api(`/script-batches/${pack.batchId}/verification/confirm`, {
    method: "POST",
    token,
  });
  console.log("✓ confirm & AI marking", confirmed.detectedScriptCount, "scripts");

  const setup = await api(`/assessments/${pack.assessmentId}/setup`, { token });
  if (!setup.markingGuideReady) {
    throw new Error(`markingGuideReady=false: ${JSON.stringify(setup)}`);
  }
  console.log("✓ AI marking guide ready");

  const scriptId = confirmed.scripts[0]?.scriptId;
  const script = await api(`/scripts/${scriptId}`, { token });
  const marks = script.questionMarks ?? [];
  if (marks.length === 0) throw new Error("No question marks on script");
  const hasMarks = marks.some((m) => m.teacherMark != null && m.teacherMark > 0);
  if (!hasMarks) throw new Error("AI did not assign marks");
  console.log("✓ marks assigned:", marks.map((m) => `${m.questionNumber}=${m.teacherMark}`).join(", "));

  await api(`/scripts/${scriptId}/marks`, {
    method: "PUT",
    token,
    body: {
      marks: marks.map((m) => ({
        assessmentQuestionId: m.assessmentQuestionId,
        teacherMark: 2,
      })),
    },
  });
  console.log("✓ marks saved");

  const afterSave = await api(`/scripts/${scriptId}`, { token });
  const q1 = afterSave.questionMarks[0]?.teacherMark;
  if (q1 !== 2) throw new Error(`Save failed: Q1=${q1}`);
  console.log("✓ marks persisted");

  const csvRes = await fetch(`${API}/script-batches/${pack.batchId}/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!csvRes.ok) throw new Error(`CSV export failed: ${csvRes.status}`);
  const csv = await csvRes.text();
  if (!csv.includes("Learner")) throw new Error("CSV missing learner data");
  console.log("✓ CSV export OK");

  console.log("\nOPTION 1 API ACCEPTANCE: PASSED");
}

main().catch((err) => {
  console.error("\nOPTION 1 API ACCEPTANCE: FAILED —", err.message);
  process.exit(1);
});
