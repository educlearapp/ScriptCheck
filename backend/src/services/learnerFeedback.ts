import { prisma } from "../prisma";
import {
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { WorkspaceRole } from "@prisma/client";

export class FeedbackError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}

function canViewFeedback(access: UserAccessContext, workspaceId: string): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.FEEDBACK_VIEW);
}

function canCreateFeedback(access: UserAccessContext, workspaceId: string): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.FEEDBACK_CREATE);
}

function isHodOrAdmin(access: UserAccessContext, workspaceId: string): boolean {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.MODERATION_QUEUE) ||
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.HOD,
      WorkspaceRole.MODERATOR,
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  );
}

async function loadScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    select: { id: true, assessmentId: true },
  });
  if (!script) throw new FeedbackError("Learner script not found", 404);
  return script;
}

export async function listLearnerFeedback(
  scriptId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  if (!canViewFeedback(access, workspaceId)) {
    throw new FeedbackError("Insufficient permissions to view feedback", 403);
  }

  await loadScript(scriptId, workspaceId);

  const items = await prisma.learnerFeedback.findMany({
    where: { learnerScriptId: scriptId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((item) => ({
    id: item.id,
    learnerScriptId: item.learnerScriptId,
    teacherFeedback: item.teacherFeedback,
    hodFeedback: item.hodFeedback,
    interventionNotes: item.interventionNotes,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function createLearnerFeedback(
  scriptId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  body: {
    teacherFeedback?: string | null;
    improvementNotes?: string | null;
    hodFeedback?: string | null;
    interventionNotes?: string | null;
  }
) {
  if (!canCreateFeedback(access, workspaceId)) {
    throw new FeedbackError("Insufficient permissions to create feedback", 403);
  }

  await loadScript(scriptId, workspaceId);

  const hodUser = isHodOrAdmin(access, workspaceId);
  let teacherFeedback: string | null = null;
  let hodFeedback: string | null = null;
  let interventionNotes: string | null = null;

  if (hodUser && (body.hodFeedback?.trim() || body.interventionNotes?.trim())) {
    hodFeedback = body.hodFeedback?.trim() || null;
    interventionNotes = body.interventionNotes?.trim() || null;
  } else {
    const parts: string[] = [];
    if (body.teacherFeedback?.trim()) {
      parts.push(body.teacherFeedback.trim());
    }
    if (body.improvementNotes?.trim()) {
      parts.push(`Improvement notes: ${body.improvementNotes.trim()}`);
    }
    teacherFeedback = parts.join("\n\n") || null;
    if (!teacherFeedback) {
      throw new FeedbackError("Feedback or improvement notes required", 400);
    }
  }

  const item = await prisma.learnerFeedback.create({
    data: {
      learnerScriptId: scriptId,
      teacherFeedback,
      hodFeedback,
      interventionNotes,
      createdById: userId,
    },
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });

  return {
    id: item.id,
    learnerScriptId: item.learnerScriptId,
    teacherFeedback: item.teacherFeedback,
    hodFeedback: item.hodFeedback,
    interventionNotes: item.interventionNotes,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
