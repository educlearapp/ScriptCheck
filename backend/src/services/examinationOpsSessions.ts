import { ExaminationOpsSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { ExaminationError } from "./examinationErrors";

const sessionInclude = {
  venue: { select: { id: true, name: true, location: true, capacity: true } },
  grade: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  assessment: { select: { id: true, title: true } },
  slot: { select: { id: true, title: true, startTime: true, endTime: true } },
  invigilatorAssignments: {
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  },
} satisfies Prisma.ExaminationOpsSessionInclude;

type SessionRow = Prisma.ExaminationOpsSessionGetPayload<{ include: typeof sessionInclude }>;

function serializeSession(session: SessionRow) {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    scheduledStart: session.scheduledStart.toISOString(),
    scheduledEnd: session.scheduledEnd.toISOString(),
    actualStart: session.actualStart?.toISOString() ?? null,
    actualEnd: session.actualEnd?.toISOString() ?? null,
    durationMinutes: session.durationMinutes,
    learnerCount: session.learnerCount,
    notes: session.notes,
    venue: session.venue,
    grade: session.grade,
    subject: session.subject,
    assessment: session.assessment,
    slot: session.slot,
    invigilators: session.invigilatorAssignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      fullName: a.user.fullName,
      isLead: a.isLead,
      assignedAt: a.assignedAt.toISOString(),
    })),
  };
}

export async function listOpsSessions(
  workspaceId: string,
  filters?: { status?: ExaminationOpsSessionStatus }
) {
  const sessions = await prisma.examinationOpsSession.findMany({
    where: {
      workspaceId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: sessionInclude,
    orderBy: { scheduledStart: "asc" },
  });
  return sessions.map(serializeSession);
}

export async function createOpsSession(
  workspaceId: string,
  actorId: string,
  input: {
    slotId?: string;
    title: string;
    gradeId?: string;
    subjectId?: string;
    assessmentId?: string;
    venueId?: string;
    scheduledStart: string;
    scheduledEnd: string;
    durationMinutes: number;
    learnerCount?: number;
    notes?: string;
  }
) {
  const session = await prisma.examinationOpsSession.create({
    data: {
      workspaceId,
      slotId: input.slotId ?? null,
      title: input.title,
      gradeId: input.gradeId ?? null,
      subjectId: input.subjectId ?? null,
      assessmentId: input.assessmentId ?? null,
      venueId: input.venueId ?? null,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: new Date(input.scheduledEnd),
      durationMinutes: input.durationMinutes,
      learnerCount: input.learnerCount ?? 0,
      notes: input.notes ?? null,
      status: ExaminationOpsSessionStatus.SCHEDULED,
      createdById: actorId,
    },
    include: sessionInclude,
  });

  await logAudit({
    action: "EXAM_CREATED",
    workspaceId,
    actorId,
    metadata: { sessionId: session.id, title: session.title },
  });

  return serializeSession(session);
}

export async function updateOpsSessionStatus(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  status: ExaminationOpsSessionStatus
) {
  const existing = await prisma.examinationOpsSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!existing) throw new ExaminationError("Examination session not found", 404);

  const now = new Date();
  const session = await prisma.examinationOpsSession.update({
    where: { id: sessionId },
    data: {
      status,
      ...(status === ExaminationOpsSessionStatus.IN_PROGRESS && !existing.actualStart
        ? { actualStart: now }
        : {}),
      ...(status === ExaminationOpsSessionStatus.COMPLETED
        ? { actualEnd: now }
        : {}),
    },
    include: sessionInclude,
  });

  const action =
    status === ExaminationOpsSessionStatus.COMPLETED ? "EXAM_COMPLETED" : "EXAM_UPDATED";
  await logAudit({
    action,
    workspaceId,
    actorId,
    metadata: { sessionId, status },
  });

  return serializeSession(session);
}

export async function createSessionFromSlot(
  workspaceId: string,
  slotId: string,
  actorId: string
) {
  const slot = await prisma.examinationSlot.findFirst({
    where: { id: slotId, workspaceId },
  });
  if (!slot) throw new ExaminationError("Examination slot not found", 404);

  const existing = await prisma.examinationOpsSession.findUnique({ where: { slotId } });
  if (existing) throw new ExaminationError("Session already exists for this slot", 409);

  const learnerCount = slot.gradeId
    ? await prisma.learner.count({ where: { workspaceId, gradeId: slot.gradeId, active: true } })
    : 0;

  return createOpsSession(workspaceId, actorId, {
    slotId: slot.id,
    title: slot.title,
    gradeId: slot.gradeId ?? undefined,
    subjectId: slot.subjectId ?? undefined,
    assessmentId: slot.assessmentId ?? undefined,
    venueId: slot.venueId ?? undefined,
    scheduledStart: slot.startTime.toISOString(),
    scheduledEnd: slot.endTime.toISOString(),
    durationMinutes: slot.durationMinutes,
    learnerCount,
    notes: slot.notes ?? undefined,
  });
}
