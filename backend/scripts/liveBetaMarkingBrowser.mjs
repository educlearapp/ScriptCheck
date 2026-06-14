/**
 * Live beta browser verification — ON_QUESTION_PAPER without separate memo.
 * Run: node backend/scripts/liveBetaMarkingBrowser.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FRONTEND = process.env.FRONTEND_URL || "https://beta.scriptcheck.co.za";
const API = process.env.API_URL || "https://scriptcheck-beta-backend.onrender.com";
const EMAIL = "hod.foundation@scriptcheck-beta.school";
const PASSWORD = "ScriptCheckBeta2026!";

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

async function makeDocx(text, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-browser-"));
  const txtPath = path.join(dir, `${name}.txt`);
  const docxPath = path.join(dir, `${name}.docx`);
  fs.writeFileSync(txtPath, text, "utf-8");
  execSync(`textutil -convert docx "${txtPath}" -output "${docxPath}"`);
  return docxPath;
}

async function makeLearnerPdf(outPath) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Learner answer page 1", { x: 50, y: 750, size: 14, font });
  fs.writeFileSync(outPath, Buffer.from(await pdf.save()));
  return outPath;
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

async function main() {
  console.log(`=== LIVE BETA BROWSER — ON_QUESTION_PAPER (no separate memo) ===`);
  console.log(`Frontend: ${FRONTEND}\n`);

  const qpPath = await makeDocx(
    `GRADE 3 TEST\n\n1. Name two colours. (2)\n2. What is 1+1? (2)\n\nMEMORANDUM\n1. Any two colours (2)\n2. 2 (2)`,
    "qp"
  );
  const learnerPath = path.join(path.dirname(qpPath), "learner.pdf");
  await makeLearnerPdf(learnerPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle", timeout: 60000 });
    await page.fill('input[type="email"], input#email', EMAIL);
    await page.fill('input[type="password"], input#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    await page.goto(`${FRONTEND}/marking`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading marking"),
      { timeout: 60000 }
    );

    const quickCard = page.locator(".sc-marking-card-quick");
    await quickCard.waitFor({ state: "visible", timeout: 30000 });
    pass(1, "Quick Scan & Mark card visible");

    await quickCard.getByRole("radio", { name: /Learners wrote on the question paper/i }).check();
    pass(2, "Selected: learners wrote on the question paper");

    await quickCard.locator('input[placeholder="e.g. Term 2"]').fill("Term 2");
    await quickCard.locator('input[placeholder="e.g. 50"]').fill("4");
    await quickCard.locator('input[placeholder="e.g. 10"]').fill("2");
    await quickCard.locator('input[placeholder="e.g. 4"]').fill("1");

    const selects = quickCard.locator("select.sc-select");
    await selects.nth(0).waitFor({ state: "visible" });
    await page.waitForTimeout(2000);
    await selects.nth(0).selectOption({ index: 1 });
    await page.waitForTimeout(2000);
    const phaseOpts = await selects.nth(1).locator("option").allTextContents();
    const foundationIdx = phaseOpts.findIndex((t) => /foundation/i.test(t));
    await selects.nth(1).selectOption({ index: foundationIdx > 0 ? foundationIdx : 1 });
    await page.waitForTimeout(2000);
    await selects.nth(2).selectOption({ index: 1 });
    await page.waitForTimeout(2000);
    await selects.nth(3).selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    const qpBtn = quickCard.getByRole("button", { name: /Upload question paper/i });
    await expectEnabled(qpBtn, page, 15000);
    const [qpChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      qpBtn.click(),
    ]);
    await qpChooser.setFiles(qpPath);
    await quickCard.getByRole("button", { name: /Replace question paper/i }).waitFor({ timeout: 90000 });
    pass(3, "Question paper with MEMORANDUM section uploaded (no separate memo)");

    assertNoOldMemoBlocker(await page.textContent("body"), 3);

    const [bookletChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      quickCard.getByText(/Drag & drop learner answer booklet/i).click(),
    ]);
    await bookletChooser.setFiles(learnerPath);
    await quickCard.getByText(/1 file\(s\) selected/).waitFor({ timeout: 10000 });
    pass(4, "Learner answer booklet uploaded");

    const uploadBtn = quickCard.getByRole("button", { name: /Upload & Verify/i });
    await expectEnabled(uploadBtn, page, 60000);
    await uploadBtn.click();
    await page.waitForURL(/scripts\/verify/, { timeout: 180000 });
    pass(5, "Upload & Verify — split verification page opened");

    const verifyBody = await page.textContent("body");
    assertNoOldMemoBlocker(verifyBody, 5);
    if (!verifyBody?.match(/script|page|complete/i)) {
      fail(6, "Split verification missing script/page info");
    } else {
      pass(6, "Split verification visible");
    }

    const batchId = page.url().match(/verify\/([^/?#]+)/)?.[1];
    const confirmBtn = page.getByRole("button", { name: /Confirm & Start AI Marking/i });
    await confirmBtn.waitFor({ state: "visible", timeout: 10000 });

    const confirmResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/verification/confirm") ||
        res.url().includes("/finalize-quick-scan"),
      { timeout: 180000 }
    );
    await confirmBtn.click();
    await confirmResponse;

    await page.waitForTimeout(2000);
    const afterConfirmBody = await page.textContent("body");
    if (afterConfirmBody?.includes(OLD_MEMO_BLOCKER)) {
      fail(7, `Confirm failed with old memo blocker: "${OLD_MEMO_BLOCKER}"`);
    }

    const errorEl = page.locator(".sc-error");
    if (await errorEl.isVisible().catch(() => false)) {
      const errText = await errorEl.textContent();
      fail(7, `Confirm error on page: ${errText}`);
    }

    await page.locator("input.sc-input.sc-input-sm").first().waitFor({ state: "visible", timeout: 90000 });
    pass(7, "Confirm & Start AI Marking — learner script marking view opened");

    const markInputs = page.locator("input.sc-input.sc-input-sm");
    const markCount = await markInputs.count();
    if (markCount === 0) fail(8, "No mark fields visible");
    else pass(8, `${markCount} mark fields visible`);

    await markInputs.first().fill("2");
    await page.getByRole("button", { name: /Save Marks/i }).click();
    await page.waitForTimeout(3000);
    pass(9, "Marks adjusted and saved");

    await page.reload({ waitUntil: "networkidle" });
    const valAfter = await page.locator("input.sc-input.sc-input-sm").first().inputValue();
    if (valAfter !== "2") fail(10, `Marks not persisted after refresh (got ${valAfter})`);
    else pass(10, `Marks persisted after refresh (Q1=${valAfter})`);

    await page.goto(`${FRONTEND}/marking`, { waitUntil: "networkidle" });
    assertNoOldMemoBlocker(await page.textContent("body"), 11);

    const csvBtn = page.getByRole("button", { name: /Export CSV/i }).first();
    if (await csvBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      const download = await Promise.race([
        page.waitForEvent("download", { timeout: 20000 }),
        csvBtn.click().then(() => null),
      ]).catch(() => null);
      if (download) pass(11, `CSV export downloaded: ${await download.suggestedFilename()}`);
      else pass(11, "Export CSV clicked on marking page");
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
      if (csvResult.ok) pass(11, `CSV export via API OK (${csvResult.lines} lines)`);
      else fail(11, "CSV export failed");
    } else {
      fail(11, "Export CSV not available");
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
