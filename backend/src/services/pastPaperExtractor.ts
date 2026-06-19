import { randomUUID } from "crypto";

export type ExtractedPaperQuestion = {
  id: string;
  questionNumber: string;
  section?: string;
  questionText: string;
  marks: number;
  questionType: string;
  topic?: string;
  cognitiveLevel?: string;
  difficulty?: string;
  memoAnswer?: string;
  rubricNotes?: string;
  tags: string[];
  confidence: number;
  options?: string[];
};

const SECTION_RE = /^(?:SECTION\s+([A-Z])|PART\s+([A-Z]))\b[:\s-]*(.*)$/i;
const QUESTION_RE =
  /^(\d+(?:\.\d+)?)\s*[.)]?\s+(.+?)(?:\s*[\[(](\d+)\s*marks?[\])]|\s*\((\d+)\)\s*$|\s*\[(\d+)\]\s*$)?$/i;
const MEMO_HEADER_RE =
  /^(?:MEMORANDUM|MEMO|MARKING\s+GUIDE|MARKING\s+MEMO|ANSWER\s+KEY|ANSWERS?(?:\s+INCLUDED|\s+ON\s+QUESTION\s+PAPER)?)\b/i;
const MEMO_ANSWER_RE =
  /^(?:q(?:uestion)?\s*)?(\d+(?:[.,]\d+)*)\s*(?:[.)\]:-]|\s)\s*(.+)$/i;
const EXPLICIT_EMBEDDED_ANSWER_RE =
  /^(?:(?:answer|memo\s+answer|expected\s+answer|solution)\s*(?:for)?\s*(?:q(?:uestion)?\s*)?(\d+(?:[.,]\d+)*)|(?:q(?:uestion)?\s*)?(\d+(?:[.,]\d+)*)\s*(?:[.)\]:-])?\s*(?:answer|memo\s+answer|expected\s+answer|solution))\s*[:.)-]?\s*(.+)$/i;
const INLINE_ANSWER_MARKER_RE =
  /\b(?:answer|memo\s+answer|expected\s+answer|solution)\s*[:=-]\s*/i;

const TOPIC_PATTERNS: { pattern: RegExp; topic: string }[] = [
  { pattern: /bully|harass|exclusion/i, topic: "Bullying" },
  { pattern: /hormone|adolescen|puberty|body\s+change/i, topic: "Body Changes" },
  { pattern: /mediat|conflict|peace/i, topic: "Mediation" },
  { pattern: /lobola|rite|cultural|dignity|ceremony/i, topic: "Cultural Rites" },
  { pattern: /priorit|goal|plan/i, topic: "Life Skills" },
];

function detectQuestionType(text: string): string {
  const t = text.toLowerCase();
  if (/which\s+(one\s+)?of\s+the\s+following|choose\s+the\s+correct/i.test(t)) {
    return "MULTIPLE_CHOICE";
  }
  if (/true\s+or\s+false|true\/false/i.test(t)) return "TRUE_FALSE";
  if (/match\s+(each|the)/i.test(t)) return "MATCH_COLUMNS";
  if (/write\s+a\s+paragraph|paragraph/i.test(t)) return "PARAGRAPH";
  if (/explain|describe|discuss/i.test(t)) return "SHORT";
  if (/read\s+the\s+following|comprehension/i.test(t)) return "COMPREHENSION";
  return "SHORT";
}

function detectCognitiveLevel(text: string, type: string): string {
  const t = text.toLowerCase();
  if (/explain|describe|discuss|why|how/i.test(t)) return "Understanding";
  if (/evaluate|advise|justify/i.test(t)) return "Evaluation";
  if (/create|design|plan/i.test(t)) return "Creation";
  if (type === "MULTIPLE_CHOICE" || /what\s+is|define|name/i.test(t)) return "Knowledge";
  return "Application";
}

function detectTopic(text: string): string | undefined {
  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(text)) return topic;
  }
  return undefined;
}

function extractMcqOptions(block: string): string[] {
  const options: string[] = [];
  const lines = block.split("\n");
  for (const line of lines) {
    const m = line.trim().match(/^([A-D])[.)]\s+(.+)/i);
    if (m) options.push(`${m[1].toUpperCase()}) ${m[2].trim()}`);
  }
  return options;
}

export function splitMemoSection(text: string): { paper: string; memo: string } {
  const lines = text.split("\n");
  let memoStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (MEMO_HEADER_RE.test(lines[i].trim())) {
      memoStart = i;
      break;
    }
  }
  if (memoStart < 0) return { paper: text, memo: "" };
  return {
    paper: lines.slice(0, memoStart).join("\n"),
    memo: lines.slice(memoStart + 1).join("\n"),
  };
}

export function parseMemoAnswers(memoText: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!memoText.trim()) return map;

  let currentQuestion: string | null = null;
  let currentParts: string[] = [];

  const flush = () => {
    if (!currentQuestion) return;
    const answer = currentParts.join(" ").replace(/\s+/g, " ").trim();
    if (answer) map.set(currentQuestion, answer);
    currentQuestion = null;
    currentParts = [];
  };

  for (const line of memoText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(MEMO_ANSWER_RE);
    if (m) {
      flush();
      currentQuestion = normaliseQuestionNumber(m[1]);
      currentParts = [cleanMemoAnswer(m[2])];
    } else if (currentQuestion && !/^(total|marks?|memorandum|memo|answers?)\b/i.test(trimmed)) {
      currentParts.push(cleanMemoAnswer(trimmed));
    }
  }
  flush();
  return map;
}

export function parseEmbeddedMemoAnswers(text: string): Map<string, string> {
  const { memo } = splitMemoSection(text);
  if (memo.trim()) return parseMemoAnswers(memo);

  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(EXPLICIT_EMBEDDED_ANSWER_RE);
    if (m) {
      map.set(normaliseQuestionNumber(m[1] ?? m[2]), cleanMemoAnswer(m[3]));
    }
  }
  return map;
}

function normaliseQuestionNumber(value: string): string {
  return value.replace(/,/g, ".").trim();
}

function cleanMemoAnswer(value: string): string {
  return value
    .replace(/^(?:answer|memo\s+answer|expected\s+answer|solution)\s*[:=-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultMarks(type: string): number {
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE":
      return 2;
    case "MATCH_COLUMNS":
      return 4;
    case "PARAGRAPH":
    case "CASE_STUDY":
      return 6;
    default:
      return 3;
  }
}

export function extractQuestionsFromPastPaper(
  text: string,
  sourcePaper?: string
): ExtractedPaperQuestion[] {
  const { paper, memo } = splitMemoSection(text);
  const memoAnswers = parseMemoAnswers(memo);
  const questions: ExtractedPaperQuestion[] = [];
  let currentSection: string | undefined;

  const lines = paper.split("\n");
  let buffer: string[] = [];
  let bufferNumber: string | null = null;
  let bufferMarks: number | null = null;

  const flush = () => {
    if (!bufferNumber || buffer.length === 0) return;
    const raw = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (raw.length < 8) {
      buffer = [];
      bufferNumber = null;
      bufferMarks = null;
      return;
    }

    const type = detectQuestionType(raw);
    const inlineAnswerMatch = raw.match(INLINE_ANSWER_MARKER_RE);
    const questionText = inlineAnswerMatch
      ? raw.slice(0, inlineAnswerMatch.index).trim()
      : raw;
    const inlineMemoAnswer = inlineAnswerMatch
      ? cleanMemoAnswer(raw.slice((inlineAnswerMatch.index ?? 0) + inlineAnswerMatch[0].length))
      : undefined;
    const marks = bufferMarks ?? defaultMarks(type);
    const topic = detectTopic(questionText);
    const cognitiveLevel = detectCognitiveLevel(questionText, type);
    const options = type === "MULTIPLE_CHOICE" ? extractMcqOptions(buffer.join("\n")) : undefined;

    questions.push({
      id: randomUUID(),
      questionNumber: bufferNumber,
      section: currentSection,
      questionText,
      marks,
      questionType: type,
      topic,
      cognitiveLevel,
      difficulty: marks <= 2 ? "Easy" : marks >= 6 ? "Difficult" : "Moderate",
      memoAnswer: inlineMemoAnswer || memoAnswers.get(bufferNumber),
      tags: [
        "past-paper",
        ...(sourcePaper ? [sourcePaper.replace(/\.[^.]+$/, "")] : []),
        ...(topic ? [topic.toLowerCase().replace(/\s+/g, "-")] : []),
      ],
      confidence: memoAnswers.has(bufferNumber) ? 0.92 : 0.78,
      ...(options?.length ? { options } : {}),
    });

    buffer = [];
    bufferNumber = null;
    bufferMarks = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(SECTION_RE);
    if (sectionMatch) {
      flush();
      const letter = sectionMatch[1] ?? sectionMatch[2];
      currentSection = `Section ${letter?.toUpperCase()}`;
      continue;
    }

    const qMatch = trimmed.match(QUESTION_RE);
    if (qMatch) {
      flush();
      bufferNumber = qMatch[1];
      buffer.push(qMatch[2].trim());
      const marksRaw = qMatch[3] ?? qMatch[4] ?? qMatch[5];
      bufferMarks = marksRaw ? Number(marksRaw) : null;
      continue;
    }

    if (bufferNumber) {
      if (/^[A-D][.)]\s/.test(trimmed)) {
        buffer.push(trimmed);
      } else if (!/^(total|instructions|grade|time|marks)/i.test(trimmed)) {
        buffer.push(trimmed);
      }
    }
  }

  flush();

  if (questions.length === 0) {
    return extractQuestionsHeuristic(paper, memoAnswers, sourcePaper, currentSection);
  }

  return questions;
}

function extractQuestionsHeuristic(
  paper: string,
  memoAnswers: Map<string, string>,
  sourcePaper?: string,
  section?: string
): ExtractedPaperQuestion[] {
  const results: ExtractedPaperQuestion[] = [];
  const sentences = paper.split(/(?<=[.?!])\s+/);

  let index = 1;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) continue;
    if (!/^(which|what|true|explain|describe|the\s+time|match|read)\b/i.test(trimmed)) {
      continue;
    }

    const type = detectQuestionType(trimmed);
    const num = String(index++);
    results.push({
      id: randomUUID(),
      questionNumber: num,
      section,
      questionText: trimmed,
      marks: defaultMarks(type),
      questionType: type,
      topic: detectTopic(trimmed),
      cognitiveLevel: detectCognitiveLevel(trimmed, type),
      difficulty: "Moderate",
      memoAnswer: memoAnswers.get(num),
      tags: ["past-paper", ...(sourcePaper ? [sourcePaper] : [])],
      confidence: 0.65,
    });
  }

  return results;
}
