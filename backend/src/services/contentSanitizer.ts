/**
 * OCR cleaning layer — strips garbage before concept extraction and generation.
 * Garbage must never appear in generated question papers.
 */

const GARBAGE_PATTERNS: RegExp[] = [
  /\bIMG[_-]?\d{3,6}\b/gi,
  /\bDSC[_-]?\d{3,6}\b/gi,
  /\b[a-z]{2,4}\d{4,}[a-z0-9]{0,4}\b/gi,
  /\b\d{4,}\s*[a-z]{1,3}\b/gi,
  /\b[a-z]\s*\(\s*\d+\s*i\s*ne\.?\)?/gi,
  /\b[a-z]\s*\(\s*\d+\s*i\s*ne\b/gi,
  /\bpage\s+\d+\s+of\s+\d+\b/gi,
  /\b\d+\s*\/\s*\d+\b/g,
  /[^\w\s'"-]{3,}/g,
  /\baals\s+\d+\s+bil\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];

const FILENAME_PATTERN =
  /\b[\w-]+\.(jpg|jpeg|png|pdf|docx|txt)\b|\bIMG[_-]?\d{3,6}\.(jpg|jpeg|png)\b/gi;

const BROKEN_WORD_PATTERN = /\b[a-z]{1,2}\s+[a-z]{1,2}(\s+[a-z]{1,2})?\b/gi;

const KNOWN_GARBAGE_PHRASES = [
  "aals 11000 bil",
  "peacekeeping l (3 i ne.",
  "peacekeeping l (3 i ne.)",
  "oca1ea37",
  "img_6633",
  "scan artefact",
  "ocr integration pending",
  "sl la",
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
  if (/^[a-z]\d+[a-z0-9]*$/i.test(t) && t.length <= 10) return true;
  if (/^[^a-zA-Z0-9]+$/.test(t)) return true;
  if (/\d{4,}/.test(t) && t.length <= 12) return true;
  if (/^[a-z]{1,3}$/i.test(t) && !["the", "and", "for"].includes(t.toLowerCase())) return true;
  return false;
}

export function containsOcrGarbage(text: string): boolean {
  if (!text?.trim()) return false;
  const n = normaliseForCheck(text);
  if (KNOWN_GARBAGE_PHRASES.some((p) => n.includes(p))) return true;
  if (/\bimg[_-]?\d{3,}\b/i.test(text)) return true;
  if (/\b[a-z]{2,4}\d{4,}[a-z0-9]{0,4}\b/i.test(text)) return true;
  if (/\b[a-z]\s*\(\s*\d+\s*i\s*ne/i.test(text)) return true;
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text)) return true;
  if (/\baals\b/i.test(n) && /\bbil\b/i.test(n)) return true;
  if (/\bsl\s+la\b/i.test(n)) return true;
  return false;
}

/**
 * Returns false for OCR-corrupted terms that must never become question content.
 */
export function isValidConceptTerm(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 3 || t.length > 45) return false;
  if (containsOcrGarbage(t) || isGarbagePhrase(t)) return false;
  if (/^[0-9a-f-]{20,}$/i.test(t)) return false;
  if (/\.(jpg|jpeg|png|pdf|docx|txt)$/i.test(t)) return false;
  if (/^\d/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length <= 2 && words.every((w) => w.length <= 3)) return false;
  if (words.filter((w) => isLowQualityToken(w)).length > words.length / 2) return false;
  return true;
}

export function isValidQuestionText(text: string): boolean {
  if (!text?.trim() || text.trim().length < 8) return false;
  if (containsOcrGarbage(text)) return false;
  return true;
}

function stripKnownGarbage(text: string): string {
  let result = text;
  for (const phrase of KNOWN_GARBAGE_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(re, " ");
  }
  result = result.replace(/\baals\b/gi, " ");
  result = result.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ");
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

export function sanitizeOcrText(text: string): string {
  if (!text?.trim()) return "";

  const lines = text.split(/\n+/);
  const cleaned: string[] = [];

  for (const raw of lines) {
    const line = cleanLine(raw.trim());
    if (!line) continue;
    if (line.length < 3) continue;
    if (isGarbagePhrase(line)) continue;
    if (containsOcrGarbage(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^page\s+\d+$/i.test(line)) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

export function sanitizeQuestionText(text: string): string {
  let cleaned = sanitizeOcrText(text);
  if (containsOcrGarbage(cleaned)) {
    cleaned = cleaned
      .replace(/\bIMG[_-]?\d{3,6}\b/gi, "")
      .replace(/\b[a-z]{2,4}\d{4,}[a-z0-9]{0,4}\b/gi, "")
      .replace(/\b[a-z]\s*\(\s*\d+\s*i\s*ne\.?\)?/gi, "")
      .replace(/\baals\s+\d+\s+bil\b/gi, "")
      .replace(/\baals\b/gi, "")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return cleaned;
}
