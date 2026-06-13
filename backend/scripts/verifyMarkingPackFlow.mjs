/**
 * Verifies /marking pack upload flow: 4 pages/script, 12-page upload => 3 scripts.
 * Run: node backend/scripts/verifyMarkingPackFlow.mjs
 */
import { PDFDocument } from "pdf-lib";

const API = process.env.API_URL || "http://localhost:3001";

async function api(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !formData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
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
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? text}`);
  }
  return data;
}

async function makePdf(pageCount) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${i + 1}`, { x: 72, y: 750, size: 18 });
  }
  return Buffer.from(await pdf.save());
}

async function main() {
  const login = await api("/auth/login", {
    method: "POST",
    body: {
      email: "teacher@scriptcheck-demo.school",
      password: "ScriptCheck2026!",
    },
  });

  const token = login.token;
  const workspaceId = login.workspace?.id ?? login.workspaces?.[0]?.id;
  if (!token) throw new Error("Login failed: no token");

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
      title: `Marking Pack E2E ${Date.now()}`,
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      pagesPerScript: 4,
      totalMarks: 100,
    },
  });

  if (!pack.batchId) throw new Error("marking/pack did not return batchId");
  console.log("✓ marking pack created", { assessmentId: pack.assessmentId, batchId: pack.batchId });

  const qpPdf = await makePdf(2);
  const qpForm = new FormData();
  qpForm.append("file", new Blob([qpPdf], { type: "application/pdf" }), "question-paper.pdf");
  qpForm.append("documentType", "QUESTION_PAPER");
  await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, {
    method: "POST",
    token,
    formData: qpForm,
  });
  console.log("✓ question paper uploaded");

  const memoPdf = await makePdf(1);
  const memoForm = new FormData();
  memoForm.append("file", new Blob([memoPdf], { type: "application/pdf" }), "memo.pdf");
  memoForm.append("documentType", "MEMORANDUM");
  await api(`/assessments/${pack.assessmentId}/paper-vault/upload`, {
    method: "POST",
    token,
    formData: memoForm,
  });
  console.log("✓ memorandum uploaded");

  await api(`/assessments/${pack.assessmentId}/setup`, {
    method: "PUT",
    token,
    body: { pagesPerScript: 4 },
  });
  console.log("✓ pages per script saved (4)");

  const answersPdf = await makePdf(12);
  const uploadForm = new FormData();
  uploadForm.append("files", new Blob([answersPdf], { type: "application/pdf" }), "learner-answers.pdf");

  const upload = await api(`/script-batches/${pack.batchId}/bulk-upload`, {
    method: "POST",
    token,
    formData: uploadForm,
  });
  console.log("✓ learner answers uploaded", {
    scriptsCreated: upload.scriptsCreated,
    pagesPerScript: upload.pagesPerScript,
    totalPagesUploaded: upload.totalPagesUploaded,
  });

  const verification = upload.verification ?? (await api(`/script-batches/${pack.batchId}/verification`, { token }));

  if (verification.detectedScriptCount !== 3) {
    throw new Error(`Expected 3 scripts, got ${verification.detectedScriptCount}`);
  }
  if (verification.expectedPagesPerScript !== 4) {
    throw new Error(`Expected 4 pages/script, got ${verification.expectedPagesPerScript}`);
  }
  for (const script of verification.scripts) {
    if (script.pageCount !== 4) {
      throw new Error(`Script ${script.scriptNumber} has ${script.pageCount} pages, expected 4`);
    }
  }

  console.log("✓ verification shows 3 scripts x 4 pages");

  const confirmed = await api(`/script-batches/${pack.batchId}/verification/confirm`, {
    method: "POST",
    token,
  });
  console.log("✓ verification confirmed, batch ready for AI marking", {
    canProceed: confirmed.canProceed,
    workspaceId,
  });

  console.log("\nE2E marking pack flow PASSED");
}

main().catch((err) => {
  console.error("\nE2E marking pack flow FAILED:", err.message);
  process.exit(1);
});
