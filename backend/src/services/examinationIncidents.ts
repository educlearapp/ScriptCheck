import { ExaminationIncidentStatus, ExaminationIncidentType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { ExaminationError } from "./examinationErrors";

const incidentInclude = {
  session: { select: { id: true, title: true } },
  learner: { select: { id: true, firstName: true, lastName: true, learnerNumber: true } },
  venue: { select: { id: true, name: true } },
  reportedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ExaminationIncidentInclude;

type IncidentRow = Prisma.ExaminationIncidentGetPayload<{ include: typeof incidentInclude }>;

function serialize(row: IncidentRow) {
  return {
    id: row.id,
    incidentType: row.incidentType,
    description: row.description,
    status: row.status,
    reportedAt: row.reportedAt.toISOString(),
    resolutionNotes: row.resolutionNotes,
    closedAt: row.closedAt?.toISOString() ?? null,
    session: row.session,
    learner: row.learner
      ? {
          id: row.learner.id,
          learnerName: `${row.learner.firstName} ${row.learner.lastName}`.trim(),
          learnerNumber: row.learner.learnerNumber,
        }
      : null,
    venue: row.venue,
    reportedBy: row.reportedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listIncidents(
  workspaceId: string,
  filters?: { status?: ExaminationIncidentStatus; sessionId?: string }
) {
  const rows = await prisma.examinationIncident.findMany({
    where: {
      workspaceId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
    },
    include: incidentInclude,
    orderBy: { reportedAt: "desc" },
  });
  return rows.map(serialize);
}

export async function createIncident(
  workspaceId: string,
  actorId: string,
  input: {
    sessionId?: string;
    learnerId?: string;
    venueId?: string;
    incidentType: ExaminationIncidentType;
    description: string;
  }
) {
  const row = await prisma.examinationIncident.create({
    data: {
      workspaceId,
      sessionId: input.sessionId ?? null,
      learnerId: input.learnerId ?? null,
      venueId: input.venueId ?? null,
      incidentType: input.incidentType,
      description: input.description,
      reportedById: actorId,
    },
    include: incidentInclude,
  });

  await logAudit({
    action: "EXAM_INCIDENT_CREATED",
    workspaceId,
    actorId,
    metadata: { incidentId: row.id, incidentType: row.incidentType },
  });

  return serialize(row);
}

export async function updateIncident(
  workspaceId: string,
  id: string,
  actorId: string,
  input: {
    status?: ExaminationIncidentStatus;
    resolutionNotes?: string;
  }
) {
  const existing = await prisma.examinationIncident.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new ExaminationError("Incident not found", 404);

  const row = await prisma.examinationIncident.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.resolutionNotes !== undefined ? { resolutionNotes: input.resolutionNotes } : {}),
      ...(input.status === ExaminationIncidentStatus.CLOSED ? { closedAt: new Date() } : {}),
    },
    include: incidentInclude,
  });

  return serialize(row);
}
