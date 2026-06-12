import { DayOfWeek, LessonTimetableStatus, PeriodType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { TimetableError } from "./timetableFoundation";
import {
  TIMETABLE_INTELLIGENCE_CONFIG,
  checkTeacherAssignmentForEntry,
  checkWorkloadForLessonEntry,
  evaluateTimetableReadiness,
  type TimetableReadinessResult,
} from "./timetableReadiness";

export type { TimetableReadinessResult };

export type ClashSeverity = "HARD" | "WARNING";

export type TimetableClash = {
  severity: ClashSeverity;
  type:
    | "TEACHER"
    | "ROOM"
    | "CLASS"
    | "DOUBLE_PERIOD"
    | "OVER_SCHEDULED"
    | "MISSING_ROOM"
    | "ROOM_CAPACITY"
    | "ROOM_TYPE_MISMATCH"
    | "TEACHER_DAILY_OVERLOAD"
    | "TEACHER_WEEKLY_OVERLOAD"
    | "TEACHER_CONSECUTIVE"
    | "TEACHER_HEAVY_DAY"
    | "TEACHER_UNEVEN_LOAD"
    | "TEACHER_FIRST_PERIOD"
    | "TEACHER_LAST_PERIOD"
    | "TEACHER_UNDERLOAD";
  dayOfWeek: DayOfWeek;
  periodId: string;
  periodLabel: string;
  entryId: string;
  conflictingEntryId: string;
  message: string;
};

export type TimetableValidationResult = {
  valid: boolean;
  hardClashes: TimetableClash[];
  warnings: TimetableClash[];
  clashCount: number;
};

export const lessonEntryInclude = {
  period: {
    select: {
      id: true,
      periodOrder: true,
      label: true,
      startTime: true,
      endTime: true,
      periodType: true,
      doublePeriodCapable: true,
    },
  },
  schoolClass: { select: { id: true, name: true, code: true, grade: true, learnerCount: true } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, fullName: true, email: true } },
  room: { select: { id: true, name: true, code: true, roomType: true, capacity: true } },
} satisfies Prisma.LessonEntryInclude;

type LessonEntryRow = Prisma.LessonEntryGetPayload<{ include: typeof lessonEntryInclude }>;

const timetableInclude = {
  template: {
    select: {
      id: true,
      name: true,
      isDefault: true,
      periods: { orderBy: { periodOrder: "asc" as const } },
    },
  },
  publishedBy: { select: { id: true, fullName: true } },
  _count: { select: { entries: true } },
} satisfies Prisma.LessonTimetableInclude;

type LessonTimetableRow = Prisma.LessonTimetableGetPayload<{ include: typeof timetableInclude }>;

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

export function parseDayOfWeek(value: unknown): DayOfWeek {
  const normalized = String(value ?? "").toUpperCase();
  if (!DAY_ORDER.includes(normalized as DayOfWeek)) {
    throw new TimetableError(`Invalid dayOfWeek: ${normalized}`);
  }
  return normalized as DayOfWeek;
}

export function serializeLessonEntry(entry: LessonEntryRow) {
  return {
    id: entry.id,
    timetableId: entry.timetableId,
    dayOfWeek: entry.dayOfWeek,
    periodId: entry.periodId,
    period: entry.period,
    schoolClassId: entry.schoolClassId,
    schoolClass: entry.schoolClass,
    subjectId: entry.subjectId,
    subject: entry.subject,
    teacherUserId: entry.teacherUserId,
    teacher: entry.teacher,
    roomId: entry.roomId,
    room: entry.room,
    isDoublePeriod: entry.isDoublePeriod,
    locked: entry.locked,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function serializeLessonTimetable(row: LessonTimetableRow) {
  return {
    id: row.id,
    title: row.title,
    academicYear: row.academicYear,
    term: row.term,
    status: row.status,
    templateId: row.templateId,
    template: row.template,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    entryCount: row._count.entries,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getLessonTimetableOrThrow(workspaceId: string, id: string) {
  const timetable = await prisma.lessonTimetable.findFirst({
    where: { id, workspaceId },
    include: timetableInclude,
  });
  if (!timetable) {
    throw new TimetableError("Lesson timetable not found", 404);
  }
  return timetable;
}

function assertDraft(status: LessonTimetableStatus) {
  if (status !== LessonTimetableStatus.DRAFT) {
    throw new TimetableError("Only draft timetables can be modified", 409);
  }
}

function assertNotLocked(entry: { locked: boolean }) {
  if (entry.locked) {
    throw new TimetableError("This lesson entry is locked", 409);
  }
}

type PeriodInfo = {
  id: string;
  periodOrder: number;
  label: string;
  periodType: PeriodType;
  doublePeriodCapable: boolean;
};

function buildPeriodMaps(periods: PeriodInfo[]) {
  const byId = new Map(periods.map((p) => [p.id, p]));
  const sorted = [...periods].sort((a, b) => a.periodOrder - b.periodOrder);
  const nextById = new Map<string, PeriodInfo | null>();
  for (let i = 0; i < sorted.length; i++) {
    nextById.set(sorted[i].id, sorted[i + 1] ?? null);
  }
  return { byId, sorted, nextById };
}

type OccupiedSlot = { dayOfWeek: DayOfWeek; periodId: string };

function getOccupiedSlots(
  entry: {
    dayOfWeek: DayOfWeek;
    periodId: string;
    isDoublePeriod: boolean;
  },
  nextById: Map<string, PeriodInfo | null>
): OccupiedSlot[] {
  const slots: OccupiedSlot[] = [{ dayOfWeek: entry.dayOfWeek, periodId: entry.periodId }];
  if (entry.isDoublePeriod) {
    const next = nextById.get(entry.periodId);
    if (next) {
      slots.push({ dayOfWeek: entry.dayOfWeek, periodId: next.id });
    }
  }
  return slots;
}

function slotKey(day: DayOfWeek, periodId: string) {
  return `${day}:${periodId}`;
}

export function detectLessonTimetableClashes(
  entries: Array<
    LessonEntryRow & {
      period: PeriodInfo;
    }
  >,
  periods: PeriodInfo[]
): TimetableValidationResult {
  const { byId, nextById } = buildPeriodMaps(periods);
  const hardClashes: TimetableClash[] = [];
  const warnings: TimetableClash[] = [];

  type SlotEntry = {
    entryId: string;
    teacherUserId: string;
    roomId: string | null;
    schoolClassId: string;
    label: string;
  };

  const teacherSlots = new Map<string, SlotEntry[]>();
  const roomSlots = new Map<string, SlotEntry[]>();
  const classSlots = new Map<string, SlotEntry[]>();

  const addToMap = (map: Map<string, SlotEntry[]>, key: string, item: SlotEntry) => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  };

  for (const entry of entries) {
    const period = byId.get(entry.periodId) ?? entry.period;
    const occupied = getOccupiedSlots(entry, nextById);
    const slotEntry: SlotEntry = {
      entryId: entry.id,
      teacherUserId: entry.teacherUserId,
      roomId: entry.roomId,
      schoolClassId: entry.schoolClassId,
      label: `${entry.schoolClass.code} ${entry.subject.code}`,
    };

    for (const slot of occupied) {
      const key = slotKey(slot.dayOfWeek, slot.periodId);
      addToMap(teacherSlots, `${key}:teacher:${entry.teacherUserId}`, slotEntry);
      if (entry.roomId) {
        addToMap(roomSlots, `${key}:room:${entry.roomId}`, slotEntry);
      }
      addToMap(classSlots, `${key}:class:${entry.schoolClassId}`, slotEntry);
    }

    if (entry.isDoublePeriod) {
      const next = nextById.get(entry.periodId);
      if (!period.doublePeriodCapable) {
        warnings.push({
          severity: "WARNING",
          type: "DOUBLE_PERIOD",
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          periodLabel: period.label,
          entryId: entry.id,
          conflictingEntryId: entry.id,
          message: `${period.label} is not marked as double-period capable`,
        });
      }
      if (!next) {
        warnings.push({
          severity: "WARNING",
          type: "DOUBLE_PERIOD",
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          periodLabel: period.label,
          entryId: entry.id,
          conflictingEntryId: entry.id,
          message: `Double period at ${period.label} has no following period`,
        });
      } else if (next.periodType === PeriodType.BREAK) {
        warnings.push({
          severity: "WARNING",
          type: "DOUBLE_PERIOD",
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          periodLabel: period.label,
          entryId: entry.id,
          conflictingEntryId: entry.id,
          message: `Double period at ${period.label} extends into break (${next.label})`,
        });
      }
    }
  }

  for (const entry of entries) {
    const occupied = getOccupiedSlots(entry, nextById);
    for (const slot of occupied) {
      const key = slotKey(slot.dayOfWeek, slot.periodId);
      const teacherKey = `${key}:teacher:${entry.teacherUserId}`;
      const roomKey = entry.roomId ? `${key}:room:${entry.roomId}` : null;
      const classKey = `${key}:class:${entry.schoolClassId}`;

      const teacherItems = teacherSlots.get(teacherKey) ?? [];
      if (teacherItems.length > 1) {
        const seen = new Set<string>();
        for (const item of teacherItems) {
          for (const other of teacherItems) {
            if (item.entryId === other.entryId) continue;
            const pairKey = [item.entryId, other.entryId].sort().join(":");
            if (seen.has(pairKey)) continue;
            seen.add(pairKey);
            const periodLabel = byId.get(slot.periodId)?.label ?? slot.periodId;
            hardClashes.push({
              severity: "HARD",
              type: "TEACHER",
              dayOfWeek: slot.dayOfWeek,
              periodId: slot.periodId,
              periodLabel,
              entryId: item.entryId,
              conflictingEntryId: other.entryId,
              message: `Teacher clash on ${slot.dayOfWeek} ${periodLabel}: ${item.label} vs ${other.label}`,
            });
          }
        }
      }

      if (roomKey) {
        const roomItems = roomSlots.get(roomKey) ?? [];
        if (roomItems.length > 1) {
          const seen = new Set<string>();
          for (const item of roomItems) {
            for (const other of roomItems) {
              if (item.entryId === other.entryId) continue;
              const pairKey = [item.entryId, other.entryId].sort().join(":");
              if (seen.has(pairKey)) continue;
              seen.add(pairKey);
              const periodLabel = byId.get(slot.periodId)?.label ?? slot.periodId;
              hardClashes.push({
                severity: "HARD",
                type: "ROOM",
                dayOfWeek: slot.dayOfWeek,
                periodId: slot.periodId,
                periodLabel,
                entryId: item.entryId,
                conflictingEntryId: other.entryId,
                message: `Room clash on ${slot.dayOfWeek} ${periodLabel}: ${item.label} vs ${other.label}`,
              });
            }
          }
        }
      }

      const classItems = classSlots.get(classKey) ?? [];
      if (classItems.length > 1) {
        const seen = new Set<string>();
        for (const item of classItems) {
          for (const other of classItems) {
            if (item.entryId === other.entryId) continue;
            const pairKey = [item.entryId, other.entryId].sort().join(":");
            if (seen.has(pairKey)) continue;
            seen.add(pairKey);
            const periodLabel = byId.get(slot.periodId)?.label ?? slot.periodId;
            hardClashes.push({
              severity: "HARD",
              type: "CLASS",
              dayOfWeek: slot.dayOfWeek,
              periodId: slot.periodId,
              periodLabel,
              entryId: item.entryId,
              conflictingEntryId: other.entryId,
              message: `Class clash on ${slot.dayOfWeek} ${periodLabel}: ${item.label} vs ${other.label}`,
            });
          }
        }
      }
    }
  }

  const dedupe = <T extends { entryId: string; conflictingEntryId: string; type: string; periodId: string; dayOfWeek: DayOfWeek }>(
    list: T[]
  ) => {
    const seen = new Set<string>();
    return list.filter((c) => {
      const ids = [c.entryId, c.conflictingEntryId].sort().join(":");
      const key = `${c.type}:${c.dayOfWeek}:${c.periodId}:${ids}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const uniqueHard = dedupe(hardClashes);
  const uniqueWarnings = dedupe(warnings);

  return {
    valid: uniqueHard.length === 0,
    hardClashes: uniqueHard,
    warnings: uniqueWarnings,
    clashCount: uniqueHard.length + uniqueWarnings.length,
  };
}

export async function validateLessonTimetable(
  workspaceId: string,
  timetableId: string
): Promise<TimetableReadinessResult> {
  const result = await evaluateTimetableReadiness(workspaceId, timetableId);
  if (!result) {
    throw new TimetableError("Lesson timetable not found", 404);
  }
  return result;
}

export async function getLessonTimetableReadiness(
  workspaceId: string,
  timetableId: string
): Promise<TimetableReadinessResult> {
  return validateLessonTimetable(workspaceId, timetableId);
}

export async function listLessonTimetables(
  workspaceId: string,
  filters?: { status?: LessonTimetableStatus }
) {
  const rows = await prisma.lessonTimetable.findMany({
    where: {
      workspaceId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: timetableInclude,
    orderBy: [{ academicYear: "desc" }, { term: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(serializeLessonTimetable);
}

export async function getLessonTimetable(workspaceId: string, id: string) {
  const timetable = await getLessonTimetableOrThrow(workspaceId, id);
  return serializeLessonTimetable(timetable);
}

export async function createLessonTimetable(
  workspaceId: string,
  input: { title: string; academicYear: string; term: string; templateId: string }
) {
  const title = input.title.trim();
  const academicYear = input.academicYear.trim();
  const term = input.term.trim();

  if (!title || !academicYear || !term || !input.templateId) {
    throw new TimetableError("title, academicYear, term, and templateId are required");
  }

  const template = await prisma.schoolDayTemplate.findFirst({
    where: { id: input.templateId, workspaceId, active: true },
  });
  if (!template) {
    throw new TimetableError("Day template not found", 404);
  }

  const row = await prisma.lessonTimetable.create({
    data: {
      workspaceId,
      title,
      academicYear,
      term,
      templateId: input.templateId,
    },
    include: timetableInclude,
  });
  return serializeLessonTimetable(row);
}

export async function updateLessonTimetable(
  workspaceId: string,
  id: string,
  input: { title?: string; academicYear?: string; term?: string; templateId?: string }
) {
  const existing = await getLessonTimetableOrThrow(workspaceId, id);
  assertDraft(existing.status);

  if (input.templateId) {
    const template = await prisma.schoolDayTemplate.findFirst({
      where: { id: input.templateId, workspaceId, active: true },
    });
    if (!template) {
      throw new TimetableError("Day template not found", 404);
    }
  }

  const row = await prisma.lessonTimetable.update({
    where: { id },
    data: {
      ...(input.title != null ? { title: input.title.trim() } : {}),
      ...(input.academicYear != null ? { academicYear: input.academicYear.trim() } : {}),
      ...(input.term != null ? { term: input.term.trim() } : {}),
      ...(input.templateId != null ? { templateId: input.templateId } : {}),
    },
    include: timetableInclude,
  });
  return serializeLessonTimetable(row);
}

export async function publishLessonTimetable(
  workspaceId: string,
  id: string,
  actorId: string
) {
  const existing = await getLessonTimetableOrThrow(workspaceId, id);
  if (existing.status !== LessonTimetableStatus.DRAFT) {
    throw new TimetableError("Only draft timetables can be published", 409);
  }

  const validation = await validateLessonTimetable(workspaceId, id);
  if (!validation.canPublish) {
    throw new TimetableError(
      `Cannot publish: ${validation.blockingReasons.join("; ")}`,
      409
    );
  }

  const row = await prisma.lessonTimetable.update({
    where: { id },
    data: {
      status: LessonTimetableStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedById: actorId,
    },
    include: timetableInclude,
  });
  return { timetable: serializeLessonTimetable(row), validation };
}

export async function archiveLessonTimetable(workspaceId: string, id: string) {
  const existing = await getLessonTimetableOrThrow(workspaceId, id);
  if (existing.status === LessonTimetableStatus.ARCHIVED) {
    throw new TimetableError("Timetable is already archived", 409);
  }

  const row = await prisma.lessonTimetable.update({
    where: { id },
    data: { status: LessonTimetableStatus.ARCHIVED },
    include: timetableInclude,
  });
  return serializeLessonTimetable(row);
}

export async function listLessonEntries(
  workspaceId: string,
  timetableId: string,
  filters?: {
    schoolClassId?: string;
    teacherUserId?: string;
    roomId?: string;
    dayOfWeek?: DayOfWeek;
  }
) {
  await getLessonTimetableOrThrow(workspaceId, timetableId);

  const entries = await prisma.lessonEntry.findMany({
    where: {
      workspaceId,
      timetableId,
      ...(filters?.schoolClassId ? { schoolClassId: filters.schoolClassId } : {}),
      ...(filters?.teacherUserId ? { teacherUserId: filters.teacherUserId } : {}),
      ...(filters?.roomId ? { roomId: filters.roomId } : {}),
      ...(filters?.dayOfWeek ? { dayOfWeek: filters.dayOfWeek } : {}),
    },
    include: lessonEntryInclude,
    orderBy: [{ dayOfWeek: "asc" }, { period: { periodOrder: "asc" } }],
  });
  return entries.map(serializeLessonEntry);
}

async function validateEntryReferences(
  workspaceId: string,
  timetableId: string,
  input: {
    periodId: string;
    schoolClassId: string;
    subjectId: string;
    teacherUserId: string;
    roomId?: string | null;
  }
) {
  const timetable = await getLessonTimetableOrThrow(workspaceId, timetableId);

  const period = await prisma.periodDefinition.findFirst({
    where: { id: input.periodId, dayTemplateId: timetable.templateId, workspaceId },
  });
  if (!period) {
    throw new TimetableError("Period not found for this timetable template", 404);
  }
  if (period.periodType === PeriodType.BREAK) {
    throw new TimetableError("Cannot schedule lessons in break periods", 400);
  }

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: input.schoolClassId, workspaceId, active: true },
  });
  if (!schoolClass) {
    throw new TimetableError("Class not found", 404);
  }

  const subject = await prisma.workspaceSubject.findFirst({
    where: { id: input.subjectId, workspaceId, archivedAt: null, active: true },
  });
  if (!subject) {
    throw new TimetableError("Subject not found", 404);
  }

  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, userId: input.teacherUserId, isActive: true },
  });
  if (!membership) {
    throw new TimetableError("Teacher is not an active workspace member", 404);
  }

  if (input.roomId) {
    const room = await prisma.timetableRoom.findFirst({
      where: { id: input.roomId, workspaceId, active: true },
    });
    if (!room) {
      throw new TimetableError("Room not found", 404);
    }
  }

  return { timetable, period };
}

export async function createLessonEntry(
  workspaceId: string,
  timetableId: string,
  input: {
    dayOfWeek: DayOfWeek;
    periodId: string;
    schoolClassId: string;
    subjectId: string;
    teacherUserId: string;
    roomId?: string | null;
    isDoublePeriod?: boolean;
    locked?: boolean;
    notes?: string | null;
  }
) {
  const { timetable } = await validateEntryReferences(workspaceId, timetableId, input);
  assertDraft(timetable.status);

  const assignmentViolation = await checkTeacherAssignmentForEntry(workspaceId, {
    teacherUserId: input.teacherUserId,
    schoolClassId: input.schoolClassId,
    subjectId: input.subjectId,
  });
  if (
    assignmentViolation &&
    TIMETABLE_INTELLIGENCE_CONFIG.teacherAssignment.draftMode === "block"
  ) {
    throw new TimetableError(assignmentViolation.message, 409);
  }

  const workloadWarnings = await checkWorkloadForLessonEntry(workspaceId, timetableId, {
    dayOfWeek: input.dayOfWeek,
    periodId: input.periodId,
    teacherUserId: input.teacherUserId,
    isDoublePeriod: input.isDoublePeriod ?? false,
  });

  const row = await prisma.lessonEntry.create({
    data: {
      workspaceId,
      timetableId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
      schoolClassId: input.schoolClassId,
      subjectId: input.subjectId,
      teacherUserId: input.teacherUserId,
      roomId: input.roomId ?? null,
      isDoublePeriod: input.isDoublePeriod ?? false,
      locked: input.locked ?? false,
      notes: input.notes?.trim() || null,
    },
    include: lessonEntryInclude,
  });
  return {
    ...serializeLessonEntry(row),
    teacherAssignmentWarning: assignmentViolation?.message ?? null,
    workloadWarnings,
  };
}

export async function updateLessonEntry(
  workspaceId: string,
  timetableId: string,
  id: string,
  input: {
    dayOfWeek?: DayOfWeek;
    periodId?: string;
    schoolClassId?: string;
    subjectId?: string;
    teacherUserId?: string;
    roomId?: string | null;
    isDoublePeriod?: boolean;
    locked?: boolean;
    notes?: string | null;
  }
) {
  const existing = await prisma.lessonEntry.findFirst({
    where: { id, timetableId, workspaceId },
    include: lessonEntryInclude,
  });
  if (!existing) {
    throw new TimetableError("Lesson entry not found", 404);
  }

  const timetable = await getLessonTimetableOrThrow(workspaceId, timetableId);
  assertDraft(timetable.status);

  if (existing.locked && input.locked !== false) {
    assertNotLocked(existing);
  }

  const nextTeacherId = input.teacherUserId ?? existing.teacherUserId;
  const nextClassId = input.schoolClassId ?? existing.schoolClassId;
  const nextSubjectId = input.subjectId ?? existing.subjectId;

  await validateEntryReferences(workspaceId, timetableId, {
    periodId: input.periodId ?? existing.periodId,
    schoolClassId: nextClassId,
    subjectId: nextSubjectId,
    teacherUserId: nextTeacherId,
    roomId: input.roomId !== undefined ? input.roomId : existing.roomId,
  });

  const assignmentViolation = await checkTeacherAssignmentForEntry(workspaceId, {
    teacherUserId: nextTeacherId,
    schoolClassId: nextClassId,
    subjectId: nextSubjectId,
  });
  if (
    assignmentViolation &&
    TIMETABLE_INTELLIGENCE_CONFIG.teacherAssignment.draftMode === "block"
  ) {
    throw new TimetableError(assignmentViolation.message, 409);
  }

  const workloadWarnings = await checkWorkloadForLessonEntry(workspaceId, timetableId, {
    dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
    periodId: input.periodId ?? existing.periodId,
    teacherUserId: nextTeacherId,
    isDoublePeriod: input.isDoublePeriod ?? existing.isDoublePeriod,
    excludeEntryId: id,
  });

  const row = await prisma.lessonEntry.update({
    where: { id },
    data: {
      ...(input.dayOfWeek != null ? { dayOfWeek: input.dayOfWeek } : {}),
      ...(input.periodId != null ? { periodId: input.periodId } : {}),
      ...(input.schoolClassId != null ? { schoolClassId: input.schoolClassId } : {}),
      ...(input.subjectId != null ? { subjectId: input.subjectId } : {}),
      ...(input.teacherUserId != null ? { teacherUserId: input.teacherUserId } : {}),
      ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
      ...(input.isDoublePeriod != null ? { isDoublePeriod: input.isDoublePeriod } : {}),
      ...(input.locked != null ? { locked: input.locked } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    },
    include: lessonEntryInclude,
  });
  return {
    ...serializeLessonEntry(row),
    teacherAssignmentWarning: assignmentViolation?.message ?? null,
    workloadWarnings,
  };
}

export async function deleteLessonEntry(
  workspaceId: string,
  timetableId: string,
  id: string
) {
  const existing = await prisma.lessonEntry.findFirst({
    where: { id, timetableId, workspaceId },
  });
  if (!existing) {
    throw new TimetableError("Lesson entry not found", 404);
  }

  const timetable = await getLessonTimetableOrThrow(workspaceId, timetableId);
  assertDraft(timetable.status);
  assertNotLocked(existing);

  await prisma.lessonEntry.delete({ where: { id } });
  return { ok: true };
}

export { DAY_ORDER };
