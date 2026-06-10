/**
 * OCR cleaning layer — strips garbage before concept extraction and generation.
 * Garbage must never appear in generated question papers.
 */

const GARBAGE_PATTERNS: RegExp[] = [
  /\bIMG[_-]?\d{3,6}\b/gi,
  /\bDSC[_-]?\d{3,6}\b/gi,
  /\b[a-z]{2,4}\d{4,}[a-z]{0,4}\b/gi, // Oca1ea37, Aals11000
  /\b\d{4,}\s*[a-z]{1,3}\b/gi, // 11000 Bil
  /\b[a-z]\s*\(\s*\d+\s*i\s*ne\.?\s*\)/gi, // L (3 i ne.)
  /\bpage\s+\d+\s+of\s+\d+\b/gi,
  /\b\d+\s*\/\s*\d+\b/g, // page fractions when isolated
  /[^\w\s]{3,}/g, // long symbol runs from scan noise
  /\baals\s+\d+\s+bil\b/gi,
];

const FILENAME_PATTERN = /\b[\w-]+\.(jpg|jpeg|png|pdf|docx|txt)\b/gi;

const BROKEN_WORD_PATTERN = /\b[a-z]{1,2}\s+[a-z]{1,2}\s+[a-z]{1,2}\b/gi;

const KNOWN_GARBAGE_PHRASES = [
  "aals 11000 bil",
  "peacekeeping l (3 i ne.)",
  "oca1ea37",
  "img_6633",
  "scan artefact",
  "ocr integration pending",
];

function normaliseForCheck(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isGarbagePhrase(text: string): boolean {
  const n = normaliseForCheck(text);
  return KNOWN_GARBAGE_PHRASES.some((p) => n.includes(p));
}

export function isLowQualityToken(token: string): boolean {
  const t = token.trim();
  if (!t || t.length < 2) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^[a-z]\d+[a-z0-9]*$/i.test(t) && t.length <= 8) return true;
  if (/^[^a-zA-Z0-9]+$/.test(t)) return true;
  if (/\d{4,}/.test(t) && t.length <= 12) return true;
  return false;
}

export function containsOcrGarbage(text: string): boolean {
  if (!text?.trim()) return false;
  const n = normaliseForCheck(text);
  if (KNOWN_GARBAGE_PHRASES.some((p) => n.includes(p))) return true;
  if (/\bimg[_-]?\d{3,}\b/i.test(text)) return true;
  if (/\b[a-z]{2,4}\d{4,}[a-z]{0,4}\b/i.test(text)) return true;
  if (/\b[a-z]\s*\(\s*\d+\s*i\s*ne\.?\s*\)/i.test(text)) return true;
  return false;
}

function stripKnownGarbage(text: string): string {
  let result = text;
  for (const phrase of KNOWN_GARBAGE_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(re, " ");
  }
  result = result.replace(/\baals\b/gi, " ");
  return result.replace(/\s{2,}/g, " ").trim();
}

function cleanLine(line: string): string {
  let result = stripKnownGarbage(line);

  for (const pattern of GARBAGE_PATTERNS) {
    result = result.replace(pattern, " ");
  }

  result = result.replace(FILENAME_PATTERN, " ");
  result = result.replace(BROKEN_WORD_PATTERN, " ");

  const words = result.split(/\s+/).filter((w) => {
    const cleaned = w.replace(/[^\w'-]/g, "");
    return cleaned.length > 0 && !isLowQualityToken(cleaned);
  });

  return words.join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Sanitise OCR text before concept extraction or question generation.
 */
export function sanitizeOcrText(text: string): string {
  if (!text?.trim()) return "";

  const lines = text.split(/\n+/);
  const cleaned: string[] = [];

  for (const raw of lines) {
    const line = cleanLine(raw.trim());
    if (!line) continue;
    if (line.length < 3) continue;
    if (isGarbagePhrase(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^page\s+\d+$/i.test(line)) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

/**
 * Sanitise a single question string — used before inserting into draft.
 */
export function sanitizeQuestionText(text: string): string {
  const cleaned = sanitizeOcrText(text);
  if (containsOcrGarbage(cleaned)) {
    return cleaned
      .replace(/\bIMG[_-]?\d{3,6}\b/gi, "")
      .replace(/\b[a-z]{2,4}\d{4,}[a-z]{0,4}\b/gi, "")
      .replace(/\b[a-z]\s*\(\s*\d+\s*i\s*ne\.?\s*\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return cleaned;
}
