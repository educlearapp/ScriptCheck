import { ExaminationOpsSessionStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { ExaminationError } from "./examinationErrors";

export async function listInvigilatorAssignments(workspaceId: string, userId?: string) {
  const rows = await prisma.invigilatorAssignment.findMany({
    where: {
      workspaceId,
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      session: {
        select: {
          id: true,
          title: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          durationMinutes: true,
        },
      },
      venue: { select: { id: true, name: true } },
    },
    orderBy: { assignedAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    user: r.user,
    session: {
      ...r.session,
      scheduledStart: r.session.scheduledStart.toISOString(),
      scheduledEnd: r.session.scheduledEnd.toISOString(),
    },
    venue: r.venue,
    isLead: r.isLead,
    assignedAt: r.assignedAt.toISOString(),
  }));
}

export async function checkInvigilatorConflicts(
  workspaceId: string,
  userId: string,
  sessionId: string
) {
  const target = await prisma.examinationOpsSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!target) throw new ExaminationError("Session not found", 404);

  const conflicts = await prisma.invigilatorAssignment.findMany({
    where: {
      workspaceId,
      userId,
      sessionId: { not: sessionId },
      session: {
        scheduledStart: { lt: target.scheduledEnd },
        scheduledEnd: { gt: target.scheduledStart },
      },
    },
    include: {
      session: { select: { id: true, title: true, scheduledStart: true, scheduledEnd: true } },
    },
  });

  return conflicts.map((c) => ({
    assignmentId: c.id,
    sessionId: c.session.id,
    title: c.session.title,
    scheduledStart: c.session.scheduledStart.toISOString(),
    scheduledEnd: c.session.scheduledEnd.toISOString(),
  }));
}

export async function assignInvigilator(
  workspaceId: string,
  actorId: string,
  input: { sessionId: string; userId: string; venueId?: string; isLead?: boolean }
) {
  const conflicts = await checkInvigilatorConflicts(workspaceId, input.userId, input.sessionId);

  const row = await prisma.invigilatorAssignment.create({
    data: {
      workspaceId,
      sessionId: input.sessionId,
      userId: input.userId,
      venueId: input.venueId ?? null,
      isLead: input.isLead ?? false,
      assignedById: actorId,
    },
    include: {
      user: { select: { id: true, fullName: true } },
      session: { select: { id: true, title: true } },
    },
  });

  await logAudit({
    action: "INVIGILATOR_ASSIGNED",
    workspaceId,
    actorId,
    metadata: {
      assignmentId: row.id,
      sessionId: input.sessionId,
      userId: input.userId,
      conflictCount: conflicts.length,
    },
  });

  return { assignment: row, conflicts };
}

export async function getInvigilatorWorkload(workspaceId: string) {
  const assignments = await prisma.invigilatorAssignment.groupBy({
    by: ["userId"],
    where: { workspaceId },
    _count: { id: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: assignments.map((a) => a.userId) } },
    select: { id: true, fullName: true, email: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return assignments
    .map((a) => ({
      userId: a.userId,
      user: userMap.get(a.userId),
      assignmentCount: a._count.id,
    }))
    .sort((a, b) => b.assignmentCount - a.assignmentCount);
}

export async function getCoverageReport(workspaceId: string) {
  const [sessions, assignments] = await Promise.all([
    prisma.examinationOpsSession.findMany({
      where: {
        workspaceId,
        status: {
          notIn: [ExaminationOpsSessionStatus.ARCHIVED, ExaminationOpsSessionStatus.COMPLETED],
        },
      },
      select: { id: true, title: true, scheduledStart: true },
    }),
    prisma.invigilatorAssignment.groupBy({
      by: ["sessionId"],
      where: { workspaceId },
      _count: { id: true },
    }),
  ]);

  const assignmentMap = new Map(assignments.map((a) => [a.sessionId, a._count.id]));

  return {
    totalSessions: sessions.length,
    covered: sessions.filter((s) => (assignmentMap.get(s.id) ?? 0) > 0).length,
    uncovered: sessions
      .filter((s) => (assignmentMap.get(s.id) ?? 0) === 0)
      .map((s) => ({
        id: s.id,
        title: s.title,
        scheduledStart: s.scheduledStart.toISOString(),
      })),
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledStart: s.scheduledStart.toISOString(),
      invigilatorCount: assignmentMap.get(s.id) ?? 0,
    })),
  };
}
