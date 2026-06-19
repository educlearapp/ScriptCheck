import { prisma } from "../prisma";
import {
  isMeaningfulLearnerScriptOcr,
  ocrLearnerScriptPages,
} from "./ocrEngine";
import { ScriptError } from "./scriptMarking";
import { getMarkingMode, isMarkingPackAssessment, type MarkingMode } from "./quickScanShared";

export const LEARNER_OCR_UNREADABLE_COMMENT =
  "AI: learner answer text could not be read";
const LEARNER_ANSWER_NOT_DETECTED_COMMENT =
  "AI: learner answer for this question was not detected";
const MEMO_ANSWER_NOT_DETECTED_COMMENT =
  "AI: memo answer for this question was not detected";
const GENERIC_EXPECTED_ANSWER_RE =
  /^Award up to \d+(?:\.\d+)? marks for a correct answer to question/i;
const OPTION_2_MEMO_NOT_DETECTED_MESSAGE =
  "No memorandum could be detected. Please upload a memorandum or use Option 1.";

export type MarkingGuideResult = {
  assessmentId: string;
  questionsUpdated: number;
  markingGuideReady: boolean;
};

export type AiMarkScriptResult = {
  scriptId: string;
  questionsMarked: number;
  learnerAnswerCount: number;
  unmatchedQuestionNumbers: string[];
  teacherTotal: number;
};

export type AiMarkBatchResult = {
  batchId: string;
  scriptsMarked: number;
  results: AiMarkScriptResult[];
};

function generateExpectedAnswer(questionText: string, marks: number, questionNumber: string): string {
  const text = questionText.trim();
  const lower = text.toLowerCase();

  const mathMatch = lower.match(/what is\s+(\d+)\s*\+\s*(\d+)/i);
  if (mathMatch) {
    const sum = Number(mathMatch[1]) + Number(mathMatch[2]);
    return `${sum} (${marks} marks)`;
  }

  const mathSub = lower.match(/what is\s+(\d+)\s*-\s*(\d+)/i);
  if (mathSub) {
    const diff = Number(mathSub[1]) - Number(mathSub[2]);
    return `${diff} (${marks} marks)`;
  }

  if (/which one of the following|choose the correct|select the correct/i.test(text)) {
    const optionMatch = text.match(/\b([A-D])[.)]\s+([^A-D\n]{10,})/gi);
    if (optionMatch && optionMatch.length > 0) {
      const first = optionMatch[0].replace(/^[A-D][.)]\s+/i, "").trim();
      return `Correct option addressing the question (${marks} marks). Example acceptable: ${first.slice(0, 80)}`;
    }
    return `Select the correct option (${marks} marks).`;
  }

  if (/name two|name three|list two|list three/i.test(text)) {
    const count = /three|3/i.test(text) ? 3 : 2;
    return `Provide ${count} valid answers (${marks} marks total).`;
  }

  if (/true or false/i.test(text)) {
    return `True or False with brief justification (${marks} marks).`;
  }

  if (/explain|describe|discuss/i.test(text)) {
    return `Clear explanation covering key points (${marks} marks). Partial credit for incomplete answers.`;
  }

  if (/define|what are|what is/i.test(text)) {
    return `Accurate definition or explanation (${marks} marks).`;
  }

  return `Award up to ${marks} marks for a correct answer to question ${questionNumber}.`;
}

function scoreAnswer(
  ocrText: string,
  expectedAnswer: string,
  maxMarks: number
): { mark: number; comment: string } {
  const normalised = ocrText.toLowerCase().replace(/\s+/g, " ");
  const expected = expectedAnswer.toLowerCase();

  const mathInExpected = expected.match(/^(\d+)\s*\(/);
  if (mathInExpected) {
    const answer = mathInExpected[1];
    if (normalised.includes(answer)) {
      return { mark: maxMarks, comment: "AI: numeric answer matched" };
    }
    return { mark: 0, comment: "AI: expected numeric answer not found" };
  }

  const keywords = expected
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/marks|award|correct|option|question/.test(w));

  if (keywords.length === 0) {
    const hasContent = normalised.replace(/[^a-z0-9]/g, "").length > 20;
    return {
      mark: hasContent ? Math.ceil(maxMarks * 0.5) : 0,
      comment: hasContent ? "AI: partial credit for written response" : "AI: no answer detected",
    };
  }

  const matched = keywords.filter((kw) => normalised.includes(kw)).length;
  const ratio = matched / keywords.length;

  if (ratio >= 0.6) {
    return { mark: maxMarks, comment: "AI: answer matches marking guide" };
  }
  if (ratio >= 0.3) {
    return {
      mark: Math.max(1, Math.round(maxMarks * ratio)),
      comment: "AI: partial match to marking guide",
    };
  }
  if (normalised.length > 30) {
    return { mark: Math.max(0, Math.round(maxMarks * 0.25)), comment: "AI: weak match" };
  }
  return { mark: 0, comment: "AI: no matching answer found" };
}

function normaliseQuestionNumber(value: string): string {
  return value.replace(/,/g, ".").trim();
}

function extractLearnerAnswersByQuestion(
  ocrText: string,
  questionNumbers: string[]
): Map<string, string> {
  const wanted = new Set(questionNumbers.map(normaliseQuestionNumber));
  const answers = new Map<string, string[]>();
  let currentQuestion: string | null = null;

  for (const line of ocrText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(
      /^(?:q(?:uestion)?\s*)?(\d+(?:[.,]\d+)*)\s*(?:[.)\]:-])?\s*(.*)$/i
    );
    if (match) {
      const questionNumber = normaliseQuestionNumber(match[1]);
      if (wanted.has(questionNumber)) {
        currentQuestion = questionNumber;
        const remainder = match[2].trim();
        if (remainder) {
          answers.set(questionNumber, [...(answers.get(questionNumber) ?? []), remainder]);
        } else if (!answers.has(questionNumber)) {
          answers.set(questionNumber, []);
        }
        continue;
      }
    }

    if (currentQuestion) {
      answers.set(currentQuestion, [...(answers.get(currentQuestion) ?? []), trimmed]);
    }
  }

  return new Map(
    [...answers.entries()].map(([questionNumber, parts]) => [
      questionNumber,
      parts.join(" ").replace(/\s+/g, " ").trim(),
    ])
  );
}

export async function generateMarkingGuide(
  assessmentId: string,
  workspaceId: string
): Promise<MarkingGuideResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });
  if (!assessment) throw new ScriptError("Assessment not found", 404);
  if (!isMarkingPackAssessment(assessment)) {
    throw new ScriptError("Not a marking pack assessment", 400);
  }

  const mode = getMarkingMode(assessment);
  if (mode !== "QP_LEARNER_ONLY") {
    throw new ScriptError("Marking guide generation applies to Option 1 (question paper + learner answers only)", 400);
  }

  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    orderBy: { orderIndex: "asc" },
  });

  if (questions.length === 0) {
    throw new ScriptError("Extract questions from the question paper first", 400);
  }

  let updated = 0;
  for (const question of questions) {
    if (question.expectedAnswer?.trim()) continue;

    const expectedAnswer = generateExpectedAnswer(
      question.questionText,
      question.marks,
      question.questionNumber
    );
    const memoNotes = `AI marking guide — award marks based on: ${expectedAnswer}`;

    await prisma.assessmentQuestion.update({
      where: { id: question.id },
      data: { expectedAnswer, memoNotes },
    });
    updated++;
  }

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      aiMetadata: {
        ...(typeof assessment.aiMetadata === "object" && assessment.aiMetadata
          ? (assessment.aiMetadata as Record<string, unknown>)
          : {}),
        markingGuideGeneratedAt: new Date().toISOString(),
      },
    },
  });

  const refreshed = await prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    select: { expectedAnswer: true },
  });
  const markingGuideReady = refreshed.every((q) => Boolean(q.expectedAnswer?.trim()));

  return { assessmentId, questionsUpdated: updated, markingGuideReady };
}

export async function runAiMarkingForScript(
  scriptId: string,
  workspaceId: string
): Promise<AiMarkScriptResult> {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      pages: { orderBy: { pageNumber: "asc" } },
      questionMarks: {
        include: { assessmentQuestion: { select: { expectedAnswer: true } } },
      },
      assessment: { select: { aiMetadata: true, totalMarks: true } },
    },
  });

  if (!script) throw new ScriptError("Learner script not found", 404);

  const { text: ocrText, debug: ocrDebug } = await ocrLearnerScriptPages(script.pages);
  const canScore = isMeaningfulLearnerScriptOcr(ocrText, script.pages.length);
  const mode = getMarkingMode(script.assessment);
  const learnerAnswers = canScore
    ? extractLearnerAnswersByQuestion(
        ocrText,
        script.questionMarks.map((mark) => mark.questionNumber)
      )
    : new Map<string, string>();

  console.log(
    `[ai-marking] script=${scriptId} ocrLen=${ocrText.length} meaningful=${canScore} extractedAnswers=${learnerAnswers.size} pages=${ocrDebug.map((d) => `${d.method}:${d.textLength}`).join(",")}`
  );

  let questionsMarked = 0;
  let teacherTotal = 0;
  const unmatchedQuestionNumbers: string[] = [];

  for (const mark of script.questionMarks) {
    const expected = mark.assessmentQuestion.expectedAnswer?.trim();
    const questionNumber = normaliseQuestionNumber(mark.questionNumber);
    if (!expected) {
      await prisma.scriptQuestionMark.update({
        where: { id: mark.id },
        data: {
          teacherMark: 0,
          teacherComment: MEMO_ANSWER_NOT_DETECTED_COMMENT,
          finalMark: 0,
        },
      });
      questionsMarked++;
      unmatchedQuestionNumbers.push(questionNumber);
      continue;
    }
    if (mode === "QP_WITH_ANSWERS" && GENERIC_EXPECTED_ANSWER_RE.test(expected)) {
      throw new ScriptError(
        OPTION_2_MEMO_NOT_DETECTED_MESSAGE,
        400
      );
    }

    let awarded = 0;
    let comment = LEARNER_OCR_UNREADABLE_COMMENT;

    if (canScore) {
      const learnerAnswer = learnerAnswers.get(questionNumber)?.trim();

      if (learnerAnswer) {
        const scored = scoreAnswer(learnerAnswer, expected, mark.maxMarks);
        awarded = scored.mark;
        comment = scored.comment;
      } else {
        comment = LEARNER_ANSWER_NOT_DETECTED_COMMENT;
        unmatchedQuestionNumbers.push(questionNumber);
      }
    } else {
      unmatchedQuestionNumbers.push(questionNumber);
    }

    const clamped = Math.max(0, Math.min(mark.maxMarks, awarded));

    await prisma.scriptQuestionMark.update({
      where: { id: mark.id },
      data: {
        teacherMark: clamped,
        teacherComment: comment,
        finalMark: clamped,
      },
    });
    questionsMarked++;
    teacherTotal += clamped;
  }

  const assessmentTotal = script.assessment.totalMarks || 1;
  const teacherPercentage = (teacherTotal / assessmentTotal) * 100;

  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: {
      teacherTotal,
      finalTotal: teacherTotal,
      teacherPercentage,
      finalPercentage: teacherPercentage,
      status: "MARKED",
    },
  });

  return {
    scriptId,
    questionsMarked,
    learnerAnswerCount: learnerAnswers.size,
    unmatchedQuestionNumbers: [...new Set(unmatchedQuestionNumbers)],
    teacherTotal,
  };
}

export async function runAiMarkingForBatch(
  batchId: string,
  workspaceId: string
): Promise<AiMarkBatchResult> {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: { select: { aiMetadata: true } },
      learnerScripts: { select: { id: true }, orderBy: { scriptNumber: "asc" } },
    },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  const mode = getMarkingMode(batch.assessment);
  const allowedModes: MarkingMode[] = ["QP_LEARNER_ONLY", "QP_WITH_ANSWERS"];
  if (!allowedModes.includes(mode)) {
    return { batchId, scriptsMarked: 0, results: [] };
  }

  const results: AiMarkScriptResult[] = [];
  for (const script of batch.learnerScripts) {
    const result = await runAiMarkingForScript(script.id, workspaceId);
    results.push(result);
  }

  return { batchId, scriptsMarked: results.length, results };
}
