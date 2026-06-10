import { AtRiskReason, InterventionStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";

export class InterventionError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "InterventionError";
  }
}

const interventionInclude = {
  learner: {
    select: {
      id: true,
      learnerNumber: true,
      firstName: true,
      lastName: true,
      className: true,
      grade: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.LearnerInterventionInclude;

type InterventionRow = Prisma.LearnerInterventionGetPayload<{
  include: typeof interventionInclude;
}>;

function serialize(row: InterventionRow) {
  return {
    id: row.id,
    learnerId: row.learnerId,
    learner: {
      id: row.learner.id,
      learnerNumber: row.learner.learnerNumber,
      learnerName: `${row.learner.firstName} ${row.learner.lastName}`.trim(),
      className: row.learner.className,
      grade: row.learner.grade,
    },
    riskReason: row.riskReason,
    dateFlagged: row.dateFlagged.toISOString(),
    teacherNotes: row.teacherNotes,
    parentMeetingDate: row.parentMeetingDate?.toISOString() ?? null,
    interventionNotes: row.interventionNotes,
    reviewDate: row.reviewDate?.toISOString() ?? null,
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listInterventions(
  workspaceId: string,
  filters?: { status?: InterventionStatus; learnerId?: string }
) {
  const rows = await prisma.learnerIntervention.findMany({
    where: {
      workspaceId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.learnerId ? { learnerId: filters.learnerId } : {}),
    },
    include: interventionInclude,
    orderBy: [{ status: "asc" }, { dateFlagged: "desc" }],
  });
  return rows.map(serialize);
}

export async function getIntervention(workspaceId: string, id: string) {
  const row = await prisma.learnerIntervention.findFirst({
    where: { id, workspaceId },
    include: interventionInclude,
  });
  if (!row) throw new InterventionError("Intervention not found", 404);
  return serialize(row);
}

export type CreateInterventionInput = {
  learnerId: string;
  riskReason: AtRiskReason;
  dateFlagged?: string;
  teacherNotes?: string;
  parentMeetingDate?: string;
  interventionNotes?: string;
  reviewDate?: string;
  status?: InterventionStatus;
};

export async function createIntervention(
  workspaceId: string,
  actorId: string,
  input: CreateInterventionInput
) {
  const learner = await prisma.learner.findFirst({
    where: { id: input.learnerId, workspaceId },
  });
  if (!learner) throw new InterventionError("Learner not found", 404);

  const row = await prisma.learnerIntervention.create({
    data: {
      workspaceId,
      learnerId: input.learnerId,
      riskReason: input.riskReason,
      dateFlagged: input.dateFlagged ? new Date(input.dateFlagged) : new Date(),
      teacherNotes: input.teacherNotes ?? null,
      parentMeetingDate: input.parentMeetingDate ? new Date(input.parentMeetingDate) : null,
      interventionNotes: input.interventionNotes ?? null,
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      status: input.status ?? InterventionStatus.OPEN,
      createdById: actorId,
    },
    include: interventionInclude,
  });

  await logAudit({
    action: "INTERVENTION_CREATED",
    workspaceId,
    actorId,
    metadata: { interventionId: row.id, learnerId: row.learnerId, status: row.status },
  });

  return serialize(row);
}

export type UpdateInterventionInput = Partial<{
  teacherNotes: string | null;
  parentMeetingDate: string | null;
  interventionNotes: string | null;
  reviewDate: string | null;
  status: InterventionStatus;
}>;

export async function updateIntervention(
  workspaceId: string,
  id: string,
  actorId: string,
  input: UpdateInterventionInput
) {
  const existing = await prisma.learnerIntervention.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) throw new InterventionError("Intervention not found", 404);

  const row = await prisma.learnerIntervention.update({
    where: { id },
    data: {
      ...(input.teacherNotes !== undefined ? { teacherNotes: input.teacherNotes } : {}),
      ...(input.parentMeetingDate !== undefined
        ? { parentMeetingDate: input.parentMeetingDate ? new Date(input.parentMeetingDate) : null }
        : {}),
      ...(input.interventionNotes !== undefined ? { interventionNotes: input.interventionNotes } : {}),
      ...(input.reviewDate !== undefined
        ? { reviewDate: input.reviewDate ? new Date(input.reviewDate) : null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedById: actorId,
    },
    include: interventionInclude,
  });

  await logAudit({
    action: "INTERVENTION_UPDATED",
    workspaceId,
    actorId,
    metadata: { interventionId: row.id, learnerId: row.learnerId, status: row.status },
  });

  return serialize(row);
}
