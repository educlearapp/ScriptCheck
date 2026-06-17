import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { createWorker, type Worker } from "tesseract.js";

const execFileAsync = promisify(execFile);

const OCR_LANG = process.env.OCR_LANG || "eng";
const PDF_OCR_DPI = process.env.PDF_OCR_DPI || "200";
const MAX_PDF_OCR_PAGES = Number(process.env.MAX_PDF_OCR_PAGES) || 20;

let sharedWorker: Worker | null = null;
let workerInit: Promise<Worker> | null = null;

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsModule: PdfJsModule | null = null;

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsModule) {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "legacy/build/pdf.worker.mjs"
    );
    mod.GlobalWorkerOptions.workerSrc = workerPath;
    pdfjsModule = mod;
  }
  return pdfjsModule;
}

async function getOcrWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  if (!workerInit) {
    workerInit = (async () => {
      const worker = await createWorker(OCR_LANG);
      sharedWorker = worker;
      return worker;
    })();
  }
  return workerInit;
}

export async function shutdownOcrWorker(): Promise<void> {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
    workerInit = null;
  }
}

export type OcrImageResult = {
  text: string;
  confidence: number;
};

export type OcrPdfResult = {
  text: string;
  confidence: number;
  method: string;
};

export type LearnerPageOcrDebug = {
  filePath: string;
  mimeType: string;
  method: string;
  textLength: number;
};

export type LearnerScriptOcrResult = {
  text: string;
  debug: LearnerPageOcrDebug[];
};

export async function ocrImageFile(filePath: string): Promise<OcrImageResult> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(filePath);
  return {
    text: normaliseOcrText(data.text ?? ""),
    confidence: data.confidence ?? 0,
  };
}

export async function ocrImageBuffer(buffer: Buffer): Promise<OcrImageResult> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer);
  return {
    text: normaliseOcrText(data.text ?? ""),
    confidence: data.confidence ?? 0,
  };
}

function logOcrDebug(method: string, filePath: string, textLength: number): void {
  const msg = `[ocr] method=${method} file=${path.basename(filePath)} textLen=${textLength}`;
  if (process.env.OCR_DEBUG === "1" || textLength === 0) {
    console.log(msg);
  }
}

/**
 * Scanned PDF OCR: Poppler → Tesseract CLI → pdf.js rasterize + Tesseract.js (pure Node fallback).
 */
export async function ocrPdfPages(filePath: string): Promise<OcrPdfResult> {
  const poppler = await ocrPdfViaPoppler(filePath);
  if (poppler.text.trim()) {
    logOcrDebug("poppler+Tesseract.js", filePath, poppler.text.length);
    return { ...poppler, method: "poppler+Tesseract.js" };
  }

  const cliText = await ocrPdfViaTesseractCli(filePath);
  if (cliText.trim()) {
    logOcrDebug("tesseract-cli", filePath, cliText.length);
    return { text: cliText, confidence: 55, method: "tesseract-cli" };
  }

  const pdfjs = await ocrPdfViaPdfJs(filePath);
  if (pdfjs.text.trim()) {
    logOcrDebug("pdfjs+Tesseract.js", filePath, pdfjs.text.length);
    return { ...pdfjs, method: "pdfjs+Tesseract.js" };
  }

  logOcrDebug("none", filePath, 0);
  return { text: "", confidence: 0, method: "none" };
}

async function ocrPdfViaPoppler(filePath: string): Promise<OcrImageResult> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sc-ocr-"));

  try {
    const prefix = path.join(tmpDir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", PDF_OCR_DPI, filePath, prefix], {
      timeout: 120_000,
    });

    const files = (await fs.promises.readdir(tmpDir))
      .filter((f) => f.endsWith(".png"))
      .sort()
      .slice(0, MAX_PDF_OCR_PAGES);

    const parts: string[] = [];
    let confidenceTotal = 0;
    let confidenceCount = 0;

    for (const [index, file] of files.entries()) {
      const page = await ocrImageFile(path.join(tmpDir, file));
      if (page.text) {
        parts.push(`--- Page ${index + 1} ---\n${page.text}`);
        confidenceTotal += page.confidence;
        confidenceCount += 1;
      }
    }

    return {
      text: parts.join("\n\n"),
      confidence: confidenceCount > 0 ? confidenceTotal / confidenceCount : 0,
    };
  } catch {
    return { text: "", confidence: 0 };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

async function ocrPdfViaTesseractCli(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "tesseract",
      [filePath, "stdout", "-l", OCR_LANG, "--dpi", PDF_OCR_DPI],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
    );
    return normaliseOcrText(stdout);
  } catch {
    return "";
  }
}

/** Pure Node fallback: rasterize PDF pages with pdf.js + @napi-rs/canvas, then Tesseract.js. */
async function ocrPdfViaPdfJs(filePath: string): Promise<OcrImageResult> {
  try {
    const pdfjs = await getPdfJs();
    const { createCanvas } = await import("@napi-rs/canvas");
    const data = new Uint8Array(await fs.promises.readFile(filePath));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

    const parts: string[] = [];
    let confidenceTotal = 0;
    let confidenceCount = 0;
    const pageCount = Math.min(doc.numPages, MAX_PDF_OCR_PAGES);
    const scale = Number(PDF_OCR_DPI) / 72;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );
      const context = canvas.getContext("2d");
      // pdf.js expects browser canvas types; @napi-rs/canvas is API-compatible at runtime.
      await page.render({
        canvasContext: context as never,
        viewport,
        canvas: canvas as never,
      }).promise;

      const pngBuffer = canvas.toBuffer("image/png");
      const ocr = await ocrImageBuffer(pngBuffer);
      if (ocr.text) {
        parts.push(`--- Page ${pageNum} ---\n${ocr.text}`);
        confidenceTotal += ocr.confidence;
        confidenceCount += 1;
      }
    }

    return {
      text: parts.join("\n\n"),
      confidence: confidenceCount > 0 ? confidenceTotal / confidenceCount : 0,
    };
  } catch (err) {
    if (process.env.OCR_DEBUG === "1") {
      console.log(
        `[ocr] pdfjs+Tesseract.js fallback failed file=${path.basename(filePath)}`,
        err instanceof Error ? err.message : err
      );
    }
    return { text: "", confidence: 0 };
  }
}

async function extractTextLayerFromPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    return normaliseOcrText(parsed.text ?? "");
  } catch {
    return "";
  }
}

function resolveLearnerPagePath(storedPath: string, uploadRoot: string): string {
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.join(uploadRoot, storedPath);
}

/**
 * OCR all pages of a learner script with per-page method logging.
 */
export async function ocrLearnerScriptPages(
  pages: Array<{ filePath: string; mimeType: string }>,
  uploadRoot = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads")
): Promise<LearnerScriptOcrResult> {
  const chunks: string[] = [];
  const debug: LearnerPageOcrDebug[] = [];

  for (const page of pages) {
    const fullPath = resolveLearnerPagePath(page.filePath, uploadRoot);
    if (!fs.existsSync(fullPath)) {
      debug.push({
        filePath: fullPath,
        mimeType: page.mimeType,
        method: "missing-file",
        textLength: 0,
      });
      logOcrDebug("missing-file", fullPath, 0);
      continue;
    }

    const mime = page.mimeType.toLowerCase();
    let pageText = "";
    let method = "none";

    try {
      if (mime === "application/pdf") {
        const textLayer = await extractTextLayerFromPdf(fullPath);
        if (textLayer.trim()) {
          pageText = textLayer;
          method = "pdf-parse";
        } else {
          const result = await ocrPdfPages(fullPath);
          pageText = result.text;
          method = result.method;
        }
      } else if (mime.startsWith("image/")) {
        const result = await ocrImageFile(fullPath);
        pageText = result.text;
        method = "Tesseract.js-image";
        logOcrDebug(method, fullPath, pageText.length);
      } else {
        const raw = fs.readFileSync(fullPath, "utf-8");
        if (raw.trim() && !raw.includes("\0")) {
          pageText = normaliseOcrText(raw);
          method = "utf8";
        }
      }
    } catch {
      try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        if (raw.trim() && !raw.includes("\0")) {
          pageText = normaliseOcrText(raw);
          method = "utf8-fallback";
        }
      } catch {
        /* unreadable page */
      }
    }

    if (pageText.trim()) {
      chunks.push(pageText);
    }

    debug.push({
      filePath: fullPath,
      mimeType: page.mimeType,
      method,
      textLength: pageText.length,
    });
  }

  const text = chunks.join("\n\n");
  logOcrDebug(
    `script-total pages=${pages.length}`,
    pages[0]?.filePath ?? "unknown",
    text.length
  );

  return { text, debug };
}

export function normaliseOcrText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Minimum characters of alphabetic content to treat extraction as successful. */
export function isMeaningfulExtractedText(text: string, minAlphaChars = 80): boolean {
  const cleaned = normaliseOcrText(text);
  if (!cleaned) return false;

  const alphaChars = (cleaned.match(/[a-zA-Z]/g) ?? []).length;
  if (alphaChars < minAlphaChars) return false;

  if (/ocr integration pending|please review and enter extracted text manually/i.test(cleaned)) {
    return false;
  }

  return true;
}

/** Learner scripts: scale minimum alpha threshold by page count (short booklets still score). */
export function isMeaningfulLearnerScriptOcr(text: string, pageCount: number): boolean {
  const cleaned = normaliseOcrText(text);
  if (!cleaned) return false;

  if (/ocr integration pending|please review and enter extracted text manually/i.test(cleaned)) {
    return false;
  }

  const alphaChars = (cleaned.match(/[a-zA-Z]/g) ?? []).length;

  if (pageCount >= 2) {
    const minAlpha = Math.min(80, Math.max(40, pageCount * 20));
    return alphaChars >= minAlpha;
  }

  // Single-page scripts: accept short but non-empty written answers.
  return alphaChars >= 8 && cleaned.length >= 15;
}

export function fileExistsReadable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
