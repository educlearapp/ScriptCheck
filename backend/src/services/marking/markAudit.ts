import { MarkCaptureSource } from "@prisma/client";
import { prisma } from "../../prisma";
import { logAudit } from "../auditLog";

export type MarkAdjustmentInput = {
  workspaceId: string;
  assessmentId: string;
  learnerScriptId?: string;
  learnerId?: string;
  questionMarkId?: string;
  field: string;
  previousValue: number | null;
  newValue: number | null;
  reason?: string;
  adjustedById: string;
  source?: MarkCaptureSource;
};

export async function recordMarkAdjustment(input: MarkAdjustmentInput) {
  if (input.previousValue === input.newValue) return null;

  const record = await prisma.markAdjustmentAudit.create({
    data: {
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      learnerScriptId: input.learnerScriptId ?? null,
      learnerId: input.learnerId ?? null,
      questionMarkId: input.questionMarkId ?? null,
      field: input.field,
      previousValue: input.previousValue,
      newValue: input.newValue,
      reason: input.reason?.trim() || null,
      adjustedById: input.adjustedById,
      source: input.source ?? MarkCaptureSource.SCRIPT_MARKING,
    },
    include: {
      adjustedBy: { select: { id: true, fullName: true } },
    },
  });

  await logAudit({
    action: "MARK_ADJUSTED",
    workspaceId: input.workspaceId,
    actorId: input.adjustedById,
    metadata: {
      assessmentId: input.assessmentId,
      learnerScriptId: input.learnerScriptId,
      field: input.field,
      previousValue: input.previousValue,
      newValue: input.newValue,
    },
  });

  return record;
}

export async function listMarkAdjustments(
  assessmentId: string,
  workspaceId: string,
  options?: { learnerScriptId?: string; limit?: number }
) {
  return prisma.markAdjustmentAudit.findMany({
    where: {
      assessmentId,
      workspaceId,
      ...(options?.learnerScriptId
        ? { learnerScriptId: options.learnerScriptId }
        : {}),
    },
    include: {
      adjustedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}

export async function trackQuestionMarkChanges(
  existing: {
    id: string;
    teacherMark: number | null;
    hodMark: number | null;
    finalMark: number | null;
  },
  updates: Record<string, unknown>,
  context: {
    workspaceId: string;
    assessmentId: string;
    learnerScriptId: string;
    learnerId: string;
    adjustedById: string;
  }
) {
  const fields = ["teacherMark", "hodMark", "finalMark"] as const;
  const adjustments = [];

  for (const field of fields) {
    if (updates[field] === undefined) continue;
    const newValue = updates[field] as number | null;
    const previousValue = existing[field];
    if (newValue !== previousValue) {
      const adj = await recordMarkAdjustment({
        ...context,
        questionMarkId: existing.id,
        field,
        previousValue,
        newValue,
      });
      if (adj) adjustments.push(adj);
    }
  }

  return adjustments;
}
