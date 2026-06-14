import { ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { getAssessmentSetupStatus } from "./assessmentSetup";
import { finalizeQuickScan } from "./markingPack";
import { ScriptError } from "./scriptMarking";
import {
  isMarkingPackAssessment,
  quickScanMemoBlockerMessage,
} from "./quickScanShared";

export type ScriptVerificationResult = {
  batchId: string;
  assessmentId: string;
  totalPagesUploaded: number;
  expectedPagesPerScript: number;
  detectedScriptCount: number;
  completeScripts: number;
  incompleteScripts: number;
  missingPages: number;
  extraPages: number;
  scripts: Array<{
    scriptId: string;
    scriptNumber: string;
    learnerName: string;
    pageCount: number;
    expectedPages: number;
    isComplete: boolean;
    warning: string | null;
  }>;
  warnings: string[];
  canProceed: boolean;
};

export async function getScriptVerification(
  batchId: string,
  workspaceId: string
): Promise<ScriptVerificationResult> {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: { select: { id: true, pagesPerScript: true } },
      learnerScripts: {
        include: { learner: true },
        orderBy: { scriptNumber: "asc" },
      },
    },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  const expectedPagesPerScript = batch.assessment.pagesPerScript ?? 0;
  if (expectedPagesPerScript < 1) {
    throw new ScriptError("Pages per learner answer script not configured", 400);
  }

  const totalPagesUploaded = batch.learnerScripts.reduce(
    (sum, s) => sum + s.pageCount,
    0
  );

  const scripts = batch.learnerScripts.map((s) => {
    const isComplete = s.pageCount === expectedPagesPerScript;
    const warning = !isComplete
      ? s.pageCount < expectedPagesPerScript
        ? `Learner answer ${s.scriptNumber} appears incomplete (${s.pageCount}/${expectedPagesPerScript} pages).`
        : `Learner answer ${s.scriptNumber} has extra pages (${s.pageCount}/${expectedPagesPerScript}).`
      : null;

    return {
      scriptId: s.id,
      scriptNumber: s.scriptNumber,
      learnerName: `${s.learner.firstName} ${s.learner.lastName}`,
      pageCount: s.pageCount,
      expectedPages: expectedPagesPerScript,
      isComplete,
      warning,
    };
  });

  const completeScripts = scripts.filter((s) => s.isComplete).length;
  const incompleteScripts = scripts.length - completeScripts;
  const expectedTotalPages = scripts.length * expectedPagesPerScript;
  const missingPages = Math.max(0, expectedTotalPages - totalPagesUploaded);
  const extraPages = Math.max(0, totalPagesUploaded - expectedTotalPages);

  const warnings = scripts
    .map((s) => s.warning)
    .filter((w): w is string => w != null);

  return {
    batchId: batch.id,
    assessmentId: batch.assessmentId,
    totalPagesUploaded,
    expectedPagesPerScript,
    detectedScriptCount: scripts.length,
    completeScripts,
    incompleteScripts,
    missingPages,
    extraPages,
    scripts,
    warnings,
    canProceed: scripts.length > 0,
  };
}

export async function confirmScriptVerification(
  batchId: string,
  workspaceId: string
) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: { select: { id: true, aiMetadata: true } },
    },
  });
  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (isMarkingPackAssessment(batch.assessment)) {
    let setup = await getAssessmentSetupStatus(batch.assessment.id, workspaceId);

    if (!setup.questionsExtracted || !setup.memoAnswersReady) {
      await finalizeQuickScan(batch.assessment.id, workspaceId);
      setup = await getAssessmentSetupStatus(batch.assessment.id, workspaceId);
    }

    if (!setup.memoAnswersReady) {
      throw new ScriptError(
        setup.memoBlocker ??
          quickScanMemoBlockerMessage(batch.assessment, setup.masterFiles),
        400
      );
    }
  }

  const verification = await getScriptVerification(batchId, workspaceId);
  if (!verification.canProceed) {
    throw new ScriptError("No scripts to process", 400);
  }

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: {
      status:
        batch.status === ScriptBatchStatus.DRAFT
          ? ScriptBatchStatus.MARKING
          : batch.status,
    },
  });

  return verification;
}
