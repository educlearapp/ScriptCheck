import { AssessmentStatus, AssessmentType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { WorkspaceRole } from "@prisma/client";
import { hasBroadResultsAccess } from "./assessmentResults";

export type ScheduleEventType =
  | "ASSESSMENT"
  | "EXAMINATION"
  | "MODERATION_DEADLINE"
  | "MARKING_DEADLINE";

export type ScheduleEvent = {
  id: string;
  type: ScheduleEventType;
  title: string;
  date: string;
  assessmentId: string;
  assessmentType: AssessmentType;
  status: AssessmentStatus;
  subject: { id: string; name: string };
  grade: { id: string; name: string };
  creatorTeacher: { id: string; fullName: string };
  dueDate: string | null;
  markingDeadline: string | null;
  moderationDeadline: string | null;
};

function classifyEventType(assessmentType: AssessmentType): ScheduleEventType {
  if (assessmentType === AssessmentType.EXAM) return "EXAMINATION";
  return "ASSESSMENT";
}

function teacherScopeWhere(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
): Prisma.AssessmentWhereInput {
  if (hasBroadResultsAccess(access, workspaceId)) {
    return { workspaceId };
  }
  return { workspaceId, creatorTeacherId: userId };
}

export type ScheduleScope = "teacher" | "hod" | "school";

export function resolveScheduleScope(
  access: UserAccessContext,
  workspaceId: string
): ScheduleScope {
  if (
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  ) {
    return "school";
  }
  if (hasBroadResultsAccess(access, workspaceId)) {
    return "hod";
  }
  return "teacher";
}

export async function getAssessmentSchedule(
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  rangeStart: Date,
  rangeEnd: Date
) {
  const scope = resolveScheduleScope(access, workspaceId);
  const where = teacherScopeWhere(workspaceId, userId, access);

  const assessments = await prisma.assessment.findMany({
    where: {
      ...where,
      OR: [
        { assessmentDate: { gte: rangeStart, lte: rangeEnd } },
        { dueDate: { gte: rangeStart, lte: rangeEnd } },
        { markingDeadline: { gte: rangeStart, lte: rangeEnd } },
        { moderationDeadline: { gte: rangeStart, lte: rangeEnd } },
      ],
    },
    include: {
      subject: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
      creatorTeacher: { select: { id: true, fullName: true } },
    },
    orderBy: { assessmentDate: "asc" },
  });

  const events: ScheduleEvent[] = [];

  for (const assessment of assessments) {
    const base = {
      assessmentId: assessment.id,
      title: assessment.title,
      assessmentType: assessment.assessmentType,
      status: assessment.status,
      subject: assessment.subject,
      grade: assessment.grade,
      creatorTeacher: assessment.creatorTeacher,
      dueDate: assessment.dueDate?.toISOString() ?? null,
      markingDeadline: assessment.markingDeadline?.toISOString() ?? null,
      moderationDeadline: assessment.moderationDeadline?.toISOString() ?? null,
    };

    if (assessment.assessmentDate) {
      events.push({
        id: `${assessment.id}-assessment`,
        type: classifyEventType(assessment.assessmentType),
        date: assessment.assessmentDate.toISOString(),
        ...base,
      });
    }

    if (assessment.dueDate) {
      events.push({
        id: `${assessment.id}-due`,
        type: "ASSESSMENT",
        date: assessment.dueDate.toISOString(),
        ...base,
        title: `${assessment.title} (due)`,
      });
    }

    if (assessment.markingDeadline && scope !== "teacher") {
      events.push({
        id: `${assessment.id}-marking`,
        type: "MARKING_DEADLINE",
        date: assessment.markingDeadline.toISOString(),
        ...base,
        title: `${assessment.title} (marking deadline)`,
      });
    }

    if (assessment.moderationDeadline) {
      events.push({
        id: `${assessment.id}-moderation`,
        type: "MODERATION_DEADLINE",
        date: assessment.moderationDeadline.toISOString(),
        ...base,
        title: `${assessment.title} (moderation deadline)`,
      });
    }
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    scope,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    events,
  };
}
