/**
 * Phase 1E live verification against the local disposable database/API.
 * Run: node backend/scripts/verifyPhase1eTeacherReview.mjs
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
const DATABASE_URL = readFileSync(envPath, "utf8")
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
const API = process.env.API_URL || "http://localhost:3001";

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "ScriptCheck2026!" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const teacherToken = await login("teacher@scriptcheck-demo.school");
  const hodToken = await login("hod.math@scriptcheck-demo.school");

  // Existing records load with safe defaults
  const sample = await prisma.learnerScript.findFirst({
    where: { flaggedForReview: false, privateTeacherNotes: null },
    select: { id: true, flaggedForReview: true, privateTeacherNotes: true },
  });
  assert.ok(sample, "expected an existing script with defaults");
  const detail = await api(teacherToken, "GET", `/scripts/${sample.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.flaggedForReview, false);
  assert.equal(detail.json.privateTeacherNotes ?? null, null);

  // Prefer an editable script (teacher layer unlocked)
  let editable = await prisma.learnerScript.findFirst({
    where: {
      teacherLayerLocked: false,
      status: { in: ["MARKED", "MARKING", "IN_PROGRESS", "UPLOADED", "RETURNED_TO_TEACHER", "NOT_MARKED"] },
    },
    include: { batch: { select: { id: true, workspaceId: true, status: true } } },
    orderBy: { updatedAt: "desc" },
  });

  if (!editable) {
    // Unlock one disposable script for local verification only
    editable = await prisma.learnerScript.findFirst({
      include: { batch: { select: { id: true, workspaceId: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    });
    assert.ok(editable);
    await prisma.learnerScript.update({
      where: { id: editable.id },
      data: {
        teacherLayerLocked: false,
        status: "MARKED",
      },
    });
    editable = await prisma.learnerScript.findUniqueOrThrow({
      where: { id: editable.id },
      include: { batch: { select: { id: true, workspaceId: true, status: true } } },
    });
    console.log("unlocked script for verification", editable.id);
  }

  const scriptId = editable.id;
  const batchId = editable.batchId;

  // Flag / notes CRUD
  let res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    flaggedForReview: true,
    privateTeacherNotes: "Phase 1E private note",
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.flaggedForReview, true);
  assert.equal(res.json.privateTeacherNotes, "Phase 1E private note");

  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    privateTeacherNotes: "  edited note  ",
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.privateTeacherNotes, "edited note");

  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    privateTeacherNotes: "   ",
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.privateTeacherNotes, null);

  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    privateTeacherNotes: "restored before lock",
    flaggedForReview: true,
  });
  assert.equal(res.status, 200);

  // Invalid boolean / oversized
  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    flaggedForReview: "yes",
  });
  assert.equal(res.status, 400);
  assert.match(res.json.error || "", /boolean/i);

  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    privateTeacherNotes: "x".repeat(5001),
  });
  assert.equal(res.status, 400);
  assert.match(res.json.error || "", /at most 5000/i);

  // HOD can see flags/notes via analytics
  const analytics = await api(hodToken, "GET", `/script-batches/${batchId}/analytics`);
  assert.equal(analytics.status, 200);
  const row = analytics.json.scripts?.find((s) => s.id === scriptId);
  assert.ok(row, "script missing from HOD analytics");
  assert.equal(row.flaggedForReview, true);
  assert.equal(row.privateTeacherNotes, "restored before lock");

  // Lock and ensure teacher cannot edit
  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: { teacherLayerLocked: true, status: "MODERATION" },
  });
  res = await api(teacherToken, "PATCH", `/scripts/${scriptId}/teacher-review`, {
    flaggedForReview: false,
  });
  assert.equal(res.status, 403);
  assert.match(res.json.error || "", /locked/i);

  // Cross-school / wrong script id denial
  res = await api(teacherToken, "GET", `/scripts/does-not-exist-cross-school`);
  assert.equal(res.status, 404);

  // Unauthenticated denial
  const unauth = await fetch(`${API}/scripts/${scriptId}/teacher-review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flaggedForReview: false }),
  });
  assert.ok([401, 403].includes(unauth.status));

  // Restore editable state without wiping notes for browser journey
  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: {
      teacherLayerLocked: false,
      status: "MARKED",
      flaggedForReview: true,
      privateTeacherNotes: "restored before lock",
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        scriptId,
        batchId,
        defaultsVerified: true,
        validationVerified: true,
        lockVerified: true,
        hodVisibilityVerified: true,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
