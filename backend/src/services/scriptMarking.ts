import {
  AnnotationLayerType,
  AssessmentStatus,
  LearnerScriptStatus,
  ScriptBatchStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import {
  applyModerationApproveLocks,
  applyModerationSubmitLocks,
  applyReturnToTeacherUnlocks,
  canEditHodLayer,
  canEditTeacherLayer,
  isScriptReadOnly,
  serializeWorkflowFields,
} from "./scriptWorkflow";
import { computeMarkTotals } from "./markTotals";
import { ModerationVarianceLevel } from "@prisma/client";
import { syncMarkFromScript } from "./markCapture";

export class ScriptError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ScriptError";
  }
}

const LAYER_COLORS: Record<AnnotationLayerType, string> = {
  ORIGINAL: "#888888",
  TEACHER_RED: "#ff6b6b",
  HOD_GREEN: "#3ecf8e",
  FINAL: "#d4af37",
};

function computeFinalMark(teacherMark: number | null, hodMark: number | null): number | null {
  if (hodMark != null) return hodMark;
  if (teacherMark != null) return teacherMark;
  return null;
}

function sumMarks(marks: (number | null)[]): number {
  return marks.reduce<number>((sum, m) => sum + (m ?? 0), 0);
}

async function recalculateScriptTotals(learnerScriptId: string) {
  const marks = await prisma.scriptQuestionMark.findMany({
    where: { learnerScriptId },
  });

  const teacherMarks = marks.map((m) => m.teacherMark);
  const hodMarks = marks.map((m) => m.hodMark);
  const finalMarks = marks.map((m) =>
    computeFinalMark(m.teacherMark, m.hodMark)
  );

  const teacherTotal = sumMarks(teacherMarks);
  const hodTotal = hodMarks.some((m) => m != null) ? sumMarks(hodMarks) : null;
  const finalTotal = sumMarks(finalMarks);

  for (const mark of marks) {
    const finalMark = computeFinalMark(mark.teacherMark, mark.hodMark);
    await prisma.scriptQuestionMark.update({
      where: { id: mark.id },
      data: { finalMark },
    });
  }

  const script = await prisma.learnerScript.findUnique({
    where: { id: learnerScriptId },
    include: { assessment: { select: { totalMarks: true } } },
  });

  const assessmentTotal = script?.assessment.totalMarks ?? 0;
  const computed = computeMarkTotals(
    teacherTotal,
    hodTotal,
    finalTotal,
    assessmentTotal
  );

  return prisma.learnerScript.update({
    where: { id: learnerScriptId },
    data: {
      teacherTotal: computed.teacherTotal,
      hodTotal: computed.hodTotal,
      finalTotal: computed.finalTotal,
      markDifference: computed.markDifference,
      teacherPercentage: computed.teacherPercentage,
      hodPercentage: computed.hodPercentage,
      finalPercentage: computed.finalPercentage,
      moderationVariancePercent: computed.moderationVariancePercent,
      varianceLevel: computed.varianceLevel,
    },
  });
}

export async function recalculateScriptTotalsWithVariance(
  learnerScriptId: string,
  previousVarianceLevel?: ModerationVarianceLevel
) {
  const updated = await recalculateScriptTotals(learnerScriptId);
  return {
    script: updated,
    varianceFlagged:
      previousVarianceLevel !== undefined &&
      updated.varianceLevel !== previousVarianceLevel &&
      (
        [
          ModerationVarianceLevel.WARNING,
          ModerationVarianceLevel.SIGNIFICANT,
          ModerationVarianceLevel.CRITICAL,
        ] as ModerationVarianceLevel[]
      ).includes(updated.varianceLevel),
    varianceLevel: updated.varianceLevel,
    moderationVariancePercent: updated.moderationVariancePercent,
  };
}

async function createDefaultLayers(learnerScriptId: string, createdById: string) {
  const layerTypes: AnnotationLayerType[] = [
    AnnotationLayerType.ORIGINAL,
    AnnotationLayerType.TEACHER_RED,
    AnnotationLayerType.HOD_GREEN,
    AnnotationLayerType.FINAL,
  ];

  for (const layerType of layerTypes) {
    await prisma.scriptAnnotationLayer.create({
      data: {
        learnerScriptId,
        layerType,
        color: LAYER_COLORS[layerType],
        createdById,
        annotationData: { strokes: [], notes: [] },
      },
    });
  }
}

async function initQuestionMarks(learnerScriptId: string, assessmentId: string) {
  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    orderBy: { orderIndex: "asc" },
  });

  for (const q of questions) {
    await prisma.scriptQuestionMark.create({
      data: {
        learnerScriptId,
        assessmentQuestionId: q.id,
        questionNumber: q.questionNumber,
        maxMarks: q.marks,
      },
    });
  }
}

export async function createLearner(
  workspaceId: string,
  data: {
    learnerNumber: string;
    firstName: string;
    lastName: string;
    gradeId: string;
    className?: string | null;
  }
) {
  const learnerNumber = data.learnerNumber.trim();
  if (!learnerNumber) throw new ScriptError("learnerNumber is required", 400);

  return prisma.learner.create({
    data: {
      workspaceId,
      learnerNumber,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      gradeId: data.gradeId,
      className: data.className?.trim() || null,
    },
  });
}

export async function listLearners(workspaceId: string, gradeId?: string) {
  return prisma.learner.findMany({
    where: {
      workspaceId,
      active: true,
      ...(gradeId ? { gradeId } : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function createScriptBatch(
  workspaceId: string,
  userId: string,
  assessmentId: string,
  title: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: { questions: true },
  });

  if (!assessment) throw new ScriptError("Assessment not found", 404);
  if (assessment.questions.length === 0) {
    throw new ScriptError("Assessment must have questions before creating a script batch", 400);
  }

  return prisma.scriptBatch.create({
    data: {
      workspaceId,
      assessmentId,
      createdById: userId,
      title: title.trim() || `${assessment.title} — Scripts`,
      status: ScriptBatchStatus.DRAFT,
    },
    include: {
      assessment: { select: { id: true, title: true, totalMarks: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

export async function listBatchesForAssessment(
  workspaceId: string,
  assessmentId: string
) {
  return prisma.scriptBatch.findMany({
    where: { workspaceId, assessmentId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      _count: { select: { learnerScripts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getScriptBatch(batchId: string, workspaceId: string) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          grade: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { id: true, fullName: true } },
      learnerScripts: {
        include: {
          learner: true,
        },
        orderBy: { scriptNumber: "asc" },
      },
    },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);
  return batch;
}

export async function addLearnerScriptToBatch(
  batchId: string,
  workspaceId: string,
  userId: string,
  data: {
    learnerId?: string;
    learner?: {
      learnerNumber: string;
      firstName: string;
      lastName: string;
      gradeId: string;
      className?: string | null;
    };
    pageCount?: number;
  }
) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: { learnerScripts: true },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (
    batch.status !== ScriptBatchStatus.DRAFT &&
    batch.status !== ScriptBatchStatus.MARKING &&
    batch.status !== ScriptBatchStatus.RETURNED_TO_TEACHER
  ) {
    throw new ScriptError("Cannot add scripts to batch in current status", 400);
  }

  let learnerId = data.learnerId;

  if (!learnerId && data.learner) {
    const existing = await prisma.learner.findUnique({
      where: {
        workspaceId_learnerNumber: {
          workspaceId,
          learnerNumber: data.learner.learnerNumber.trim(),
        },
      },
    });

    if (existing) {
      learnerId = existing.id;
    } else {
      const created = await createLearner(workspaceId, data.learner);
      learnerId = created.id;
    }
  }

  if (!learnerId) throw new ScriptError("learnerId or learner details required", 400);

  const existingScript = await prisma.learnerScript.findUnique({
    where: { batchId_learnerId: { batchId, learnerId } },
  });

  if (existingScript) {
    throw new ScriptError("Learner already has a script in this batch", 400);
  }

  const scriptNumber = String(batch.learnerScripts.length + 1);

  const script = await prisma.learnerScript.create({
    data: {
      batchId,
      learnerId,
      assessmentId: batch.assessmentId,
      scriptNumber,
      pageCount: data.pageCount ?? 0,
      status: LearnerScriptStatus.NOT_MARKED,
    },
    include: { learner: true },
  });

  await initQuestionMarks(script.id, batch.assessmentId);
  await createDefaultLayers(script.id, userId);

  const uniqueLearners = new Set([
    ...batch.learnerScripts.map((s) => s.learnerId),
    learnerId,
  ]);

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: {
      status: ScriptBatchStatus.MARKING,
      totalScripts: batch.learnerScripts.length + 1,
      totalLearners: uniqueLearners.size,
      totalPages: {
        increment: data.pageCount ?? 0,
      },
    },
  });

  return script;
}

function serializeScriptDetail(
  script: Awaited<ReturnType<typeof loadLearnerScript>>
) {
  const assessmentTotal = script.assessment.totalMarks;
  const finalTotal = script.finalTotal ?? 0;
  const percentage =
    assessmentTotal > 0 ? Math.round((finalTotal / assessmentTotal) * 1000) / 10 : 0;

  return {
    id: script.id,
    batchId: script.batchId,
    scriptNumber: script.scriptNumber,
    pageCount: script.pageCount,
    status: script.status,
    teacherTotal: script.teacherTotal,
    hodTotal: script.hodTotal,
    finalTotal: script.finalTotal,
    markDifference: script.markDifference,
    teacherPercentage: script.teacherPercentage,
    hodPercentage: script.hodPercentage,
    finalPercentage: script.finalPercentage ?? percentage,
    moderationVariancePercent: script.moderationVariancePercent,
    varianceLevel: script.varianceLevel,
    confidence: script.confidence,
    submittedToHodAt: script.submittedToHodAt,
    approvedAt: script.approvedAt,
    learner: {
      id: script.learner.id,
      learnerNumber: script.learner.learnerNumber,
      firstName: script.learner.firstName,
      lastName: script.learner.lastName,
      className: script.learner.className,
    },
    assessment: {
      id: script.assessment.id,
      title: script.assessment.title,
      totalMarks: script.assessment.totalMarks,
    },
    batch: {
      id: script.batch.id,
      title: script.batch.title,
      status: script.batch.status,
      examSessionMode: script.batch.examSessionMode,
    },
    ...serializeWorkflowFields(script),
    percentage,
    outOf: assessmentTotal,
    questionMarks: script.questionMarks.map((m) => ({
      id: m.id,
      assessmentQuestionId: m.assessmentQuestionId,
      questionNumber: m.questionNumber,
      maxMarks: m.maxMarks,
      questionText: m.assessmentQuestion.questionText,
      teacherMark: m.teacherMark,
      hodMark: m.hodMark,
      finalMark: m.finalMark,
      teacherComment: m.teacherComment,
      hodComment: m.hodComment,
      teacherAnnotatedText: m.teacherAnnotatedText,
      hodAnnotatedText: m.hodAnnotatedText,
    })),
    layers: script.layers.map((l) => ({
      id: l.id,
      layerType: l.layerType,
      color: l.color,
      label:
        l.layerType === "TEACHER_RED"
          ? "Teacher Marking"
          : l.layerType === "HOD_GREEN"
            ? "HOD Moderation"
            : l.layerType.replaceAll("_", " "),
    })),
    pages: (() => {
      const pdfGroups = new Map<string, typeof script.pages>();
      for (const page of script.pages) {
        if (page.mimeType === "application/pdf") {
          const group = pdfGroups.get(page.filePath) ?? [];
          group.push(page);
          pdfGroups.set(page.filePath, group);
        }
      }
      const sourceIndexById = new Map<string, number>();
      for (const group of pdfGroups.values()) {
        group.sort((a, b) => a.pageNumber - b.pageNumber);
        group.forEach((page, index) => {
          sourceIndexById.set(page.id, index + 1);
        });
      }
      return script.pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        fileName: p.fileName,
        mimeType: p.mimeType,
        fileSize: p.fileSize,
        width: p.width,
        height: p.height,
        uploadedAt: p.uploadedAt,
        sourcePageIndex: sourceIndexById.get(p.id) ?? null,
      }));
    })(),
  };
}

async function loadLearnerScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      learner: true,
      batch: true,
      finalisedBy: { select: { id: true, fullName: true } },
      assessment: {
        select: { id: true, title: true, totalMarks: true, status: true },
      },
      questionMarks: {
        orderBy: { questionNumber: "asc" },
        include: {
          assessmentQuestion: { select: { questionText: true } },
        },
      },
      layers: true,
      pages: { orderBy: { pageNumber: "asc" } },
    },
  });

  if (!script) throw new ScriptError("Learner script not found", 404);
  return script;
}

export async function getLearnerScript(scriptId: string, workspaceId: string) {
  const script = await loadLearnerScript(scriptId, workspaceId);
  return serializeScriptDetail(script);
}

export async function saveScriptMarks(
  scriptId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  marks: Array<{
    assessmentQuestionId: string;
    teacherMark?: number | null;
    teacherComment?: string | null;
    teacherAnnotatedText?: string | null;
    hodMark?: number | null;
    hodComment?: string | null;
    hodAnnotatedText?: string | null;
  }>
) {
  const script = await loadLearnerScript(scriptId, workspaceId);

  if (script.assessment.status === AssessmentStatus.PUBLISHED) {
    throw new ScriptError("Published results are read-only", 403);
  }

  if (isScriptReadOnly(script)) {
    throw new ScriptError("Finalised scripts are read-only", 403);
  }

  const canMark = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MARK);
  const canModerate = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MODERATE);

  if (!canMark && !canModerate) {
    throw new ScriptError("Insufficient permissions to save marks", 403);
  }

  const teacherEditable = canEditTeacherLayer(script);
  const hodEditable = canEditHodLayer(script);
  const previousVarianceLevel = script.varianceLevel;
  let hadExistingMarks = false;
  let capturedNewMarks = false;

  for (const entry of marks) {
    const existing = await prisma.scriptQuestionMark.findFirst({
      where: {
        learnerScriptId: scriptId,
        assessmentQuestionId: entry.assessmentQuestionId,
      },
    });

    if (!existing) continue;

    const updateData: Record<string, unknown> = {};

    if (
      canMark &&
      teacherEditable &&
      (entry.teacherMark !== undefined ||
        entry.teacherComment !== undefined ||
        entry.teacherAnnotatedText !== undefined)
    ) {
      if (entry.teacherMark !== undefined) {
        const val = entry.teacherMark;
        if (val != null && (val < 0 || val > existing.maxMarks)) {
          throw new ScriptError(
            `Teacher mark for Q${existing.questionNumber} must be between 0 and ${existing.maxMarks}`,
            400
          );
        }
        updateData.teacherMark = val;
        updateData.teacherMarkedById = userId;
      }
      if (entry.teacherComment !== undefined) {
        updateData.teacherComment = entry.teacherComment?.trim() || null;
      }
      if (entry.teacherAnnotatedText !== undefined) {
        updateData.teacherAnnotatedText = entry.teacherAnnotatedText?.trim() || null;
      }
    }

    if (
      canModerate &&
      hodEditable &&
      (entry.hodMark !== undefined ||
        entry.hodComment !== undefined ||
        entry.hodAnnotatedText !== undefined)
    ) {
      if (entry.hodMark !== undefined) {
        const val = entry.hodMark;
        if (val != null && (val < 0 || val > existing.maxMarks)) {
          throw new ScriptError(
            `HOD mark for Q${existing.questionNumber} must be between 0 and ${existing.maxMarks}`,
            400
          );
        }
        updateData.hodMark = val;
        updateData.hodModeratedById = userId;
      }
      if (entry.hodComment !== undefined) {
        updateData.hodComment = entry.hodComment?.trim() || null;
      }
      if (entry.hodAnnotatedText !== undefined) {
        updateData.hodAnnotatedText = entry.hodAnnotatedText?.trim() || null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      if (existing.teacherMark != null || existing.hodMark != null) {
        hadExistingMarks = true;
      }
      if (
        entry.teacherMark != null &&
        existing.teacherMark == null &&
        updateData.teacherMark != null
      ) {
        capturedNewMarks = true;
      }
      await prisma.scriptQuestionMark.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
  }

  if (canMark && teacherEditable) {
    const markingStatuses: LearnerScriptStatus[] = [
      LearnerScriptStatus.NOT_MARKED,
      LearnerScriptStatus.IN_PROGRESS,
      LearnerScriptStatus.UPLOADED,
    ];
    if (markingStatuses.includes(script.status)) {
      await prisma.learnerScript.update({
        where: { id: scriptId },
        data: { status: LearnerScriptStatus.MARKING },
      });
    }
  }

  const recalc = await recalculateScriptTotalsWithVariance(
    scriptId,
    previousVarianceLevel
  );

  await syncMarkFromScript(scriptId, userId).catch((err) => {
    console.error("[markCapture] sync failed", err);
  });

  return {
    script: await getLearnerScript(scriptId, workspaceId),
    audit: {
      markAction: capturedNewMarks
        ? ("SCRIPT_MARK_CAPTURED" as const)
        : hadExistingMarks
          ? ("SCRIPT_MARK_UPDATED" as const)
          : ("SCRIPT_MARK_SAVED" as const),
      varianceFlagged: recalc.varianceFlagged,
      varianceLevel: recalc.varianceLevel,
      moderationVariancePercent: recalc.moderationVariancePercent,
    },
  };
}

export async function completeLearnerScript(
  scriptId: string,
  workspaceId: string
) {
  const script = await loadLearnerScript(scriptId, workspaceId);

  if (isScriptReadOnly(script) || script.teacherLayerLocked) {
    throw new ScriptError("Script marking is locked", 403);
  }

  const completable: LearnerScriptStatus[] = [
    LearnerScriptStatus.IN_PROGRESS,
    LearnerScriptStatus.NOT_MARKED,
    LearnerScriptStatus.UPLOADED,
    LearnerScriptStatus.MARKING,
    LearnerScriptStatus.RETURNED_TO_TEACHER,
  ];
  if (!completable.includes(script.status)) {
    throw new ScriptError("Script cannot be marked complete in current status", 400);
  }

  const incomplete = script.questionMarks.filter((m) => m.teacherMark == null);
  if (incomplete.length > 0) {
    throw new ScriptError(
      `All questions must have teacher marks. Missing: ${incomplete.map((m) => m.questionNumber).join(", ")}`,
      400
    );
  }

  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: { status: LearnerScriptStatus.MARKED },
  });

  return getLearnerScript(scriptId, workspaceId);
}

export async function submitBatchToHod(
  batchId: string,
  workspaceId: string,
  actorId: string
) {
  const batch = await getScriptBatch(batchId, workspaceId);

  if (
    batch.status !== ScriptBatchStatus.MARKING &&
    batch.status !== ScriptBatchStatus.TEACHER_REVIEW &&
    batch.status !== ScriptBatchStatus.RETURNED_TO_TEACHER
  ) {
    throw new ScriptError("Batch cannot be submitted in current status", 400);
  }

  if (batch.learnerScripts.length === 0) {
    throw new ScriptError("Batch has no learner scripts", 400);
  }

  const unmarked = batch.learnerScripts.filter(
    (s) => s.status !== LearnerScriptStatus.MARKED
  );

  if (unmarked.length > 0) {
    throw new ScriptError(
      `All learner scripts must be marked before submit (${unmarked.length} remaining)`,
      400
    );
  }

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: { status: ScriptBatchStatus.SUBMITTED_TO_HOD },
  });

  await applyModerationSubmitLocks(batchId, workspaceId, actorId);

  return getScriptBatch(batchId, workspaceId);
}

export async function listScriptModerationQueue(workspaceId: string) {
  return prisma.scriptBatch.findMany({
    where: {
      workspaceId,
      status: {
        in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW],
      },
    },
    include: {
      assessment: { select: { id: true, title: true, totalMarks: true } },
      createdBy: { select: { id: true, fullName: true } },
      learnerScripts: {
        include: { learner: true },
        orderBy: { scriptNumber: "asc" },
      },
    },
    orderBy: { updatedAt: "asc" },
  });
}

export async function startHodReview(batchId: string, workspaceId: string) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (batch.status === ScriptBatchStatus.SUBMITTED_TO_HOD) {
    await prisma.$transaction([
      prisma.scriptBatch.update({
        where: { id: batchId },
        data: { status: ScriptBatchStatus.HOD_REVIEW },
      }),
      prisma.learnerScript.updateMany({
        where: { batchId },
        data: { status: LearnerScriptStatus.MODERATION },
      }),
    ]);
  }

  return getScriptBatch(batchId, workspaceId);
}

export async function approveScriptBatch(
  batchId: string,
  workspaceId: string,
  actorId: string
) {
  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (
    batch.status !== ScriptBatchStatus.SUBMITTED_TO_HOD &&
    batch.status !== ScriptBatchStatus.HOD_REVIEW
  ) {
    throw new ScriptError("Batch cannot be approved in current status", 400);
  }

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: { status: ScriptBatchStatus.APPROVED },
  });

  await applyModerationApproveLocks(batchId, workspaceId, actorId);

  await prisma.assessment.updateMany({
    where: {
      id: batch.assessmentId,
      status: {
        in: [
          AssessmentStatus.APPROVED,
          AssessmentStatus.WRITTEN,
          AssessmentStatus.MARKING,
        ],
      },
    },
    data: { status: AssessmentStatus.MARKED },
  });

  return getScriptBatch(batchId, workspaceId);
}

export async function returnScriptBatch(
  batchId: string,
  workspaceId: string,
  actorId: string,
  comment: string
) {
  const trimmed = comment?.trim();
  if (!trimmed) throw new ScriptError("A comment is required when returning a batch", 400);

  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (
    batch.status !== ScriptBatchStatus.SUBMITTED_TO_HOD &&
    batch.status !== ScriptBatchStatus.HOD_REVIEW
  ) {
    throw new ScriptError("Batch cannot be returned in current status", 400);
  }

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: { status: ScriptBatchStatus.RETURNED_TO_TEACHER },
  });

  await applyReturnToTeacherUnlocks(batchId, workspaceId, actorId);

  return { batchId, comment: trimmed };
}
