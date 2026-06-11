/**
 * OCR cleaning layer — strips garbage before concept extraction and generation.
 * Garbage must never appear in generated question papers.
 */

/** Known CAPS Grade 6 Life Skills vocabulary — safe for question generation. */
export const CAPS_LIFE_SKILLS_VOCABULARY: Record<
  string,
  { term: string; definition: string }
> = {
  adolescence: {
    term: "Adolescence",
    definition: "The period between childhood and adulthood",
  },
  hormones: {
    term: "Hormones",
    definition: "Chemical messengers that control growth and development",
  },
  puberty: {
    term: "Puberty",
    definition: "The stage when a child's body develops into an adult body",
  },
  bullying: {
    term: "Bullying",
    definition: "Repeated behaviour intended to hurt, threaten or exclude someone",
  },
  "social bullying": {
    term: "Social Bullying",
    definition: "Spreading rumours or excluding someone from a group",
  },
  mediation: {
    term: "Mediation",
    definition: "A peaceful way to resolve conflict between people",
  },
  peacekeeping: {
    term: "Peacekeeping",
    definition: "Creating calm and preventing violence in a conflict",
  },
  lobola: {
    term: "Lobola",
    definition: "A cultural custom where the groom's family gives gifts to the bride's family",
  },
  dignity: {
    term: "Dignity",
    definition: "Treating every person with respect and worth",
  },
  "rite of passage": {
    term: "Rite of Passage",
    definition: "A ceremony or event marking an important stage in a person's life",
  },
  "cultural rites": {
    term: "Cultural Rites",
    definition: "Traditional ceremonies and practices of a community",
  },
};

const REJECTED_FRAGMENT_TERMS = new Set([
  "ards",
  "weddings",
  "funerals",
  "aals",
  "bil",
  "sl",
  "la",
  "img",
  "page",
  "wedding",
  "funeral",
]);

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
  if (/^[A-D]$/.test(t)) return false;
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

export function isCapsVocabularyTerm(term: string): boolean {
  const key = term.trim().toLowerCase();
  if (CAPS_LIFE_SKILLS_VOCABULARY[key]) return true;
  return Object.values(CAPS_LIFE_SKILLS_VOCABULARY).some(
    (v) => v.term.toLowerCase() === key
  );
}

export function canonicalCapsTerm(term: string): string | null {
  const lower = term.trim().toLowerCase();
  if (CAPS_LIFE_SKILLS_VOCABULARY[lower]) {
    return CAPS_LIFE_SKILLS_VOCABULARY[lower].term;
  }
  const hit = Object.entries(CAPS_LIFE_SKILLS_VOCABULARY).find(
    ([key, v]) =>
      v.term.toLowerCase() === lower ||
      lower.includes(key) ||
      key.includes(lower)
  );
  return hit?.[1].term ?? null;
}

export function isIncompleteOcrFragment(term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t || REJECTED_FRAGMENT_TERMS.has(t)) return true;
  if (/^page\s*\d+$/i.test(t) || /^\d+$/.test(t)) return true;
  if (/\.(jpg|jpeg|png|pdf|docx|txt)$/i.test(t)) return true;
  if (/^img[_-]?\d+$/i.test(t)) return true;
  // Truncated token — short, no CAPS match, looks like a word fragment
  if (t.length >= 3 && t.length <= 5 && !isCapsVocabularyTerm(t)) {
    if (!/^[a-z]{3,5}$/i.test(t)) return true;
    if (!/[aeiou]/i.test(t)) return true;
  }
  return false;
}

/**
 * Returns false for OCR-corrupted terms that must never become question content.
 */
export function isValidConceptTerm(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 4 || t.length > 45) return false;
  if (/[?.!,;:]+$/.test(t)) return false;
  if (containsOcrGarbage(t) || isGarbagePhrase(t)) return false;
  if (isIncompleteOcrFragment(t)) return false;
  if (/^[0-9a-f-]{20,}$/i.test(t)) return false;
  if (/\.(jpg|jpeg|png|pdf|docx|txt)$/i.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (/^page\s+\d+/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length <= 2 && words.every((w) => w.length <= 3)) return false;
  if (words.filter((w) => isLowQualityToken(w)).length > words.length / 2) return false;
  const lower = t.toLowerCase();
  if (REJECTED_FRAGMENT_TERMS.has(lower)) return false;
  // Single bare word not in CAPS vocabulary and not a multi-word phrase
  if (words.length === 1 && !isCapsVocabularyTerm(t)) {
    if (/^(wedding|funeral|party|food|water|money|school)s?$/i.test(t)) return false;
  }
  return true;
}

/** Validate generated question text — rejects bad definition/match stems. */
export function validateQuestionConceptQuality(questionText: string): {
  valid: boolean;
  reason?: string;
} {
  const text = questionText.trim();
  if (!text || containsOcrGarbage(text)) {
    return { valid: false, reason: "OCR garbage in question text" };
  }

  const badDefinition = text.match(/^what (?:is|are) ([^?]+)\?$/i);
  if (badDefinition) {
    const term = badDefinition[1].trim();
    if (!isValidConceptTerm(term) || isIncompleteOcrFragment(term)) {
      return { valid: false, reason: `Invalid definition term: ${term}` };
    }
  }

  if (/^what\s+(?!is\b|are\b)/i.test(text)) {
    return { valid: false, reason: 'Invalid "What …?" stem without proper term' };
  }

  for (const fragment of REJECTED_FRAGMENT_TERMS) {
    if (new RegExp(`\\b${fragment}\\b`, "i").test(text) && !isCapsVocabularyTerm(fragment)) {
      if (/^what (?:is|are)\s/i.test(text)) {
        return { valid: false, reason: `Rejected fragment in question: ${fragment}` };
      }
    }
  }

  return { valid: true };
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
