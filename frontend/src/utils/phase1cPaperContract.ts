/**
 * Frontend mirror of backend pastPaperExtractor question/memo line rules
 * for fixture contract tests (does not replace production OCR).
 */

const QUESTION_RE =
  /^(\d+(?:\.\d+)?)\s*[.)]?\s+(.+?)(?:\s*[\[(](\d+)\s*marks?[\])]|\s*\((\d+)\)\s*$|\s*\[(\d+)\]\s*$)?$/i;

const MEMO_ANSWER_RE =
  /^(?:q(?:uestion)?\s*)?(\d+(?:[.,]\d+)*)\s*(?:[.)\]:-]|\s)\s*(.+)$/i;

export function extractQuestionsFromPastPaperText(
  text: string,
  opts?: { memoOnly?: boolean }
): Array<{ questionNumber: string; marks?: number; questionText?: string; answer?: string }> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (opts?.memoOnly) {
    const answers: Array<{ questionNumber: string; answer: string }> = [];
    for (const line of lines) {
      if (/^(total|marks?|memorandum|memo|answers?)\b/i.test(line)) continue;
      const m = line.match(MEMO_ANSWER_RE);
      if (m) answers.push({ questionNumber: m[1].replace(",", "."), answer: m[2].trim() });
    }
    return answers;
  }

  const questions: Array<{ questionNumber: string; marks: number; questionText: string }> = [];
  for (const line of lines) {
    const m = line.match(QUESTION_RE);
    if (!m) continue;
    const marks = Number(m[3] || m[4] || m[5] || 3);
    questions.push({
      questionNumber: m[1],
      marks,
      questionText: m[2].trim(),
    });
  }
  return questions;
}
