import {
  ApprovalRequestStatus,
  ModerationCommentType,
  WorkspaceRole,
} from "@prisma/client";
import { prisma } from "../../prisma";
import { logAudit } from "../auditLog";

export class ModerationTrailError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ModerationTrailError";
  }
}

export async function addModerationComment(input: {
  assessmentId: string;
  workspaceId: string;
  authorId: string;
  body: string;
  type?: ModerationCommentType;
  parentId?: string;
}) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: input.assessmentId, workspaceId: input.workspaceId },
  });

  if (!assessment) {
    throw new ModerationTrailError("Assessment not found", 404);
  }

  const comment = await prisma.moderationComment.create({
    data: {
      assessmentId: input.assessmentId,
      authorId: input.authorId,
      body: input.body.trim(),
      type: input.type ?? ModerationCommentType.COMMENT,
      parentId: input.parentId ?? null,
    },
    include: {
      author: { select: { id: true, fullName: true } },
    },
  });

  await logAudit({
    action: "MODERATION_COMMENT_ADDED",
    workspaceId: input.workspaceId,
    actorId: input.authorId,
    metadata: { assessmentId: input.assessmentId, commentId: comment.id },
  });

  return comment;
}

export async function listModerationComments(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new ModerationTrailError("Assessment not found", 404);
  }

  return prisma.moderationComment.findMany({
    where: { assessmentId, parentId: null },
    include: {
      author: { select: { id: true, fullName: true } },
      replies: {
        include: { author: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveModerationComment(
  commentId: string,
  workspaceId: string
) {
  const comment = await prisma.moderationComment.findFirst({
    where: { id: commentId, assessment: { workspaceId } },
  });

  if (!comment) {
    throw new ModerationTrailError("Comment not found", 404);
  }

  return prisma.moderationComment.update({
    where: { id: commentId },
    data: { resolved: true },
  });
}

export async function createApprovalRequest(input: {
  assessmentId: string;
  workspaceId: string;
  requestedById: string;
  assignedRole: WorkspaceRole;
  comment?: string;
}) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: input.assessmentId, workspaceId: input.workspaceId },
  });

  if (!assessment) {
    throw new ModerationTrailError("Assessment not found", 404);
  }

  const request = await prisma.moderationApprovalRequest.create({
    data: {
      assessmentId: input.assessmentId,
      requestedById: input.requestedById,
      assignedRole: input.assignedRole,
      comment: input.comment?.trim() || null,
    },
    include: {
      requestedBy: { select: { id: true, fullName: true } },
    },
  });

  await logAudit({
    action: "MODERATION_APPROVAL_REQUESTED",
    workspaceId: input.workspaceId,
    actorId: input.requestedById,
    metadata: {
      assessmentId: input.assessmentId,
      requestId: request.id,
      assignedRole: input.assignedRole,
    },
  });

  return request;
}

export async function respondToApprovalRequest(input: {
  requestId: string;
  workspaceId: string;
  respondedById: string;
  status: "APPROVED" | "REJECTED";
  comment?: string;
}) {
  const request = await prisma.moderationApprovalRequest.findFirst({
    where: {
      id: input.requestId,
      assessment: { workspaceId: input.workspaceId },
      status: ApprovalRequestStatus.PENDING,
    },
  });

  if (!request) {
    throw new ModerationTrailError("Pending approval request not found", 404);
  }

  const status =
    input.status === "APPROVED"
      ? ApprovalRequestStatus.APPROVED
      : ApprovalRequestStatus.REJECTED;

  const updated = await prisma.moderationApprovalRequest.update({
    where: { id: request.id },
    data: {
      status,
      respondedById: input.respondedById,
      respondedAt: new Date(),
      comment: input.comment?.trim() || request.comment,
    },
    include: {
      requestedBy: { select: { id: true, fullName: true } },
      respondedBy: { select: { id: true, fullName: true } },
    },
  });

  await logAudit({
    action: "MODERATION_APPROVAL_RESPONDED",
    workspaceId: input.workspaceId,
    actorId: input.respondedById,
    metadata: {
      requestId: request.id,
      assessmentId: request.assessmentId,
      status: input.status,
    },
  });

  return updated;
}

export async function listApprovalRequests(
  workspaceId: string,
  options?: {
    status?: ApprovalRequestStatus | "all";
    assignedRole?: WorkspaceRole;
    limit?: number;
  }
) {
  const status =
    options?.status && options.status !== "all" ? options.status : undefined;

  return prisma.moderationApprovalRequest.findMany({
    where: {
      assessment: { workspaceId },
      ...(status ? { status } : {}),
      ...(options?.assignedRole ? { assignedRole: options.assignedRole } : {}),
    },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          subject: { select: { name: true } },
        },
      },
      requestedBy: { select: { id: true, fullName: true } },
      respondedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}

export async function getModerationTrail(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new ModerationTrailError("Assessment not found", 404);
  }

  const [comments, approvalRequests, auditTrail] = await Promise.all([
    listModerationComments(assessmentId, workspaceId),
    prisma.moderationApprovalRequest.findMany({
      where: { assessmentId },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        respondedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.assessmentModerationAudit.findMany({
      where: { assessmentId },
      include: { performedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    assessmentId,
    comments,
    approvalRequests,
    auditTrail,
  };
}
