import {
  sanitizeOcrText,
  isValidConceptTerm,
  containsOcrGarbage,
  CAPS_LIFE_SKILLS_VOCABULARY,
  canonicalCapsTerm,
  isCapsVocabularyTerm,
} from "./contentSanitizer";

export type StudyConcept = {
  term: string;
  definition?: string;
  context: string;
  topic?: string;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was", "were", "have",
  "has", "had", "been", "being", "their", "they", "them", "your", "you", "when",
  "where", "which", "while", "about", "into", "through", "during", "before", "after",
  "above", "below", "between", "under", "again", "further", "then", "once", "here",
  "there", "all", "each", "few", "more", "most", "other", "some", "such", "only",
  "own", "same", "than", "too", "very", "can", "will", "just", "should", "could",
  "would", "also", "what", "how", "why", "who", "whom", "these", "those", "because",
  "until", "against", "among", "throughout", "despite", "towards", "upon", "within",
  "without", "study", "material", "chapter", "section", "page", "learner", "learners",
  "teacher", "grade", "question", "answer", "marks", "caps", "life", "skills",
]);

const TOPIC_HEADINGS = [
  { pattern: /body\s+changes?|adolescence|puberty|hormones?/i, topic: "Body Changes" },
  { pattern: /bully|bullying|harassment|exclusion/i, topic: "Bullying" },
  { pattern: /mediation|mediate|conflict\s+resolution/i, topic: "Mediation" },
  { pattern: /peacekeeping|peace\s*keeping|calm|violence/i, topic: "Peacekeeping" },
  { pattern: /cultural\s+rites?|rite\s+of\s+passage|lobola|tradition|ceremony|wedding|funeral/i, topic: "Cultural Rites" },
  { pattern: /dignity|respect|human\s+rights/i, topic: "Dignity and Respect" },
];

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sentenceContaining(text: string, term: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lower = term.toLowerCase();
  const hit = sentences.find((s) => s.toLowerCase().includes(lower));
  return hit?.trim() ?? text.slice(0, 200).trim();
}

function detectTopic(text: string): string | undefined {
  for (const { pattern, topic } of TOPIC_HEADINGS) {
    if (pattern.test(text)) return topic;
  }
  return undefined;
}

/** A concept is quality-grade if it has a definition, CAPS vocabulary match, or multi-word heading. */
export function isQualityConcept(concept: StudyConcept): boolean {
  if (!isValidConceptTerm(concept.term)) return false;
  if (containsOcrGarbage(concept.context) && !concept.definition) return false;
  if (concept.definition?.trim()) return true;
  if (isCapsVocabularyTerm(concept.term)) return true;
  if (concept.term.split(/\s+/).length >= 2) return true;
  return false;
}

function dedupeConcepts(concepts: StudyConcept[]): StudyConcept[] {
  const seen = new Set<string>();
  const result: StudyConcept[] = [];

  for (const c of concepts) {
    const canonical = canonicalCapsTerm(c.term) ?? c.term;
    const key = canonical.toLowerCase();
    if (seen.has(key) || !isQualityConcept({ ...c, term: canonical })) continue;
    if (/\b(is|are|means)\b/.test(key)) continue;
    seen.add(key);
    result.push({
      ...c,
      term: canonical,
      definition: c.definition ?? CAPS_LIFE_SKILLS_VOCABULARY[key]?.definition,
    });
  }

  return result;
}

const PREFERRED_CONCEPT_ORDER = [
  "adolescence",
  "hormones",
  "bullying",
  "social bullying",
  "mediation",
  "peacekeeping",
  "lobola",
  "dignity",
  "rite of passage",
  "cultural rites",
  "puberty",
];

export function orderConceptsForAssessment(concepts: StudyConcept[]): StudyConcept[] {
  const ordered: StudyConcept[] = [];

  for (const key of PREFERRED_CONCEPT_ORDER) {
    const hit = concepts.find(
      (c) =>
        c.term.toLowerCase().includes(key) ||
        c.context.toLowerCase().includes(key)
    );
    if (hit && !ordered.some((o) => o.term.toLowerCase() === hit.term.toLowerCase())) {
      ordered.push(hit);
    }
  }

  return dedupeConcepts([...ordered, ...concepts]);
}

export function filterQualityConcepts(concepts: StudyConcept[]): StudyConcept[] {
  return dedupeConcepts(concepts.filter(isQualityConcept));
}

export function isPlaceholderText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /\[?\s*image content\s*[—–-]\s*ocr integration pending/i.test(t) ||
    /please review and enter extracted text manually/i.test(t) ||
    /ocr not fully available/i.test(t)
  );
}

export function sanitiseSourceText(text: string): string {
  if (isPlaceholderText(text)) return "";
  return text.trim();
}

function extractCapsVocabularyFromText(text: string): StudyConcept[] {
  const concepts: StudyConcept[] = [];
  const lower = text.toLowerCase();

  for (const [key, entry] of Object.entries(CAPS_LIFE_SKILLS_VOCABULARY)) {
    if (!lower.includes(key)) continue;
    concepts.push({
      term: entry.term,
      definition: entry.definition,
      context: sentenceContaining(text, key),
      topic: detectTopic(sentenceContaining(text, key)),
    });
  }

  return concepts;
}

export function extractConcepts(sourceText: string, max = 24): StudyConcept[] {
  const text = sanitizeOcrText(sanitiseSourceText(sourceText));
  if (!text) return [];

  const concepts: StudyConcept[] = extractCapsVocabularyFromText(text);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const headingMatch = line.match(/^([A-Z][A-Za-z0-9\s,'/-]{3,60})$/);
    if (headingMatch && line.length < 70 && !line.endsWith(".")) {
      const term = titleCase(headingMatch[1]);
      if (isValidConceptTerm(term)) {
        concepts.push({
          term: canonicalCapsTerm(term) ?? term,
          context: line,
          topic: detectTopic(line),
        });
      }
    }

    const colonHeading = line.match(/^([A-Za-z][A-Za-z0-9\s,'/-]{2,40}):\s*(.+)/);
    if (colonHeading) {
      const term = titleCase(colonHeading[1]);
      if (isValidConceptTerm(term)) {
        concepts.push({
          term: canonicalCapsTerm(term) ?? term,
          definition: colonHeading[2].trim(),
          context: line,
          topic: detectTopic(line),
        });
      }
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);

  for (const sentence of sentences) {
    const defMatch = sentence.match(
      /^([A-Za-z][A-Za-z\s'-]{2,45}?)\s+(is|are|means|refers to|involves|includes)\s+(.+)$/i
    );
    if (defMatch) {
      const rawTerm = titleCase(defMatch[1].trim());
      const term = canonicalCapsTerm(rawTerm) ?? rawTerm;
      if (isValidConceptTerm(term)) {
        concepts.push({
          term,
          definition: defMatch[3].replace(/[.!?]+$/, "").trim(),
          context: sentence,
          topic: detectTopic(sentence),
        });
      }
      continue;
    }

    for (const key of Object.keys(CAPS_LIFE_SKILLS_VOCABULARY)) {
      if (new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i").test(sentence)) {
        const entry = CAPS_LIFE_SKILLS_VOCABULARY[key];
        concepts.push({
          term: entry.term,
          definition: entry.definition,
          context: sentence,
          topic: detectTopic(sentence),
        });
      }
    }
  }

  return dedupeConcepts(concepts).slice(0, max);
}

export function formatConceptTermForQuestion(term: string): string {
  return canonicalCapsTerm(term) ?? titleCase(term);
}

export function conceptQuestionStem(concept: StudyConcept, style: string): string {
  const term = formatConceptTermForQuestion(concept.term);

  switch (style) {
    case "definition":
      return `Explain the term ${term}.`;
    case "explain":
      return `Explain ${term.toLowerCase()} in your own words.`;
    case "describe":
      return `Describe ${term}.`;
    case "advice":
      return `Give advice to a learner about ${term.toLowerCase()}.`;
    case "paragraph":
      return `Write a paragraph explaining ${term.toLowerCase()} using examples from the study material.`;
    case "comprehension":
      return `Read the following and answer: What is important to know about ${term.toLowerCase()}?\n\n"${concept.context.slice(0, 280)}${concept.context.length > 280 ? "…" : ""}"`;
    case "tf": {
      if (!isValidConceptTerm(concept.term)) {
        return "True or False: Learners should treat others with dignity and respect.";
      }
      const statement = concept.definition && !containsOcrGarbage(concept.definition)
        ? `${term} ${concept.definition.split(/\s+/).slice(0, 8).join(" ")}…`
        : `${term} is an important Life Skills topic in the study material.`;
      return `True or False: ${statement}`;
    }
    case "mcq":
      return `Which statement best describes ${term.toLowerCase()}?`;
    case "match":
      return `Match each term with its correct description.`;
    case "rite":
      return `Describe one rite of passage mentioned in the study material.`;
    case "lobola":
      return `Explain lobola.`;
    default:
      return `Explain the term ${term}.`;
  }
}
