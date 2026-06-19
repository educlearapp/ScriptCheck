import {
  AiMaterialType,
  AssessmentStatus,
  AssessmentType,
  PaperDocumentType,
  Prisma,
  ScriptBatchStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  completeAssessmentSetup,
  getAssessmentSetupStatus,
} from "./assessmentSetup";
import { initQuestionMarksForScript } from "./bulkScriptHelpers";
import {
  CurriculumValidationError,
  validateCurriculumSelection,
} from "./curriculumValidation";
import { ScriptError } from "./scriptMarking";
import {
  detectMaterialType,
  extractTextFromFile,
} from "./contentExtraction";
import {
  extractQuestionsFromPastPaper,
  parseEmbeddedMemoAnswers,
  parseMemoAnswers,
  splitMemoSection,
  type ExtractedPaperQuestion,
} from "./pastPaperExtractor";

import {
  getScriptFormat,
  getMarkingMode,
  isMarkingPackAssessment,
  mergeMarkingWorkbenchMetadata,
  type MarkingMode,
  type ScriptFormat,
} from "./quickScanShared";

export type CreateMarkingPackInput = {
  title: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  term?: string | null;
  pagesPerScript?: number | null;
  totalMarks?: number;
  questionCount?: number | null;
  scriptFormat?: ScriptFormat;
  markingMode?: MarkingMode;
};

export type MarkingPackResult = {
  assessmentId: string;
  batchId: string;
  title: string;
  pagesPerScript: number | null;
};

export async function createMarkingPack(
  workspaceId: string,
  userId: string,
  input: CreateMarkingPackInput
): Promise<MarkingPackResult> {
  const title = input.title?.trim();
  if (!title) throw new ScriptError("Assessment title is required", 400);

  if (!input.curriculumId || !input.phaseId || !input.gradeId || !input.subjectId) {
    throw new ScriptError("Curriculum, phase, grade, and subject are required", 400);
  }

  try {
    await validateCurriculumSelection({
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      subjectId: input.subjectId,
    });
  } catch (err) {
    if (err instanceof CurriculumValidationError) {
      throw new ScriptError(err.message, err.statusCode);
    }
    throw err;
  }

  const totalMarks = input.totalMarks != null ? Number(input.totalMarks) : 100;
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
    throw new ScriptError("totalMarks must be a positive number", 400);
  }

  let pagesPerScript: number | null = null;
  if (input.pagesPerScript != null) {
    pagesPerScript = Number(input.pagesPerScript);
    if (!Number.isInteger(pagesPerScript) || pagesPerScript < 1) {
      throw new ScriptError("Pages per learner answer script must be at least 1", 400);
    }
  }

  const scriptFormat: ScriptFormat =
    input.scriptFormat === "ON_QUESTION_PAPER" ? "ON_QUESTION_PAPER" : "ANSWER_SHEET";

  const markingMode: MarkingMode =
    input.markingMode === "QP_WITH_ANSWERS" ? "QP_WITH_ANSWERS" : "QP_LEARNER_ONLY";

  let questionCount: number | null = null;
  if (input.questionCount != null) {
    questionCount = Number(input.questionCount);
    if (!Number.isInteger(questionCount) || questionCount < 1) {
      throw new ScriptError("questionCount must be a positive integer", 400);
    }
  }

  const term = input.term?.trim() || null;

  const assessment = await prisma.assessment.create({
    data: {
      workspaceId,
      title,
      term,
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      subjectId: input.subjectId,
      assessmentType: AssessmentType.TEST,
      totalMarks,
      questionCount,
      pagesPerScript,
      status: AssessmentStatus.DRAFT,
      creatorTeacherId: userId,
      aiMetadata: mergeMarkingWorkbenchMetadata(null, {
        scriptFormat,
        markingMode,
      }) as Prisma.InputJsonValue,
    },
  });

  const batch = await prisma.scriptBatch.create({
    data: {
      workspaceId,
      assessmentId: assessment.id,
      createdById: userId,
      title: `${title} — Learner Answers`,
      status: ScriptBatchStatus.DRAFT,
    },
  });

  return {
    assessmentId: assessment.id,
    batchId: batch.id,
    title: assessment.title,
    pagesPerScript: assessment.pagesPerScript,
  };
}

function resolveAiMaterialType(
  mimeType: string,
  fileName: string
): AiMaterialType {
  const detected = detectMaterialType(mimeType, fileName);
  if (!detected) {
    throw new ScriptError(`Unsupported question paper file type: ${fileName}`, 400);
  }
  return detected;
}

async function extractTextFromVaultDocument(doc: {
  storedPath: string;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const fileType = resolveAiMaterialType(doc.mimeType, doc.fileName);
  const extraction = await extractTextFromFile(fileType, doc.storedPath);
  const text = extraction.text?.trim() ?? "";

  if (!text) {
    throw new ScriptError(
      extraction.error ??
        `Could not extract text from ${doc.fileName}. Upload a text-based PDF or clearer scan.`,
      400
    );
  }

  return text;
}

function mergeMemoAnswers(
  questions: ExtractedPaperQuestion[],
  memoAnswers: Map<string, string>
): ExtractedPaperQuestion[] {
  if (memoAnswers.size === 0) return questions;

  return questions.map((question) => {
    if (question.memoAnswer?.trim()) return question;
    const answer = memoAnswers.get(question.questionNumber);
    if (!answer) return question;
    return { ...question, memoAnswer: answer };
  });
}

function hasMemoCoverage(questions: ExtractedPaperQuestion[]): boolean {
  return (
    questions.length > 0 &&
    questions.every((question) => Boolean(question.memoAnswer?.trim()))
  );
}

function applyQuestionPaperMemoFallbacks(
  questions: ExtractedPaperQuestion[],
  paperText: string,
  scriptFormat: ScriptFormat,
  hasSeparateMemo: boolean
): ExtractedPaperQuestion[] {
  if (hasSeparateMemo || hasMemoCoverage(questions)) return questions;
  if (scriptFormat !== "ON_QUESTION_PAPER") return questions;

  const memoAnswers = parseEmbeddedMemoAnswers(paperText);
  if (memoAnswers.size === 0) return questions;

  return mergeMemoAnswers(questions, memoAnswers);
}

function buildAnalyticsPlaceholder() {
  return {
    averageScore: null,
    attemptCount: null,
    weakTopicFlag: null,
    cognitiveLevelPerformance: null,
    difficultyPerformance: null,
  };
}

export type QuickScanExtractionResult = {
  questions: ExtractedPaperQuestion[];
  memoAnswersDetected: boolean;
  sourceFileName: string;
};

export async function extractQuickScanQuestions(
  assessmentId: string,
  workspaceId: string
): Promise<QuickScanExtractionResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      paperVaultDocuments: {
        where: { isCurrentVersion: true },
      },
    },
  });

  if (!assessment) throw new ScriptError("Assessment not found", 404);
  if (!isMarkingPackAssessment(assessment)) {
    throw new ScriptError("Not a Quick Scan marking pack assessment", 400);
  }

  const questionPaper = assessment.paperVaultDocuments.find(
    (doc) => doc.documentType === PaperDocumentType.QUESTION_PAPER
  );
  if (!questionPaper) {
    throw new ScriptError("Upload a question paper before analyzing Quick Scan", 400);
  }

  const scriptFormat = getScriptFormat(assessment);
  const markingMode = getMarkingMode(assessment);
  const paperText = await extractTextFromVaultDocument(questionPaper);
  let questions = extractQuestionsFromPastPaper(paperText, questionPaper.fileName);

  if (questions.length === 0) {
    throw new ScriptError(
      "Could not extract questions from the question paper. Ensure numbered questions are present or upload a clearer scan.",
      400
    );
  }

  const memorandum =
    markingMode === "QP_WITH_ANSWERS"
      ? undefined
      : assessment.paperVaultDocuments.find(
          (doc) => doc.documentType === PaperDocumentType.MEMORANDUM
        );

  if (memorandum) {
    const memoText = await extractTextFromVaultDocument(memorandum);
    const { memo } = splitMemoSection(memoText);
    const memoAnswers = parseMemoAnswers(memo.trim() ? memo : memoText);
    questions = mergeMemoAnswers(questions, memoAnswers);
  } else {
    questions = applyQuestionPaperMemoFallbacks(
      questions,
      paperText,
      scriptFormat,
      false
    );
  }

  if (markingMode === "QP_WITH_ANSWERS" && !hasMemoCoverage(questions)) {
    throw new ScriptError(
      "Answers could not be detected inside the uploaded question paper. Please upload a paper that includes answers/memo or use Option 1.",
      400
    );
  }

  return {
    questions,
    memoAnswersDetected: hasMemoCoverage(questions),
    sourceFileName: questionPaper.fileName,
  };
}

async function replaceAssessmentQuestions(
  assessmentId: string,
  extracted: ExtractedPaperQuestion[]
): Promise<number> {
  await prisma.scriptQuestionMark.deleteMany({
    where: { learnerScript: { assessmentId } },
  });

  await prisma.assessmentQuestion.deleteMany({
    where: { assessmentId },
  });

  await prisma.assessmentQuestion.createMany({
    data: extracted.map((question, index) => ({
      assessmentId,
      questionNumber: question.questionNumber,
      section: question.section ?? null,
      questionText: question.questionText,
      topic: question.topic ?? null,
      marks: question.marks,
      cognitiveLevel: question.cognitiveLevel ?? null,
      difficulty: question.difficulty ?? null,
      expectedAnswer: question.memoAnswer?.trim() || null,
      memoNotes: question.rubricNotes?.trim() || null,
      rubricNotes:
        question.questionType === "PARAGRAPH" || question.questionType === "CASE_STUDY"
          ? question.rubricNotes?.trim() || null
          : null,
      orderIndex: index,
      analyticsMetadata: buildAnalyticsPlaceholder(),
    })),
  });

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { questionCount: extracted.length },
  });

  return extracted.length;
}

async function backfillScriptQuestionMarks(assessmentId: string): Promise<number> {
  const scripts = await prisma.learnerScript.findMany({
    where: { assessmentId },
    include: { _count: { select: { questionMarks: true } } },
  });

  let initialized = 0;
  for (const script of scripts) {
    if (script._count.questionMarks === 0) {
      await initQuestionMarksForScript(script.id, assessmentId);
      initialized++;
    } else {
      await prisma.scriptQuestionMark.deleteMany({
        where: { learnerScriptId: script.id },
      });
      await initQuestionMarksForScript(script.id, assessmentId);
      initialized++;
    }
  }
  return initialized;
}

function mergeQuickScanMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const quickScan =
    base.quickScan && typeof base.quickScan === "object"
      ? { ...(base.quickScan as Record<string, unknown>) }
      : {};
  return {
    ...base,
    markingPack: true,
    quickScan: {
      ...quickScan,
      ...patch,
    },
  };
}

export type FinalizeQuickScanResult = {
  assessmentId: string;
  setupComplete: boolean;
  readyForMarking: boolean;
  memoAnswersReady: boolean;
  memoBlocker: string | null;
  questionsCreated: number;
  scriptMarksInitialized: number;
};

export async function finalizeQuickScan(
  assessmentId: string,
  workspaceId: string
): Promise<FinalizeQuickScanResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) throw new ScriptError("Assessment not found", 404);
  if (!isMarkingPackAssessment(assessment)) {
    throw new ScriptError("Not a Quick Scan marking pack assessment", 400);
  }

  const status = await getAssessmentSetupStatus(assessmentId, workspaceId, {
    skipQuestionChecks: true,
  });

  if (!status.pagesPerScript || status.pagesPerScript < 1) {
    throw new ScriptError("Set pages per learner answer script", 400);
  }
  if (!status.totalMarks) {
    throw new ScriptError("Set total marks", 400);
  }
  if (!status.masterFiles.questionPaper) {
    throw new ScriptError("Upload question paper", 400);
  }

  const extraction = await extractQuickScanQuestions(assessmentId, workspaceId);
  const questionsCreated = await replaceAssessmentQuestions(
    assessmentId,
    extraction.questions
  );

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      aiMetadata: mergeQuickScanMetadata(assessment.aiMetadata, {
        extractedAt: new Date().toISOString(),
        questionsExtracted: questionsCreated,
        memoAnswersDetected: extraction.memoAnswersDetected,
        sourceFileName: extraction.sourceFileName,
      }) as Prisma.InputJsonValue,
    },
  });

  if (!assessment.setupComplete) {
    await completeAssessmentSetup(assessmentId, workspaceId);
  }

  const scriptMarksInitialized = await backfillScriptQuestionMarks(assessmentId);
  const refreshedStatus = await getAssessmentSetupStatus(assessmentId, workspaceId);

  return {
    assessmentId,
    setupComplete: refreshedStatus.setupComplete,
    readyForMarking: refreshedStatus.readyForMarking,
    memoAnswersReady: refreshedStatus.memoAnswersReady ?? false,
    memoBlocker: refreshedStatus.memoBlocker ?? null,
    questionsCreated,
    scriptMarksInitialized,
  };
}

export async function reextractQuickScanQuestions(
  assessmentId: string,
  workspaceId: string
): Promise<FinalizeQuickScanResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) throw new ScriptError("Assessment not found", 404);
  if (!isMarkingPackAssessment(assessment)) {
    throw new ScriptError("Not a Quick Scan marking pack assessment", 400);
  }

  const extraction = await extractQuickScanQuestions(assessmentId, workspaceId);
  const questionsCreated = await replaceAssessmentQuestions(
    assessmentId,
    extraction.questions
  );

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      aiMetadata: mergeQuickScanMetadata(assessment.aiMetadata, {
        extractedAt: new Date().toISOString(),
        questionsExtracted: questionsCreated,
        memoAnswersDetected: extraction.memoAnswersDetected,
        sourceFileName: extraction.sourceFileName,
      }) as Prisma.InputJsonValue,
    },
  });

  const scriptMarksInitialized = await backfillScriptQuestionMarks(assessmentId);
  const refreshedStatus = await getAssessmentSetupStatus(assessmentId, workspaceId);

  return {
    assessmentId,
    setupComplete: refreshedStatus.setupComplete,
    readyForMarking: refreshedStatus.readyForMarking,
    memoAnswersReady: refreshedStatus.memoAnswersReady ?? false,
    memoBlocker: refreshedStatus.memoBlocker ?? null,
    questionsCreated,
    scriptMarksInitialized,
  };
}
