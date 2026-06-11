import { AssessmentStatus, ModerationAction } from "@prisma/client";
import type { WorkflowTransitionAction } from "./workflowTypes";
import { prisma } from "../../prisma";
import {
  hasAnyRole,
  hasPermission,
  UserAccessContext,
} from "../../services/permissions";
import { P } from "../permissions/permissionRegistry";
import {
  DEFAULT_WORKFLOW_STAGES,
  getNextStage,
  getPreviousStage,
  getStageForStatus,
  STATUS_TO_STAGE_KEY,
  WorkflowStageDefinition,
  WorkflowStageKey,
} from "./workflowStages";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

type TransitionContext = {
  assessmentId: string;
  workspaceId: string;
  userId: string;
  access: UserAccessContext;
  action: WorkflowTransitionAction;
  comment?: string;
};

export async function getWorkspaceWorkflowStages(
  workspaceId: string
): Promise<WorkflowStageDefinition[]> {
  const config = await prisma.workspaceWorkflowConfig.findUnique({
    where: { workspaceId },
  });

  if (!config?.stages) return DEFAULT_WORKFLOW_STAGES;

  const stages = config.stages as WorkflowStageDefinition[];
  if (!Array.isArray(stages) || stages.length === 0) {
    return DEFAULT_WORKFLOW_STAGES;
  }

  return stages.sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function saveWorkspaceWorkflowConfig(
  workspaceId: string,
  stages: WorkflowStageDefinition[]
) {
  const sorted = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  return prisma.workspaceWorkflowConfig.upsert({
    where: { workspaceId },
    create: { workspaceId, stages: sorted },
    update: { stages: sorted },
  });
}

function mapActionToModerationAction(
  action: WorkflowTransitionAction,
  fromKey: WorkflowStageKey,
  toKey: WorkflowStageKey
): ModerationAction {
  if (action === "SUBMIT") {
    if (toKey === "under_review") return ModerationAction.SUBMIT_TO_HOD;
    if (toKey === "moderation") return ModerationAction.SUBMIT_TO_MODERATOR;
    if (toKey === "approved") return ModerationAction.SUBMIT_TO_EXAM_BODY;
    return ModerationAction.SUBMIT_TO_HOD;
  }
  if (action === "APPROVE") return ModerationAction.APPROVE;
  if (action === "RETURN") return ModerationAction.RETURN_TO_TEACHER;
  if (action === "PUBLISH") return ModerationAction.PUBLISH;
  return ModerationAction.ARCHIVE;
}

function assertCanPerformAction(
  access: UserAccessContext,
  workspaceId: string,
  stage: WorkflowStageDefinition,
  action: WorkflowTransitionAction
) {
  if (!hasPermission(access, workspaceId, P.WORKFLOW_TRANSITION)) {
    if (action === "SUBMIT") {
      if (!hasPermission(access, workspaceId, P.ASSESSMENTS_SUBMIT)) {
        throw new WorkflowError("Insufficient permissions for workflow transition", 403);
      }
    } else if (action === "APPROVE" || action === "RETURN") {
      if (!hasPermission(access, workspaceId, P.MODERATION_APPROVE)) {
        throw new WorkflowError("Insufficient permissions for moderation action", 403);
      }
    } else if (action === "PUBLISH") {
      if (!hasPermission(access, workspaceId, P.RESULTS_PUBLISH)) {
        throw new WorkflowError("Insufficient permissions to publish", 403);
      }
    } else {
      throw new WorkflowError("Insufficient permissions for workflow transition", 403);
    }
  }

  const actionKey = action.toLowerCase() as WorkflowStageDefinition["allowedActions"][number];
  if (!stage.allowedActions.includes(actionKey)) {
    throw new WorkflowError(
      `Action '${action}' is not allowed in stage '${stage.label}'`,
      400
    );
  }

  if (
    stage.responsibleRoles.length > 0 &&
    !hasAnyRole(access, workspaceId, stage.responsibleRoles)
  ) {
    const isSubmitFromDraft = action === "SUBMIT" && stage.key === "draft";
    if (!isSubmitFromDraft) {
      throw new WorkflowError(
        `Your roles cannot perform this action in stage '${stage.label}'`,
        403
      );
    }
  }
}

export async function executeWorkflowTransition(ctx: TransitionContext) {
  const stages = await getWorkspaceWorkflowStages(ctx.workspaceId);

  const assessment = await prisma.assessment.findFirst({
    where: { id: ctx.assessmentId, workspaceId: ctx.workspaceId },
  });

  if (!assessment) {
    throw new WorkflowError("Assessment not found", 404);
  }

  const currentStage = getStageForStatus(assessment.status, stages);
  if (!currentStage) {
    throw new WorkflowError(`No workflow stage for status ${assessment.status}`, 400);
  }

  assertCanPerformAction(ctx.access, ctx.workspaceId, currentStage, ctx.action);

  let targetStage: WorkflowStageDefinition | undefined;
  const fromStatus = assessment.status;

  switch (ctx.action) {
    case "SUBMIT":
      targetStage = getNextStage(currentStage.key, stages);
      break;
    case "APPROVE":
      targetStage = getNextStage(currentStage.key, stages);
      break;
    case "RETURN":
      targetStage = getPreviousStage(currentStage.key, stages) ?? stages[0];
      if (!ctx.comment?.trim()) {
        throw new WorkflowError("A comment is required when returning an assessment", 400);
      }
      break;
    case "PUBLISH":
      targetStage = stages.find((s) => s.key === "published");
      break;
    case "ARCHIVE":
      targetStage = stages.find((s) => s.key === "archived");
      break;
  }

  if (!targetStage) {
    throw new WorkflowError("No valid target stage for this transition", 400);
  }

  const toStatus = targetStage.mappedStatus;
  const moderationAction = mapActionToModerationAction(
    ctx.action,
    currentStage.key,
    targetStage.key
  );

  const [updated, audit] = await prisma.$transaction([
    prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        status: toStatus,
        ...(toStatus === AssessmentStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
      },
    }),
    prisma.assessmentModerationAudit.create({
      data: {
        assessmentId: assessment.id,
        action: moderationAction,
        fromStatus,
        toStatus,
        performedById: ctx.userId,
        comment: ctx.comment?.trim() || null,
      },
    }),
  ]);

  return {
    assessment: updated,
    audit,
    workflow: {
      fromStage: currentStage,
      toStage: targetStage,
      action: ctx.action,
    },
  };
}

export async function getAssessmentWorkflowState(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new WorkflowError("Assessment not found", 404);
  }

  const stages = await getWorkspaceWorkflowStages(workspaceId);
  const currentStage = getStageForStatus(assessment.status, stages);
  const nextStage = currentStage ? getNextStage(currentStage.key, stages) : undefined;

  const audits = await prisma.assessmentModerationAudit.findMany({
    where: { assessmentId },
    include: { performedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return {
    assessmentId,
    currentStatus: assessment.status,
    currentStage,
    nextStage,
    stages,
    availableActions: currentStage?.allowedActions ?? [],
    auditTrail: audits,
  };
}

export function resolveStageLabel(status: AssessmentStatus): string {
  const key = STATUS_TO_STAGE_KEY[status];
  const stage = DEFAULT_WORKFLOW_STAGES.find((s) => s.key === key);
  return stage?.label ?? status.replaceAll("_", " ");
}
