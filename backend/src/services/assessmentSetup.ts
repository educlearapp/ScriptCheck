import { PaperDocumentType } from "@prisma/client";
import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";
import {
  getMarkingMode,
  isMarkingPackAssessment,
  isQuickScanPlaceholderQuestion,
  quickScanMemoBlockerMessage,
  requiresMemoForMarking,
} from "./quickScanShared";

export type AssessmentSetupInput = {
  title?: string;
  term?: string | null;
  assessmentType?: string;
  totalMarks?: number;
  questionCount?: number | null;
  pagesPerScript?: number | null;
  memorandumAvailable?: boolean;
  rubricAvailable?: boolean;
};

export type AssessmentSetupStatus = {
  assessmentId: string;
  setupComplete: boolean;
  setupCompletedAt: string | null;
  questionCount: number | null;
  pagesPerScript: number | null;
  totalMarks: number;
  memorandumAvailable: boolean;
  rubricAvailable: boolean;
  masterFiles: {
    questionPaper: boolean;
    memorandum: boolean;
    rubric: boolean;
    supportingDocuments: number;
  };
  readyForMarking: boolean;
  questionsExtracted: boolean;
  markingGuideReady: boolean;
  memoAnswersReady: boolean;
  memoBlocker: string | null;
  markingMode: string | null;
  missingSteps: string[];
};

const MASTER_DOC_TYPES: Record<string, PaperDocumentType> = {
  questionPaper: PaperDocumentType.QUESTION_PAPER,
  memorandum: PaperDocumentType.MEMORANDUM,
  rubric: PaperDocumentType.RUBRIC_ATTACHMENT,
  supporting: PaperDocumentType.SUPPORTING_MATERIAL,
};

const GENERIC_EXPECTED_ANSWER_RE =
  /^Award up to \d+(?:\.\d+)? marks for a correct answer to question/i;

async function loadAssessment(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      paperVaultDocuments: {
        where: { isCurrentVersion: true },
        select: { documentType: true },
      },
    },
  });
  if (!assessment) throw new ScriptError("Assessment not found", 404);
  return assessment;
}

type SetupStatusOptions = {
  skipQuestionChecks?: boolean;
};

export async function getAssessmentSetupStatus(
  assessmentId: string,
  workspaceId: string,
  options: SetupStatusOptions = {}
): Promise<AssessmentSetupStatus> {
  const assessment = await loadAssessment(assessmentId, workspaceId);
  const docTypes = new Set(assessment.paperVaultDocuments.map((d) => d.documentType));
  const isMarkingPack = isMarkingPackAssessment(assessment);

  const masterFiles = {
    questionPaper: docTypes.has(PaperDocumentType.QUESTION_PAPER),
    memorandum: docTypes.has(PaperDocumentType.MEMORANDUM),
    rubric: docTypes.has(PaperDocumentType.RUBRIC_ATTACHMENT),
    supportingDocuments: assessment.paperVaultDocuments.filter(
      (d) => d.documentType === PaperDocumentType.SUPPORTING_MATERIAL
    ).length,
  };

  const missingSteps: string[] = [];
  if (!assessment.pagesPerScript || assessment.pagesPerScript < 1) {
    missingSteps.push("Set pages per learner answer script");
  }
  if (!assessment.totalMarks) missingSteps.push("Set total marks");
  if (!masterFiles.questionPaper) missingSteps.push("Upload question paper");
  if (assessment.memorandumAvailable && !masterFiles.memorandum) {
    missingSteps.push("Upload memorandum");
  }
  if (assessment.rubricAvailable && !masterFiles.rubric) {
    missingSteps.push("Upload rubric");
  }

  const infoComplete =
    assessment.pagesPerScript != null &&
    assessment.pagesPerScript > 0 &&
    assessment.totalMarks > 0;

  const masterComplete =
    masterFiles.questionPaper &&
    (!assessment.memorandumAvailable || masterFiles.memorandum) &&
    (!assessment.rubricAvailable || masterFiles.rubric);

  let questionsExtracted = false;
  let markingGuideReady = false;
  let memoAnswersReady = false;
  let memoBlocker: string | null = null;
  const markingMode = isMarkingPack ? getMarkingMode(assessment) : null;

  if (isMarkingPack && !options.skipQuestionChecks) {
    const questions = await prisma.assessmentQuestion.findMany({
      where: { assessmentId: assessment.id },
      select: { questionText: true, expectedAnswer: true, memoNotes: true },
      orderBy: { orderIndex: "asc" },
    });

    const hasPlaceholders = questions.some((question) =>
      isQuickScanPlaceholderQuestion(question.questionText)
    );
    questionsExtracted = questions.length > 0 && !hasPlaceholders;

    if (questions.length === 0) {
      missingSteps.push("Analyze question paper to extract assessment questions");
    } else if (hasPlaceholders) {
      missingSteps.push("Replace placeholder questions by re-running question extraction");
    }

    const hasExpectedAnswers =
      questionsExtracted &&
      questions.every(
        (question) =>
          Boolean(question.expectedAnswer?.trim()) ||
          Boolean(question.memoNotes?.trim())
      );
    const hasRealMemoAnswers =
      questionsExtracted &&
      questions.some((question) => {
        const answer = question.expectedAnswer?.trim();
        return answer != null && answer.length > 0 && !GENERIC_EXPECTED_ANSWER_RE.test(answer);
      });

    markingGuideReady = hasExpectedAnswers;

    if (markingMode === "QP_LEARNER_ONLY") {
      memoAnswersReady = markingGuideReady;
      if (questionsExtracted && !markingGuideReady) {
        missingSteps.push("Confirm script split to generate AI marking guide");
      }
    } else if (requiresMemoForMarking(assessment)) {
      memoAnswersReady = hasRealMemoAnswers;
      if (questionsExtracted && !memoAnswersReady) {
        memoBlocker = quickScanMemoBlockerMessage(assessment, masterFiles);
        missingSteps.push(memoBlocker);
      }
    } else {
      memoAnswersReady = hasExpectedAnswers;
    }
  }

  const readyForMarking = isMarkingPack
    ? infoComplete &&
      masterComplete &&
      questionsExtracted &&
      (markingMode === "QP_LEARNER_ONLY" ? markingGuideReady : memoAnswersReady)
    : infoComplete && masterComplete;

  return {
    assessmentId: assessment.id,
    setupComplete: assessment.setupComplete,
    setupCompletedAt: assessment.setupCompletedAt?.toISOString() ?? null,
    questionCount: assessment.questionCount,
    pagesPerScript: assessment.pagesPerScript,
    totalMarks: assessment.totalMarks,
    memorandumAvailable: assessment.memorandumAvailable,
    rubricAvailable: assessment.rubricAvailable,
    masterFiles,
    readyForMarking,
    questionsExtracted,
    markingGuideReady,
    memoAnswersReady,
    memoBlocker,
    markingMode,
    missingSteps,
  };
}

export async function updateAssessmentSetup(
  assessmentId: string,
  workspaceId: string,
  input: AssessmentSetupInput
) {
  const assessment = await loadAssessment(assessmentId, workspaceId);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.term !== undefined) data.term = input.term?.trim() || null;
  if (input.assessmentType !== undefined) data.assessmentType = input.assessmentType;
  if (input.totalMarks !== undefined) data.totalMarks = Number(input.totalMarks);
  if (input.questionCount !== undefined) {
    data.questionCount = input.questionCount != null ? Number(input.questionCount) : null;
  }
  if (input.pagesPerScript !== undefined) {
    const pps = input.pagesPerScript != null ? Number(input.pagesPerScript) : null;
    if (pps != null && pps < 1) {
      throw new ScriptError("Pages per learner answer script must be at least 1", 400);
    }
    data.pagesPerScript = pps;
  }
  if (input.memorandumAvailable !== undefined) data.memorandumAvailable = input.memorandumAvailable;
  if (input.rubricAvailable !== undefined) data.rubricAvailable = input.rubricAvailable;

  return prisma.assessment.update({
    where: { id: assessment.id },
    data,
    include: {
      curriculum: true,
      phase: true,
      grade: true,
      subject: true,
      creatorTeacher: { select: { id: true, fullName: true } },
    },
  });
}

export async function completeAssessmentSetup(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await loadAssessment(assessmentId, workspaceId);
  const isMarkingPack = isMarkingPackAssessment(assessment);
  const status = await getAssessmentSetupStatus(assessmentId, workspaceId);

  if (isMarkingPack) {
    if (!status.masterFiles.questionPaper) {
      throw new ScriptError("Upload question paper", 400);
    }
    if (!status.pagesPerScript || status.pagesPerScript < 1) {
      throw new ScriptError("Set pages per learner answer script", 400);
    }
    if (!status.totalMarks) {
      throw new ScriptError("Set total marks", 400);
    }
    if (!status.questionsExtracted) {
      throw new ScriptError(
        "Analyze the question paper and extract real questions before completing setup",
        400
      );
    }
  } else if (!status.readyForMarking) {
    throw new ScriptError(
      `Setup incomplete: ${status.missingSteps.join(", ")}`,
      400
    );
  }

  return prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      setupComplete: true,
      setupCompletedAt: new Date(),
    },
  });
}

export { MASTER_DOC_TYPES };
