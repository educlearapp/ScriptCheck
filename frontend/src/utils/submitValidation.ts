export type MarkRowForValidation = {
  questionNumber: string;
  maxMarks: number;
  teacherMark: number | null | undefined;
};

export type SubmitValidationIssue = {
  code: "missing_mark" | "blank_question" | "totals_mismatch" | "invalid_range";
  message: string;
  questionNumber?: string;
};

export type SubmitValidationResult = {
  ok: boolean;
  issues: SubmitValidationIssue[];
};

export function validateBatchBeforeHodSubmit(input: {
  scripts: Array<{
    id: string;
    learnerName: string;
    status: string;
    questionMarks: MarkRowForValidation[];
    teacherTotal: number | null;
  }>;
}): SubmitValidationResult {
  const issues: SubmitValidationIssue[] = [];

  for (const script of input.scripts) {
    if (script.status !== "MARKED" && !["MODERATION", "SUBMITTED_TO_HOD"].includes(script.status)) {
      issues.push({
        code: "missing_mark",
        message: `${script.learnerName}: script is not finished (status ${script.status}).`,
      });
    }

    let sum = 0;
    let allPresent = true;
    for (const q of script.questionMarks) {
      if (q.teacherMark == null || Number.isNaN(Number(q.teacherMark))) {
        allPresent = false;
        issues.push({
          code: "blank_question",
          message: `${script.learnerName}: Q${q.questionNumber} has no mark.`,
          questionNumber: q.questionNumber,
        });
        continue;
      }
      const mark = Number(q.teacherMark);
      if (mark < 0 || mark > q.maxMarks) {
        issues.push({
          code: "invalid_range",
          message: `${script.learnerName}: Q${q.questionNumber} mark ${mark} is outside 0–${q.maxMarks}.`,
          questionNumber: q.questionNumber,
        });
      }
      sum += mark;
    }

    if (allPresent && script.teacherTotal != null) {
      const roundedSum = Math.round(sum * 10) / 10;
      const roundedTotal = Math.round(script.teacherTotal * 10) / 10;
      if (roundedSum !== roundedTotal) {
        issues.push({
          code: "totals_mismatch",
          message: `${script.learnerName}: question marks sum to ${roundedSum} but teacher total is ${roundedTotal}.`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function validateScriptMarks(input: {
  questionMarks: MarkRowForValidation[];
  teacherTotal: number | null;
}): SubmitValidationResult {
  return validateBatchBeforeHodSubmit({
    scripts: [
      {
        id: "current",
        learnerName: "This learner",
        status: "MARKED",
        questionMarks: input.questionMarks,
        teacherTotal: input.teacherTotal,
      },
    ],
  });
}
