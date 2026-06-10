import { prisma } from "../prisma";

export type DuplicateMatch = {
  extractedId: string;
  existingItemId: string;
  existingQuestionText: string;
  similarity: number;
  status: string;
};

export type DuplicateCheckResult = {
  extractedId: string;
  questionText: string;
  matches: DuplicateMatch[];
  isDuplicate: boolean;
};

const DUPLICATE_THRESHOLD = 0.72;

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionSimilarity(a: string, b: string): number {
  const na = normalizeQuestionText(a);
  const nb = normalizeQuestionText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer;
  }

  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;

  let intersection = 0;
  for (const w of wa) {
    if (wb.has(w)) intersection += 1;
  }

  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

export async function findDuplicatesForQuestions(
  workspaceId: string,
  questions: { id: string; questionText: string }[],
  options?: { subjectId?: string; gradeId?: string }
): Promise<DuplicateCheckResult[]> {
  const existing = await prisma.questionBankItem.findMany({
    where: {
      workspaceId,
      status: { not: "ARCHIVED" },
      ...(options?.subjectId ? { subjectId: options.subjectId } : {}),
      ...(options?.gradeId ? { gradeId: options.gradeId } : {}),
    },
    select: {
      id: true,
      questionText: true,
      status: true,
    },
    take: 500,
  });

  return questions.map((q) => {
    const matches: DuplicateMatch[] = [];

    for (const item of existing) {
      const similarity = questionSimilarity(q.questionText, item.questionText);
      if (similarity >= DUPLICATE_THRESHOLD) {
        matches.push({
          extractedId: q.id,
          existingItemId: item.id,
          existingQuestionText: item.questionText,
          similarity: Math.round(similarity * 100) / 100,
          status: item.status,
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);

    return {
      extractedId: q.id,
      questionText: q.questionText,
      matches,
      isDuplicate: matches.length > 0,
    };
  });
}
