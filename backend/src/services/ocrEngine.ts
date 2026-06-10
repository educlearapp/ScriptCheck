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

/**
 * Scanned PDF OCR via Poppler pdftoppm (if installed) + Tesseract.js per page.
 * Deployment: install poppler-utils for scanned PDF support.
 */
export type OcrPdfResult = {
  text: string;
  confidence: number;
};

export async function ocrPdfPages(filePath: string): Promise<OcrPdfResult> {
  const poppler = await ocrPdfViaPoppler(filePath);
  if (poppler.text) return poppler;

  const cliText = await ocrPdfViaTesseractCli(filePath);
  if (cliText) return { text: cliText, confidence: 55 };

  return { text: "", confidence: 0 };
}

async function ocrPdfViaPoppler(filePath: string): Promise<OcrPdfResult> {
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

export function fileExistsReadable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
