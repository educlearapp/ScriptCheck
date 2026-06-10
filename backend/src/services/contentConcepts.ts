import { sanitizeOcrText, isValidConceptTerm, containsOcrGarbage } from "./contentSanitizer";

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
  { pattern: /cultural\s+rites?|rite\s+of\s+passage|lobola|tradition|ceremony/i, topic: "Cultural Rites" },
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

function dedupeConcepts(concepts: StudyConcept[]): StudyConcept[] {
  const seen = new Set<string>();
  const result: StudyConcept[] = [];

  for (const c of concepts) {
    const key = c.term.toLowerCase();
    if (seen.has(key) || !isValidConceptTerm(c.term)) continue;
    if (/\b(is|are|means)\b/.test(key)) continue;
    if (containsOcrGarbage(c.context) && !c.definition) continue;
    seen.add(key);
    result.push(c);
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

export function extractConcepts(sourceText: string, max = 24): StudyConcept[] {
  const text = sanitizeOcrText(sanitiseSourceText(sourceText));
  if (!text) return [];

  const concepts: StudyConcept[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const headingMatch = line.match(/^([A-Z][A-Za-z0-9\s,'/-]{3,60})$/);
    if (headingMatch && line.length < 70 && !line.endsWith(".")) {
      concepts.push({
        term: titleCase(headingMatch[1]),
        context: line,
        topic: detectTopic(line),
      });
    }

    const colonHeading = line.match(/^([A-Za-z][A-Za-z0-9\s,'/-]{2,40}):\s*(.+)/);
    if (colonHeading) {
      concepts.push({
        term: titleCase(colonHeading[1]),
        definition: colonHeading[2].trim(),
        context: line,
        topic: detectTopic(line),
      });
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);

  for (const sentence of sentences) {
    const defMatch = sentence.match(
      /^([A-Za-z][A-Za-z\s'-]{2,45}?)\s+(is|are|means|refers to|involves|includes)\s+(.+)$/i
    );
    if (defMatch) {
      const term = titleCase(defMatch[1].trim());
      concepts.push({
        term,
        definition: defMatch[3].replace(/[.!?]+$/, "").trim(),
        context: sentence,
        topic: detectTopic(sentence),
      });
      continue;
    }

    const explainMatch = sentence.match(
      /^(adolescence|hormones?|bullying|mediation|peacekeeping|lobola|dignity|puberty)\b/i
    );
    if (explainMatch) {
      const term = titleCase(explainMatch[1]);
      concepts.push({
        term,
        context: sentence,
        topic: detectTopic(sentence),
      });
    }
  }

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  for (const [word] of ranked) {
    concepts.push({
      term: titleCase(word),
      context: sentenceContaining(text, word),
      topic: detectTopic(sentenceContaining(text, word)),
    });
  }

  return dedupeConcepts(concepts).slice(0, max);
}

export function conceptQuestionStem(concept: StudyConcept, style: string): string {
  const term = concept.term.toLowerCase();

  switch (style) {
    case "definition":
      return term.endsWith("s") && !term.endsWith("ss")
        ? `What are ${term}?`
        : `What is ${term}?`;
    case "explain":
      return `Explain ${term} in your own words.`;
    case "describe":
      return `Describe ${term}.`;
    case "advice":
      return `Give advice to a learner about ${term}.`;
    case "paragraph":
      return `Write a paragraph explaining ${term} using examples from the study material.`;
    case "comprehension":
      return `Read the following and answer: What is important to know about ${term}?\n\n"${concept.context.slice(0, 280)}${concept.context.length > 280 ? "…" : ""}"`;
    case "tf": {
      if (!isValidConceptTerm(concept.term)) {
        return "True or False: Learners should treat others with dignity and respect.";
      }
      const statement = concept.definition && !containsOcrGarbage(concept.definition)
        ? `${concept.term} ${concept.definition.split(/\s+/).slice(0, 8).join(" ")}…`
        : `${concept.term} is an important Life Skills topic in the study material.`;
      return `True or False: ${statement}`;
    }
    case "mcq":
      return `Which statement best describes ${term}?`;
    case "match":
      return `Match each term related to ${term} with its correct description.`;
    case "rite":
      return `Describe one rite of passage mentioned in the study material.`;
    case "lobola":
      return `Explain lobola.`;
    default:
      return `What is ${term}?`;
  }
}
