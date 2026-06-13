import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { AiExtractionStatus, AiMaterialType } from "@prisma/client";
import {
  isMeaningfulExtractedText,
  normaliseOcrText,
  ocrImageFile,
  ocrPdfPages,
} from "./ocrEngine";
import { isPlaceholderText } from "./contentConcepts";

export type ExtractionResult = {
  text: string;
  status: AiExtractionStatus;
  ocrAttempted: boolean;
  ocrConfidence?: number;
  error?: string;
  engine?: string;
};

export async function extractTextFromFile(
  fileType: AiMaterialType,
  filePath: string
): Promise<ExtractionResult> {
  try {
    switch (fileType) {
      case "PDF":
        return await extractPdf(filePath);
      case "DOCX":
        return await extractDocx(filePath);
      case "TXT":
        return extractTxt(filePath);
      case "JPEG":
      case "PNG":
        return await extractImage(filePath);
      default:
        return {
          text: "",
          status: "FAILED",
          ocrAttempted: false,
          error: "Unsupported file type",
        };
    }
  } catch (err) {
    return {
      text: "",
      status: "FAILED",
      ocrAttempted: true,
      error: err instanceof Error ? err.message : "Extraction failed",
      engine: "tesseract.js",
    };
  }
}

async function extractPdf(filePath: string): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  let embeddedText = "";

  try {
    const parsed = await pdfParse(buffer);
    embeddedText = normaliseOcrText(parsed.text ?? "");
  } catch {
    // pdf-parse can fail on some generated/scanned PDFs — fall through to OCR
  }

  if (isMeaningfulExtractedText(embeddedText)) {
    return {
      text: embeddedText,
      status: "EXTRACTED",
      ocrAttempted: false,
      engine: "pdf-parse",
    };
  }

  const ocrResult = await ocrPdfPages(filePath);
  const ocrText = normaliseOcrText(ocrResult.text);

  if (isMeaningfulExtractedText(ocrText, 40)) {
    return {
      text: ocrText,
      status: ocrResult.confidence < 55 ? "MANUAL_REQUIRED" : "EXTRACTED",
      ocrAttempted: true,
      ocrConfidence: ocrResult.confidence,
      engine: "tesseract.js+pdftoppm",
      ...(ocrResult.confidence < 55
        ? { error: "Low OCR confidence — please review and correct" }
        : {}),
    };
  }

  return {
    text: ocrText || embeddedText || "",
    status: "MANUAL_REQUIRED",
    ocrAttempted: true,
    ocrConfidence: ocrResult.confidence,
    engine: "tesseract.js+pdftoppm",
    error: ocrText
      ? "OCR produced limited text — please review and correct"
      : "No text found in PDF — manual entry required",
  };
}

async function extractDocx(filePath: string): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = normaliseOcrText(result.value ?? "");

  if (!text || isPlaceholderText(text)) {
    return {
      text: "",
      status: "MANUAL_REQUIRED",
      ocrAttempted: false,
      error: "No text found in document — manual entry required",
      engine: "mammoth",
    };
  }

  return { text, status: "EXTRACTED", ocrAttempted: false, engine: "mammoth" };
}

function extractTxt(filePath: string): ExtractionResult {
  const text = normaliseOcrText(fs.readFileSync(filePath, "utf-8"));

  if (!text || isPlaceholderText(text)) {
    return {
      text: "",
      status: "MANUAL_REQUIRED",
      ocrAttempted: false,
      error: "Empty text file",
      engine: "utf-8",
    };
  }

  return { text, status: "EXTRACTED", ocrAttempted: false, engine: "utf-8" };
}

async function extractImage(filePath: string): Promise<ExtractionResult> {
  const ocr = await ocrImageFile(filePath);
  const text = ocr.text;

  if (isMeaningfulExtractedText(text, 30)) {
    const lowConfidence = ocr.confidence < 55;
    return {
      text,
      status: lowConfidence ? "MANUAL_REQUIRED" : "EXTRACTED",
      ocrAttempted: true,
      ocrConfidence: ocr.confidence,
      engine: "tesseract.js",
      ...(lowConfidence ? { error: "Low OCR confidence — please review and correct" } : {}),
    };
  }

  return {
    text: text || "",
    status: "MANUAL_REQUIRED",
    ocrAttempted: true,
    ocrConfidence: ocr.confidence,
    engine: "tesseract.js",
    error: text
      ? "OCR produced limited text — please review and correct"
      : "OCR could not read this image — manual entry required",
  };
}

export function resolveMaterialText(material: {
  manualText: string | null;
  extractedText: string | null;
}): string {
  const manual = material.manualText?.trim() ?? "";
  const extracted = material.extractedText?.trim() ?? "";

  if (manual && !isPlaceholderText(manual)) return manual;
  if (extracted && !isPlaceholderText(extracted)) return extracted;
  return "";
}

export function detectMaterialType(
  mimeType: string,
  originalName: string
): AiMaterialType | null {
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") return "PDF";
  if (mimeType === "image/jpeg" || ext === ".jpg" || ext === ".jpeg") return "JPEG";
  if (mimeType === "image/png" || ext === ".png") return "PNG";
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    return "DOCX";
  }
  if (mimeType === "text/plain" || ext === ".txt") return "TXT";

  return null;
}
