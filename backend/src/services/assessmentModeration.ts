import {
  AssessmentStatus,
  ModerationAction,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  hasPermission,
  hasRole,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { WorkspaceRole } from "@prisma/client";

export class ModerationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ModerationError";
  }
}

const TEACHER_SUBMIT_FROM: AssessmentStatus[] = [
  AssessmentStatus.DRAFT,
  AssessmentStatus.RETURNED_TO_TEACHER,
];

const HOD_REVIEW_FROM: AssessmentStatus[] = [
  AssessmentStatus.SUBMITTED_TO_HOD,
  AssessmentStatus.HOD_REVIEW,
];

type TransitionContext = {
  assessmentId: string;
  workspaceId: string;
  userId: string;
  access: UserAccessContext;
  comment?: string;
};

async function loadAssessment(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new ModerationError("Assessment not found", 404);
  }

  return assessment;
}

function assertFromStatus(
  current: AssessmentStatus,
  allowed: AssessmentStatus[],
  message: string
) {
  if (!allowed.includes(current)) {
    throw new ModerationError(message, 400);
  }
}

async function performerSelect(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMembership.findFirst({
    where: { userId, workspaceId, isActive: true },
    include: { roles: true },
  });

  return {
    id: userId,
    fullName: (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      })
    )?.fullName ?? "",
    roles: membership?.roles.map((r) => r.role) ?? [],
  };
}

export async function submitAssessmentToHod(ctx: TransitionContext) {
  if (
    !hasPermission(ctx.access, ctx.workspaceId, PERMISSIONS.ASSESSMENTS_SUBMIT)
  ) {
    throw new ModerationError(
      "Only teaching staff can submit assessments to DH",
      403
    );
  }

  const assessment = await loadAssessment(ctx.assessmentId, ctx.workspaceId);
  assertFromStatus(
    assessment.status,
    TEACHER_SUBMIT_FROM,
    "Assessment can only be submitted from DRAFT or RETURNED_TO_TEACHER"
  );

  const isTeacherOnly =
    hasRole(ctx.access, ctx.workspaceId, WorkspaceRole.TEACHER) &&
    !hasPermission(ctx.access, ctx.workspaceId, PERMISSIONS.ASSESSMENTS_EDIT);

  if (isTeacherOnly && assessment.creatorTeacherId !== ctx.userId) {
    throw new ModerationError(
      "Teachers can only submit assessments they created",
      403
    );
  }

  const fromStatus = assessment.status;
  const toStatus = AssessmentStatus.SUBMITTED_TO_HOD;

  const [updated, audit] = await prisma.$transaction([
    prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: toStatus },
    }),
    prisma.assessmentModerationAudit.create({
      data: {
        assessmentId: assessment.id,
        action: ModerationAction.SUBMIT_TO_HOD,
        fromStatus,
        toStatus,
        performedById: ctx.userId,
        comment: ctx.comment?.trim() || null,
      },
    }),
  ]);

  const performedBy = await performerSelect(ctx.userId, ctx.workspaceId);

  return {
    assessment: updated,
    audit: { ...audit, performedBy },
  };
}

export async function approveAssessment(ctx: TransitionContext) {
  if (
    !hasPermission(ctx.access, ctx.workspaceId, PERMISSIONS.MODERATION_APPROVE)
  ) {
    throw new ModerationError(
      "Only DH or management roles can approve assessments",
      403
    );
  }

  const assessment = await loadAssessment(ctx.assessmentId, ctx.workspaceId);
  assertFromStatus(
    assessment.status,
    HOD_REVIEW_FROM,
    "Assessment can only be approved from SUBMITTED_TO_HOD or HOD_REVIEW"
  );

  const fromStatus = assessment.status;
  const toStatus = AssessmentStatus.APPROVED;

  const [updated, audit] = await prisma.$transaction([
    prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: toStatus },
    }),
    prisma.assessmentModerationAudit.create({
      data: {
        assessmentId: assessment.id,
        action: ModerationAction.APPROVE,
        fromStatus,
        toStatus,
        performedById: ctx.userId,
        comment: ctx.comment?.trim() || null,
      },
    }),
  ]);

  const performedBy = await performerSelect(ctx.userId, ctx.workspaceId);

  return {
    assessment: updated,
    audit: { ...audit, performedBy },
  };
}

export async function returnAssessmentToTeacher(ctx: TransitionContext) {
  if (
    !hasPermission(ctx.access, ctx.workspaceId, PERMISSIONS.MODERATION_RETURN)
  ) {
    throw new ModerationError(
      "Only DH or management roles can return assessments",
      403
    );
  }

  const comment = ctx.comment?.trim();
  if (!comment) {
    throw new ModerationError("A comment is required when returning an assessment", 400);
  }

  const assessment = await loadAssessment(ctx.assessmentId, ctx.workspaceId);
  assertFromStatus(
    assessment.status,
    HOD_REVIEW_FROM,
    "Assessment can only be returned from SUBMITTED_TO_HOD or HOD_REVIEW"
  );

  const fromStatus = assessment.status;
  const toStatus = AssessmentStatus.RETURNED_TO_TEACHER;

  const [updated, audit] = await prisma.$transaction([
    prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: toStatus },
    }),
    prisma.assessmentModerationAudit.create({
      data: {
        assessmentId: assessment.id,
        action: ModerationAction.RETURN_TO_TEACHER,
        fromStatus,
        toStatus,
        performedById: ctx.userId,
        comment,
      },
    }),
  ]);

  const performedBy = await performerSelect(ctx.userId, ctx.workspaceId);

  return {
    assessment: updated,
    audit: { ...audit, performedBy },
  };
}

export async function listModerationQueue(workspaceId: string) {
  return prisma.assessment.findMany({
    where: {
      workspaceId,
      status: {
        in: [AssessmentStatus.SUBMITTED_TO_HOD, AssessmentStatus.HOD_REVIEW],
      },
    },
    include: {
      curriculum: { select: { id: true, code: true, name: true } },
      phase: { select: { id: true, code: true, name: true } },
      grade: { select: { id: true, code: true, name: true } },
      subject: { select: { id: true, code: true, name: true, category: true } },
      creatorTeacher: { select: { id: true, fullName: true } },
      assignedUser: { select: { id: true, fullName: true } },
    },
    orderBy: { updatedAt: "asc" },
  });
}

export async function listModerationAudit(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await loadAssessment(assessmentId, workspaceId);

  const audits = await prisma.assessmentModerationAudit.findMany({
    where: { assessmentId: assessment.id },
    include: {
      performedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const enriched = await Promise.all(
    audits.map(async (audit) => ({
      ...audit,
      performedBy: {
        ...audit.performedBy,
        roles: (
          await prisma.workspaceMembership.findFirst({
            where: {
              userId: audit.performedById,
              workspaceId,
              isActive: true,
            },
            include: { roles: true },
          })
        )?.roles.map((r) => r.role) ?? [],
      },
    }))
  );

  return enriched;
}
