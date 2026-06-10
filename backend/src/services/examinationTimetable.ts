import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { ExaminationError } from "./examinationErrors";

const venueSelect = { id: true, name: true, location: true, capacity: true, rows: true, columns: true, active: true };

export async function listVenues(workspaceId: string) {
  return prisma.examVenue.findMany({
    where: { workspaceId, active: true },
    select: venueSelect,
    orderBy: { name: "asc" },
  });
}

export async function createVenue(
  workspaceId: string,
  input: { name: string; location?: string; capacity: number; rows?: number; columns?: number }
) {
  return prisma.examVenue.create({
    data: {
      workspaceId,
      name: input.name,
      location: input.location ?? null,
      capacity: input.capacity,
      rows: input.rows ?? 10,
      columns: input.columns ?? 8,
    },
    select: venueSelect,
  });
}

const slotInclude = {
  venue: { select: venueSelect },
  grade: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  assessment: { select: { id: true, title: true } },
  timetable: { select: { id: true, title: true } },
} satisfies Prisma.ExaminationSlotInclude;

type SlotRow = Prisma.ExaminationSlotGetPayload<{ include: typeof slotInclude }>;

function serializeSlot(slot: SlotRow) {
  return {
    id: slot.id,
    title: slot.title,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    durationMinutes: slot.durationMinutes,
    notes: slot.notes,
    venue: slot.venue,
    grade: slot.grade,
    subject: slot.subject,
    assessment: slot.assessment,
    timetable: slot.timetable,
  };
}

export async function detectClashes(
  workspaceId: string,
  input: {
    startTime: Date;
    endTime: Date;
    venueId?: string;
    gradeId?: string;
    excludeSlotId?: string;
  }
) {
  const clashes: Array<{ type: string; slotId: string; title: string; startTime: string; endTime: string }> = [];

  const overlapping = await prisma.examinationSlot.findMany({
    where: {
      workspaceId,
      ...(input.excludeSlotId ? { id: { not: input.excludeSlotId } } : {}),
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
    },
    select: { id: true, title: true, startTime: true, endTime: true, venueId: true, gradeId: true },
  });

  for (const slot of overlapping) {
    if (input.venueId && slot.venueId === input.venueId) {
      clashes.push({
        type: "VENUE",
        slotId: slot.id,
        title: slot.title,
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString(),
      });
    }
    if (input.gradeId && slot.gradeId === input.gradeId) {
      clashes.push({
        type: "GRADE",
        slotId: slot.id,
        title: slot.title,
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString(),
      });
    }
  }

  return clashes;
}

export async function listTimetables(workspaceId: string) {
  const rows = await prisma.examinationTimetable.findMany({
    where: { workspaceId, active: true },
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      slots: { include: slotInclude, orderBy: { startTime: "asc" } },
    },
    orderBy: { startDate: "desc" },
  });

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    grade: t.grade,
    subject: t.subject,
    slotCount: t.slots.length,
    slots: t.slots.map(serializeSlot),
  }));
}

export async function createTimetable(
  workspaceId: string,
  actorId: string,
  input: {
    title: string;
    description?: string;
    gradeId?: string;
    subjectId?: string;
    startDate: string;
    endDate: string;
  }
) {
  const row = await prisma.examinationTimetable.create({
    data: {
      workspaceId,
      title: input.title,
      description: input.description ?? null,
      gradeId: input.gradeId ?? null,
      subjectId: input.subjectId ?? null,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      createdById: actorId,
    },
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    action: "EXAM_CREATED",
    workspaceId,
    actorId,
    metadata: { timetableId: row.id, title: row.title },
  });

  return row;
}

export async function createSlot(
  workspaceId: string,
  actorId: string,
  input: {
    timetableId?: string;
    title: string;
    gradeId?: string;
    subjectId?: string;
    assessmentId?: string;
    venueId?: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes?: string;
  }
) {
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  const clashes = await detectClashes(workspaceId, {
    startTime,
    endTime,
    venueId: input.venueId,
    gradeId: input.gradeId,
  });

  const slot = await prisma.examinationSlot.create({
    data: {
      workspaceId,
      timetableId: input.timetableId ?? null,
      title: input.title,
      gradeId: input.gradeId ?? null,
      subjectId: input.subjectId ?? null,
      assessmentId: input.assessmentId ?? null,
      venueId: input.venueId ?? null,
      startTime,
      endTime,
      durationMinutes: input.durationMinutes,
      notes: input.notes ?? null,
    },
    include: slotInclude,
  });

  await logAudit({
    action: "EXAM_UPDATED",
    workspaceId,
    actorId,
    metadata: { slotId: slot.id, title: slot.title, clashCount: clashes.length },
  });

  return { slot: serializeSlot(slot), clashes };
}

export async function getTimetableCalendar(
  workspaceId: string,
  start: string,
  end: string,
  view: "daily" | "weekly" = "weekly"
) {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  const slots = await prisma.examinationSlot.findMany({
    where: {
      workspaceId,
      startTime: { gte: rangeStart },
      endTime: { lte: rangeEnd },
    },
    include: slotInclude,
    orderBy: { startTime: "asc" },
  });

  const serialized = slots.map(serializeSlot);

  if (view === "daily") {
    const byDay = new Map<string, typeof serialized>();
    for (const slot of serialized) {
      const day = slot.startTime.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(slot);
      byDay.set(day, list);
    }
    return {
      view: "daily" as const,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      days: Array.from(byDay.entries()).map(([date, items]) => ({ date, slots: items })),
      slots: serialized,
    };
  }

  const byWeek = new Map<string, typeof serialized>();
  for (const slot of serialized) {
    const d = new Date(slot.startTime);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const list = byWeek.get(key) ?? [];
    list.push(slot);
    byWeek.set(key, list);
  }

  return {
    view: "weekly" as const,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    weeks: Array.from(byWeek.entries()).map(([weekStart, items]) => ({ weekStart, slots: items })),
    slots: serialized,
  };
}

export async function listSlots(
  workspaceId: string,
  filters?: { gradeId?: string; subjectId?: string; timetableId?: string }
) {
  const slots = await prisma.examinationSlot.findMany({
    where: {
      workspaceId,
      ...(filters?.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters?.timetableId ? { timetableId: filters.timetableId } : {}),
    },
    include: slotInclude,
    orderBy: { startTime: "asc" },
  });
  return slots.map(serializeSlot);
}
