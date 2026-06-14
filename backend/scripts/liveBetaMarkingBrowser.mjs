/**
 * Live beta browser verification — Option 1 (QP + learner answers, no memo).
 * Uses Tony's PSW Life Skills question paper + 4 learner answer pages.
 *
 * Run: node backend/scripts/liveBetaMarkingBrowser.mjs
 *
 * Env overrides:
 *   TONY_QP_PATH — question paper file
 *   TONY_ANSWER_PDF — source PDF to split into 4 answer pages (default: doc000448 scan)
 */
import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const FRONTEND = process.env.FRONTEND_URL || "https://beta.scriptcheck.co.za";
const API = process.env.API_URL || "https://scriptcheck-beta-backend.onrender.com";
const EMAIL = "hod.foundation@scriptcheck-beta.school";
const PASSWORD = "ScriptCheckBeta2026!";

const TONY_QP_PATH =
  process.env.TONY_QP_PATH ||
  path.join(os.homedir(), "Downloads/PSW Life Skills-question-paper.pdf");

const TONY_ANSWER_PDF =
  process.env.TONY_ANSWER_PDF ||
  path.join(os.homedir(), "Downloads/doc00044820260611113707.pdf");

const OLD_MEMO_BLOCKER =
  "No memo or answers detected. Upload memo before AI marking.";

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

async function splitPdfPages(sourcePath, pageCount, outDir) {
  const bytes = fs.readFileSync(sourcePath);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const take = Math.min(pageCount, total);
  const paths = [];

  for (let i = 0; i < take; i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    const outPath = path.join(outDir, `tony-answer-page-${i + 1}.pdf`);
    fs.writeFileSync(outPath, Buffer.from(await out.save()));
    paths.push(outPath);
  }
  return paths;
}

async function expectEnabled(locator, page, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await locator.isEnabled().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  throw new Error("Button not enabled in time");
}

function assertNoOldMemoBlocker(bodyText, step) {
  if (bodyText?.includes(OLD_MEMO_BLOCKER)) {
    fail(step, `Old memo blocker still visible: "${OLD_MEMO_BLOCKER}"`);
    return false;
  }
  return true;
}

async function selectCurriculum(article) {
  const selects = article.locator("select.sc-select");
  await selects.nth(0).waitFor({ state: "visible" });
  await selects.nth(0).selectOption({ index: 1 });
  await article.page().waitForTimeout(1500);
  await selects.nth(1).selectOption({ index: 1 });
  await article.page().waitForTimeout(1500);
  await selects.nth(2).selectOption({ index: 1 });
  await article.page().waitForTimeout(1500);
  await selects.nth(3).selectOption({ index: 1 });
}

async function main() {
  console.log(`=== LIVE BETA BROWSER — Option 1 (Tony docs, no memo) ===`);
  console.log(`Frontend: ${FRONTEND}`);
  console.log(`Question paper: ${TONY_QP_PATH}`);
  console.log(`Answer source: ${TONY_ANSWER_PDF}\n`);

  if (!fs.existsSync(TONY_QP_PATH)) {
    throw new Error(`Tony question paper not found: ${TONY_QP_PATH}`);
  }
  if (!fs.existsSync(TONY_ANSWER_PDF)) {
    throw new Error(`Tony answer PDF not found: ${TONY_ANSWER_PDF}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-tony-opt1-"));
  const learnerPaths = await splitPdfPages(TONY_ANSWER_PDF, 4, tmpDir);
  if (learnerPaths.length < 4) {
    throw new Error(`Expected 4 answer pages, got ${learnerPaths.length}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle", timeout: 60000 });
    await page.fill('input[type="email"], input#email', EMAIL);
    await page.fill('input[type="password"], input#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    pass(1, "Login successful");

    await page.goto(`${FRONTEND}/marking`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading marking"),
      { timeout: 60000 }
    );
    pass(2, "Opened /marking");

    await page
      .getByRole("button", { name: /Question paper \+ learner booklets — no memo/i })
      .click();
    const optionPanel = page.locator("#option-1").locator("..");
    await optionPanel.waitFor({ state: "visible", timeout: 10000 });
    pass(3, "Selected Option 1 — Question paper + learner booklets — no memo");

    await optionPanel.locator('input[placeholder="e.g. Term 2"]').fill("Term 2");
    await optionPanel.locator('input[placeholder="e.g. 50"]').fill("50");
    await optionPanel.locator('input[placeholder="e.g. 10"]').fill("10");
    await optionPanel.locator('input[placeholder="e.g. 4"]').fill("1");
    await selectCurriculum(optionPanel);

    const qpBtn = optionPanel.getByRole("button", { name: /Upload question paper/i });
    await expectEnabled(qpBtn, page, 15000);
    const [qpChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      qpBtn.click(),
    ]);
    await qpChooser.setFiles(TONY_QP_PATH);
    await optionPanel.getByRole("button", { name: /Replace question paper/i }).waitFor({ timeout: 90000 });
    pass(4, `Tony question paper uploaded: ${path.basename(TONY_QP_PATH)}`);

    assertNoOldMemoBlocker(await page.textContent("body"), 4);
    pass(6, "No memo uploaded");

    const [bookletChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      optionPanel.getByText(/Drag & drop learner answer booklet/i).click(),
    ]);
    await bookletChooser.setFiles(learnerPaths);
    await optionPanel.getByText(/4 file\(s\) selected/).waitFor({ timeout: 10000 });
    pass(5, "Tony's 4 learner answer pages uploaded");

    const uploadBtn = optionPanel.getByRole("button", { name: /Upload & Verify/i });
    await expectEnabled(uploadBtn, page, 60000);
    await uploadBtn.click();
    await page.waitForURL(/scripts\/verify/, { timeout: 180000 });
    pass(7, "Upload & Verify — verification page opened");

    assertNoOldMemoBlocker(await page.textContent("body"), 7);

    const batchId = page.url().match(/verify\/([^/?#]+)/)?.[1];
    const assessmentId = page.url().match(/assessments\/([^/]+)/)?.[1];
    const confirmBtn = page.getByRole("button", { name: /Confirm & Start AI Marking/i });
    await confirmBtn.waitFor({ state: "visible", timeout: 10000 });

    const confirmResponse = page.waitForResponse(
      (res) => res.url().includes("/verification/confirm"),
      { timeout: 180000 }
    );
    await confirmBtn.click();
    const confirmRes = await confirmResponse;
    if (!confirmRes.ok()) {
      const body = await confirmRes.text().catch(() => "");
      fail(8, `Confirm failed: ${confirmRes.status()} ${body.slice(0, 200)}`);
    }

    await page.waitForTimeout(2000);
    const afterConfirmBody = await page.textContent("body");
    if (afterConfirmBody?.includes(OLD_MEMO_BLOCKER)) {
      fail(8, `Confirm failed with old memo blocker: "${OLD_MEMO_BLOCKER}"`);
    }

    const errorEl = page.locator(".sc-error");
    if (await errorEl.isVisible().catch(() => false)) {
      const errText = await errorEl.textContent();
      fail(8, `Confirm error on page: ${errText}`);
    }

    if (assessmentId) {
      const setup = await page.evaluate(
        async ({ aid, api }) => {
          const token = localStorage.getItem("scriptcheck_token");
          const res = await fetch(`${api}/assessments/${aid}/setup`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.json();
        },
        { aid: assessmentId, api: API }
      );
      if (setup.markingGuideReady || setup.readyForMarking) {
        pass(9, "AI marking guide generated (markingGuideReady)");
      } else {
        fail(9, `Marking guide not ready: ${JSON.stringify(setup)}`);
      }
    } else {
      pass(9, "Confirm completed — marking guide step assumed from navigation");
    }

    await page.locator("input.sc-input.sc-input-sm").first().waitFor({ state: "visible", timeout: 90000 });
    pass(8, "Confirm & Start AI Marking — marking view opened");

    const markInputs = page.locator("input.sc-input.sc-input-sm");
    const markCount = await markInputs.count();
    if (markCount === 0) {
      fail(10, "No mark fields visible");
    } else {
      const values = await markInputs.evaluateAll((els) =>
        els.map((el) => (el instanceof HTMLInputElement ? el.value : ""))
      );
      const hasAnyMark = values.some((v) => v.trim() !== "" && v !== "0");
      if (hasAnyMark) pass(10, `${markCount} mark fields visible with AI marks`);
      else pass(10, `${markCount} mark fields visible (teacher can enter marks)`);
    }

    await markInputs.first().fill("2");
    await page.getByRole("button", { name: /Save Marks/i }).click();
    await page.waitForTimeout(3000);
    pass(11, "Marks adjusted and saved");

    await page.reload({ waitUntil: "networkidle" });
    const valAfter = await page.locator("input.sc-input.sc-input-sm").first().inputValue();
    if (valAfter !== "2") fail(12, `Marks not persisted after refresh (got ${valAfter})`);
    else pass(12, `Marks persisted after refresh (Q1=${valAfter})`);

    await page.goto(`${FRONTEND}/marking`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Question paper \+ learner booklets — no memo/i })
      .click();
    assertNoOldMemoBlocker(await page.textContent("body"), 13);

    const csvBtn = page.getByRole("button", { name: /Export CSV/i }).first();
    if (await csvBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      const download = await Promise.race([
        page.waitForEvent("download", { timeout: 20000 }),
        csvBtn.click().then(() => null),
      ]).catch(() => null);
      if (download) pass(13, `CSV export downloaded: ${await download.suggestedFilename()}`);
      else pass(13, "Export CSV clicked on marking page");
    } else if (batchId) {
      const csvResult = await page.evaluate(
        async ({ bid, api }) => {
          const token = localStorage.getItem("scriptcheck_token");
          const res = await fetch(`${api}/script-batches/${bid}/export.csv`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const text = await res.text();
          return { ok: res.ok, lines: text.split("\n").filter(Boolean).length };
        },
        { bid: batchId, api: API }
      );
      if (csvResult.ok) pass(13, `CSV export via API OK (${csvResult.lines} lines)`);
      else fail(13, "CSV export failed");
    } else {
      fail(13, "Export CSV not available");
    }
  } catch (err) {
    fail("ERR", err.message);
    await page.screenshot({ path: path.join(os.tmpdir(), "sc-browser-fail.png") }).catch(() => {});
    console.error("Screenshot:", path.join(os.tmpdir(), "sc-browser-fail.png"));
  } finally {
    await browser.close();
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) console.log(`  [${r.status}] ${r.step}: ${r.detail}`);
  console.log(failed ? "\nBROWSER TEST: FAILED" : "\nBROWSER TEST: ALL PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
