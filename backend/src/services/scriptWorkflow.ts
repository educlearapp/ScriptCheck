import { AuditAction, LearnerScriptStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import { ScriptError } from "./scriptMarking";
import { logAudit } from "./auditLog";

export type WorkflowDisplayStatus =
  | "UPLOADED"
  | "MARKING"
  | "MARKED"
  | "MODERATION"
  | "MODERATED"
  | "FINALISED"
  | "RETURNED";

export type ScriptWorkflowAction =
  | "upload"
  | "mark"
  | "complete"
  | "submit_moderation"
  | "start_review"
  | "approve"
  | "return_to_teacher"
  | "finalise";

export function normalizeWorkflowStatus(
  status: LearnerScriptStatus,
  pageCount: number
): WorkflowDisplayStatus {
  switch (status) {
    case LearnerScriptStatus.UPLOADED:
      return "UPLOADED";
    case LearnerScriptStatus.MARKING:
    case LearnerScriptStatus.IN_PROGRESS:
      return "MARKING";
    case LearnerScriptStatus.NOT_MARKED:
      return pageCount > 0 ? "UPLOADED" : "MARKING";
    case LearnerScriptStatus.MARKED:
      return "MARKED";
    case LearnerScriptStatus.SUBMITTED_TO_HOD:
    case LearnerScriptStatus.HOD_REVIEW:
    case LearnerScriptStatus.MODERATION:
      return "MODERATION";
    case LearnerScriptStatus.RETURNED_TO_TEACHER:
      return "RETURNED";
    case LearnerScriptStatus.APPROVED:
    case LearnerScriptStatus.MODERATED:
      return "MODERATED";
    case LearnerScriptStatus.FINALISED:
      return "FINALISED";
    default:
      return "MARKING";
  }
}

type ScriptLockState = {
  status: LearnerScriptStatus;
  teacherLayerLocked: boolean;
  hodLayerLocked: boolean;
};

const TEACHER_EDITABLE_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.NOT_MARKED,
  LearnerScriptStatus.IN_PROGRESS,
  LearnerScriptStatus.UPLOADED,
  LearnerScriptStatus.MARKING,
  LearnerScriptStatus.MARKED,
  LearnerScriptStatus.RETURNED_TO_TEACHER,
];

const HOD_EDITABLE_STATUSES: LearnerScriptStatus[] = [
  LearnerScriptStatus.SUBMITTED_TO_HOD,
  LearnerScriptStatus.HOD_REVIEW,
  LearnerScriptStatus.MODERATION,
];

export function isScriptReadOnly(script: ScriptLockState): boolean {
  return script.status === LearnerScriptStatus.FINALISED;
}

export function canEditTeacherLayer(script: ScriptLockState): boolean {
  if (isScriptReadOnly(script)) return false;
  if (script.teacherLayerLocked) return false;
  return TEACHER_EDITABLE_STATUSES.includes(script.status);
}

export function canEditHodLayer(script: ScriptLockState): boolean {
  if (isScriptReadOnly(script)) return false;
  if (script.hodLayerLocked) return false;
  return HOD_EDITABLE_STATUSES.includes(script.status);
}

export function getAvailableActions(
  script: {
    status: LearnerScriptStatus;
    pageCount: number;
    teacherLayerLocked: boolean;
    hodLayerLocked: boolean;
  },
  access: UserAccessContext,
  workspaceId: string
): ScriptWorkflowAction[] {
  const actions: ScriptWorkflowAction[] = [];
  const wf = normalizeWorkflowStatus(script.status, script.pageCount);

  if (hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_CREATE) && script.pageCount === 0) {
    actions.push("upload");
  }

  if (
    hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MARK) &&
    canEditTeacherLayer(script)
  ) {
    actions.push("mark");
    if (wf === "MARKING" || wf === "UPLOADED" || wf === "RETURNED") {
      actions.push("complete");
    }
  }

  if (
    hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_SUBMIT) &&
    wf === "MARKED" &&
    !script.teacherLayerLocked
  ) {
    actions.push("submit_moderation");
  }

  if (hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MODERATE)) {
    if (wf === "MODERATION") {
      actions.push("start_review", "approve", "return_to_teacher");
    }
  }

  if (
    hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_FINALISE) &&
    (wf === "MODERATED" || script.status === LearnerScriptStatus.APPROVED)
  ) {
    actions.push("finalise");
  }

  return actions;
}

async function loadScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      batch: true,
      finalisedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!script) throw new ScriptError("Learner script not found", 404);
  return script;
}

export async function getScriptWorkflow(
  scriptId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const script = await loadScript(scriptId, workspaceId);
  const workflowStatus = normalizeWorkflowStatus(script.status, script.pageCount);

  return {
    scriptId: script.id,
    batchId: script.batchId,
    status: script.status,
    workflowStatus,
    pageCount: script.pageCount,
    teacherLayerLocked: script.teacherLayerLocked,
    hodLayerLocked: script.hodLayerLocked,
    isReadOnly: isScriptReadOnly(script),
    canEditTeacherLayer: canEditTeacherLayer(script),
    canEditHodLayer: canEditHodLayer(script),
    examSessionMode: script.batch.examSessionMode,
    submittedToHodAt: script.submittedToHodAt,
    approvedAt: script.approvedAt,
    finalisedAt: script.finalisedAt,
    finalisedBy: script.finalisedBy,
    availableActions: getAvailableActions(script, access, workspaceId),
  };
}

export async function transitionScriptStatus(
  scriptId: string,
  workspaceId: string,
  fromStatus: LearnerScriptStatus,
  toStatus: LearnerScriptStatus,
  actorId: string,
  metadata?: Record<string, unknown>
) {
  await logAudit({
    action: "SCRIPT_STATUS_CHANGED",
    actorId,
    workspaceId,
    metadata: { scriptId, fromStatus, toStatus, ...metadata },
  });
}

export async function lockTeacherLayer(
  scriptId: string,
  workspaceId: string,
  actorId: string,
  reason: string
) {
  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: { teacherLayerLocked: true },
  });

  await logAudit({
    action: "SCRIPT_LAYER_LOCKED",
    actorId,
    workspaceId,
    metadata: { scriptId, layer: "TEACHER_RED", reason },
  });
}

export async function unlockTeacherLayer(
  scriptId: string,
  workspaceId: string,
  actorId: string,
  reason: string
) {
  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: { teacherLayerLocked: false },
  });

  await logAudit({
    action: "SCRIPT_LAYER_UNLOCKED",
    actorId,
    workspaceId,
    metadata: { scriptId, layer: "TEACHER_RED", reason },
  });
}

export async function lockHodLayer(
  scriptId: string,
  workspaceId: string,
  actorId: string,
  reason: string
) {
  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: { hodLayerLocked: true },
  });

  await logAudit({
    action: "SCRIPT_LAYER_LOCKED",
    actorId,
    workspaceId,
    metadata: { scriptId, layer: "HOD_GREEN", reason },
  });
}

export async function applyModerationSubmitLocks(
  batchId: string,
  workspaceId: string,
  actorId: string
) {
  const scripts = await prisma.learnerScript.findMany({
    where: { batchId },
    select: { id: true },
  });

  for (const s of scripts) {
    await prisma.learnerScript.update({
      where: { id: s.id },
      data: {
        status: LearnerScriptStatus.MODERATION,
        teacherLayerLocked: true,
        submittedToHodAt: new Date(),
      },
    });
    await logAudit({
      action: "SCRIPT_LAYER_LOCKED",
      actorId,
      workspaceId,
      metadata: { scriptId: s.id, layer: "TEACHER_RED", reason: "submitted_for_moderation" },
    });
    await logAudit({
      action: "SCRIPT_STATUS_CHANGED",
      actorId,
      workspaceId,
      metadata: {
        scriptId: s.id,
        fromStatus: "MARKED",
        toStatus: "MODERATION",
      },
    });
  }
}

export async function applyModerationApproveLocks(
  batchId: string,
  workspaceId: string,
  actorId: string
) {
  const now = new Date();
  const scripts = await prisma.learnerScript.findMany({
    where: { batchId },
    select: { id: true, status: true },
  });

  for (const s of scripts) {
    await prisma.learnerScript.update({
      where: { id: s.id },
      data: {
        status: LearnerScriptStatus.MODERATED,
        hodLayerLocked: true,
        approvedAt: now,
      },
    });
    await logAudit({
      action: "SCRIPT_LAYER_LOCKED",
      actorId,
      workspaceId,
      metadata: { scriptId: s.id, layer: "HOD_GREEN", reason: "moderation_approved" },
    });
    await logAudit({
      action: "SCRIPT_STATUS_CHANGED",
      actorId,
      workspaceId,
      metadata: {
        scriptId: s.id,
        fromStatus: s.status,
        toStatus: "MODERATED",
      },
    });
  }
}

export async function applyReturnToTeacherUnlocks(
  batchId: string,
  workspaceId: string,
  actorId: string,
  scriptIds?: string[]
) {
  const scripts = await prisma.learnerScript.findMany({
    where: {
      batchId,
      ...(scriptIds?.length ? { id: { in: scriptIds } } : {}),
    },
    select: { id: true },
  });

  for (const s of scripts) {
    await prisma.learnerScript.update({
      where: { id: s.id },
      data: {
        status: LearnerScriptStatus.RETURNED_TO_TEACHER,
        teacherLayerLocked: false,
        hodLayerLocked: false,
      },
    });
    await logAudit({
      action: "SCRIPT_LAYER_UNLOCKED",
      actorId,
      workspaceId,
      metadata: { scriptId: s.id, layer: "TEACHER_RED", reason: "returned_to_teacher" },
    });
    await logAudit({
      action: "SCRIPT_STATUS_CHANGED",
      actorId,
      workspaceId,
      metadata: {
        scriptId: s.id,
        toStatus: "RETURNED_TO_TEACHER",
      },
    });
  }
}

export async function finaliseScript(
  scriptId: string,
  workspaceId: string,
  actorId: string,
  access: UserAccessContext
) {
  if (!hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_FINALISE)) {
    throw new ScriptError("Insufficient permissions to finalise script", 403);
  }

  const script = await loadScript(scriptId, workspaceId);

  if (script.status === LearnerScriptStatus.FINALISED) {
    throw new ScriptError("Script is already finalised", 400);
  }

  const wf = normalizeWorkflowStatus(script.status, script.pageCount);
  if (wf !== "MODERATED" && script.status !== LearnerScriptStatus.APPROVED) {
    throw new ScriptError("Script must be moderated before finalisation", 400);
  }

  const now = new Date();
  const fromStatus = script.status;

  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: {
      status: LearnerScriptStatus.FINALISED,
      teacherLayerLocked: true,
      hodLayerLocked: true,
      finalisedAt: now,
      finalisedById: actorId,
    },
  });

  await logAudit({
    action: "SCRIPT_FINALISED",
    actorId,
    workspaceId,
    metadata: { scriptId, fromStatus },
  });

  await logAudit({
    action: "SCRIPT_LAYER_LOCKED",
    actorId,
    workspaceId,
    metadata: { scriptId, layer: "ALL", reason: "finalised" },
  });

  await logAudit({
    action: "SCRIPT_STATUS_CHANGED",
    actorId,
    workspaceId,
    metadata: { scriptId, fromStatus, toStatus: "FINALISED" },
  });

  return getScriptWorkflow(scriptId, workspaceId, access);
}

const SCRIPT_AUDIT_ACTIONS: AuditAction[] = [
  "SCRIPT_PAGE_UPLOADED",
  "SCRIPT_ANNOTATION_CREATED",
  "SCRIPT_ANNOTATION_UPDATED",
  "SCRIPT_MARK_SAVED",
  "SCRIPT_MARK_CAPTURED",
  "SCRIPT_MARK_UPDATED",
  "SCRIPT_VARIANCE_FLAGGED",
  "SCRIPT_MARKED_COMPLETE",
  "SCRIPT_STATUS_CHANGED",
  "SCRIPT_LAYER_LOCKED",
  "SCRIPT_LAYER_UNLOCKED",
  "SCRIPT_FINALISED",
  "SCRIPT_BATCH_SUBMITTED_TO_HOD",
  "SCRIPT_BATCH_APPROVED",
  "SCRIPT_BATCH_RETURNED",
  "LEARNER_SCRIPT_CREATED",
];

export async function getScriptAuditTimeline(scriptId: string, workspaceId: string) {
  const script = await loadScript(scriptId, workspaceId);

  const allLogs = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: { in: SCRIPT_AUDIT_ACTIONS },
    },
    include: {
      actor: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const merged = allLogs
    .filter((log) => {
      const meta = log.metadata as Record<string, unknown> | null;
      if (!meta) return false;
      return meta.scriptId === scriptId || meta.batchId === script.batchId;
    })
    .slice(0, 50);

  return merged.map((log) => ({
    id: log.id,
    action: log.action,
    metadata: log.metadata,
    createdAt: log.createdAt,
    actor: log.actor,
  }));
}

export function serializeWorkflowFields(script: {
  status: LearnerScriptStatus;
  pageCount: number;
  teacherLayerLocked: boolean;
  hodLayerLocked: boolean;
  finalisedAt: Date | null;
  finalisedBy?: { id: string; fullName: string } | null;
}) {
  return {
    workflowStatus: normalizeWorkflowStatus(script.status, script.pageCount),
    teacherLayerLocked: script.teacherLayerLocked,
    hodLayerLocked: script.hodLayerLocked,
    isReadOnly: isScriptReadOnly(script),
    canEditTeacherLayer: canEditTeacherLayer(script),
    canEditHodLayer: canEditHodLayer(script),
    finalisedAt: script.finalisedAt,
    finalisedBy: script.finalisedBy ?? null,
  };
}
