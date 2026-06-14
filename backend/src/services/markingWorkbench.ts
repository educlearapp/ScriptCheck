import { ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { UserAccessContext } from "./permissions";
import { hasBroadResultsAccess } from "./assessmentResults";
import { getAssessmentSetupStatus } from "./assessmentSetup";
import { getScriptVerification, type ScriptVerificationResult } from "./scriptVerification";
import { ScriptError } from "./scriptMarking";
import {
  getMarkingMode,
  getScriptFormat,
  isMarkingPackAssessment,
  type ScriptFormat,
} from "./quickScanShared";

export type MarkingWorkflowStage =
  | "CREATE_JOB"
  | "UPLOADS"
  | "AI_PROCESSING"
  | "REVIEW"
  | "RESULTS";

export type MarkingJobListItem = {
  batchId: string;
  assessmentId: string;
  title: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  scriptCount: number;
  scriptFormat: ScriptFormat;
  workflowStage: MarkingWorkflowStage;
  batchStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type MarkingWorkbenchScriptRow = {
  id: string;
  scriptNumber: string;
  learnerName: string;
  pageCount: number;
  status: string;
  teacherTotal: number | null;
  finalTotal: number | null;
  finalPercentage: number | null;
};

export type MarkingWorkbenchState = {
  batchId: string;
  assessmentId: string;
  title: string;
  term: string | null;
  totalMarks: number;
  questionCount: number | null;
  pagesPerScript: number | null;
  scriptFormat: ScriptFormat;
  curriculumId: string;
  phaseId: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  phase: { id: string; name: string };
  uploads: {
    questionPaper: boolean;
    memorandum: boolean;
    rubric: boolean;
    learnerScripts: boolean;
    scriptCount: number;
  };
  setupComplete: boolean;
  readyForMarking: boolean;
  memoAnswersReady: boolean;
  markingGuideReady: boolean;
  memoBlocker: string | null;
  workflowStage: MarkingWorkflowStage;
  batchStatus: string;
  scripts: MarkingWorkbenchScriptRow[];
  aiMarkingImplemented: boolean;
  prepareBlockers: string[];
  verification: ScriptVerificationResult | null;
};

function resolveWorkflowStage(input: {
  batchStatus: ScriptBatchStatus;
  scriptCount: number;
  scriptsConfirmed: boolean;
  hasMarkedScripts: boolean;
  allFinalised: boolean;
}): MarkingWorkflowStage {
  if (input.scriptCount === 0) return "UPLOADS";
  if (
    input.batchStatus === ScriptBatchStatus.DRAFT &&
    !input.scriptsConfirmed
  ) {
    return "UPLOADS";
  }
  if (
    input.batchStatus === ScriptBatchStatus.DRAFT ||
    input.batchStatus === ScriptBatchStatus.MARKING
  ) {
    if (!input.hasMarkedScripts) return "AI_PROCESSING";
    return "REVIEW";
  }
  if (input.allFinalised || input.batchStatus === ScriptBatchStatus.APPROVED) {
    return "RESULTS";
  }
  return "REVIEW";
}

function scriptsConfirmed(batchStatus: ScriptBatchStatus): boolean {
  return batchStatus !== ScriptBatchStatus.DRAFT;
}

export async function listMarkingJobs(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
): Promise<{ items: MarkingJobListItem[] }> {
  const broad = hasBroadResultsAccess(access, workspaceId);
  const creatorFilter = broad ? {} : { createdById: userId };

  const batches = await prisma.scriptBatch.findMany({
    where: {
      workspaceId,
      ...creatorFilter,
    },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          aiMetadata: true,
          grade: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
      learnerScripts: {
        select: {
          id: true,
          status: true,
          finalTotal: true,
          finalisedAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const markingBatches = batches.filter((batch) =>
    isMarkingPackAssessment(batch.assessment)
  );

  const items: MarkingJobListItem[] = markingBatches.slice(0, 50).map((batch) => {
    const scriptCount = batch.learnerScripts.length;
    const hasMarkedScripts = batch.learnerScripts.some(
      (s) => s.finalTotal != null && s.finalTotal > 0
    );
    const allFinalised =
      scriptCount > 0 &&
      batch.learnerScripts.every((s) => s.finalisedAt != null);

    return {
      batchId: batch.id,
      assessmentId: batch.assessmentId,
      title: batch.assessment.title,
      grade: batch.assessment.grade,
      subject: batch.assessment.subject,
      scriptCount,
      scriptFormat: getScriptFormat(batch.assessment),
      workflowStage: resolveWorkflowStage({
        batchStatus: batch.status,
        scriptCount,
        scriptsConfirmed: scriptsConfirmed(batch.status),
        hasMarkedScripts,
        allFinalised,
      }),
      batchStatus: batch.status,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  });

  return { items };
}

export async function getMarkingWorkbenchState(
  batchId: string,
  workspaceId: string
): Promise<MarkingWorkbenchState> {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: {
        include: {
          grade: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          phase: { select: { id: true, name: true } },
        },
      },
      learnerScripts: {
        include: { learner: { select: { firstName: true, lastName: true } } },
        orderBy: { scriptNumber: "asc" },
      },
    },
  });

  if (!batch) throw new ScriptError("Marking job not found", 404);
  if (!isMarkingPackAssessment(batch.assessment)) {
    throw new ScriptError("Not a marking workbench job", 400);
  }

  const setup = await getAssessmentSetupStatus(batch.assessmentId, workspaceId);
  const scriptCount = batch.learnerScripts.length;

  let verification = null;
  if (scriptCount > 0 && batch.assessment.pagesPerScript) {
    try {
      verification = await getScriptVerification(batchId, workspaceId);
    } catch {
      verification = null;
    }
  }

  const scripts: MarkingWorkbenchScriptRow[] = batch.learnerScripts.map((s) => ({
    id: s.id,
    scriptNumber: s.scriptNumber,
    learnerName: `${s.learner.firstName} ${s.learner.lastName}`,
    pageCount: s.pageCount,
    status: s.status,
    teacherTotal: s.teacherTotal,
    finalTotal: s.finalTotal,
    finalPercentage: s.finalPercentage,
  }));

  const hasMarkedScripts = scripts.some((s) => s.finalTotal != null && s.finalTotal > 0);
  const allFinalised =
    scriptCount > 0 &&
    batch.learnerScripts.every((s) => s.finalisedAt != null);

  const prepareBlockers: string[] = [];
  if (!batch.assessment.pagesPerScript || batch.assessment.pagesPerScript < 1) {
    prepareBlockers.push("Set pages per learner script");
  }
  if (scriptCount === 0) {
    prepareBlockers.push("Upload at least one learner script");
  }
  if (setup.masterFiles.questionPaper && !setup.questionsExtracted) {
    prepareBlockers.push("Question paper uploaded — confirm script split to extract questions");
  }
  const mode = getMarkingMode(batch.assessment);
  if (mode === "QP_WITH_ANSWERS" && !setup.memoAnswersReady && setup.questionsExtracted) {
    prepareBlockers.push(setup.memoBlocker ?? "Answers required on question paper before AI marking");
  }
  if (mode === "QP_LEARNER_ONLY" && setup.questionsExtracted && !setup.markingGuideReady) {
    prepareBlockers.push("Confirm script split to generate AI marking guide");
  }

  return {
    batchId: batch.id,
    assessmentId: batch.assessmentId,
    title: batch.assessment.title,
    term: batch.assessment.term,
    totalMarks: batch.assessment.totalMarks,
    questionCount: batch.assessment.questionCount,
    pagesPerScript: batch.assessment.pagesPerScript,
    scriptFormat: getScriptFormat(batch.assessment),
    curriculumId: batch.assessment.curriculumId,
    phaseId: batch.assessment.phaseId,
    grade: batch.assessment.grade,
    subject: batch.assessment.subject,
    phase: batch.assessment.phase,
    uploads: {
      questionPaper: setup.masterFiles.questionPaper,
      memorandum: setup.masterFiles.memorandum,
      rubric: setup.masterFiles.rubric,
      learnerScripts: scriptCount > 0,
      scriptCount,
    },
    setupComplete: setup.setupComplete,
    readyForMarking: setup.readyForMarking,
    memoAnswersReady: setup.memoAnswersReady ?? false,
    markingGuideReady: setup.markingGuideReady ?? false,
    memoBlocker: setup.memoBlocker ?? null,
    workflowStage: resolveWorkflowStage({
      batchStatus: batch.status,
      scriptCount,
      scriptsConfirmed: scriptsConfirmed(batch.status),
      hasMarkedScripts,
      allFinalised,
    }),
    batchStatus: batch.status,
    scripts,
    aiMarkingImplemented: true,
    prepareBlockers,
    verification,
  };
}

export async function prepareMarkingJob(
  batchId: string,
  workspaceId: string
): Promise<MarkingWorkbenchState> {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: { assessment: { select: { id: true, aiMetadata: true, pagesPerScript: true } } },
  });

  if (!batch) throw new ScriptError("Marking job not found", 404);
  if (!isMarkingPackAssessment(batch.assessment)) {
    throw new ScriptError("Not a marking workbench job", 400);
  }

  if (!batch.assessment.pagesPerScript || batch.assessment.pagesPerScript < 1) {
    throw new ScriptError("Set pages per learner script before preparing the job", 400);
  }

  const verification = await getScriptVerification(batchId, workspaceId);
  if (!verification.canProceed || verification.detectedScriptCount === 0) {
    throw new ScriptError("Upload at least one learner script before preparing the job", 400);
  }

  if (batch.status === ScriptBatchStatus.DRAFT) {
    await prisma.scriptBatch.update({
      where: { id: batchId },
      data: { status: ScriptBatchStatus.MARKING },
    });
  }

  return getMarkingWorkbenchState(batchId, workspaceId);
}
