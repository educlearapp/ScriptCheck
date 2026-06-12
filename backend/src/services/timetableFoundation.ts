import { PeriodType, Prisma, TimetableRoomType } from "@prisma/client";
import { prisma } from "../prisma";

export class TimetableError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "TimetableError";
  }
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTime(value: string, field: string): string {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    throw new TimetableError(`${field} must be in HH:mm format`);
  }
  return trimmed;
}

function compareTimes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function parseRoomType(value: unknown): TimetableRoomType {
  const normalized = String(value ?? "CLASSROOM").toUpperCase();
  if (!Object.values(TimetableRoomType).includes(normalized as TimetableRoomType)) {
    throw new TimetableError(`Invalid room type: ${normalized}`);
  }
  return normalized as TimetableRoomType;
}

function parsePeriodType(value: unknown): PeriodType {
  const normalized = String(value ?? "TEACHING").toUpperCase();
  if (!Object.values(PeriodType).includes(normalized as PeriodType)) {
    throw new TimetableError(`Invalid period type: ${normalized}`);
  }
  return normalized as PeriodType;
}

async function ensureWorkspaceMembership(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, userId, isActive: true },
  });
  if (!membership) {
    throw new TimetableError("Teacher is not an active workspace member", 404);
  }
}

async function ensureSchoolClass(workspaceId: string, classId: string) {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, workspaceId },
  });
  if (!schoolClass) {
    throw new TimetableError("Class not found", 404);
  }
  return schoolClass;
}

async function ensureWorkspaceSubject(workspaceId: string, subjectId: string) {
  const subject = await prisma.workspaceSubject.findFirst({
    where: { id: subjectId, workspaceId, archivedAt: null },
  });
  if (!subject) {
    throw new TimetableError("Subject not found", 404);
  }
  return subject;
}

async function ensureDayTemplate(workspaceId: string, dayTemplateId: string) {
  const template = await prisma.schoolDayTemplate.findFirst({
    where: { id: dayTemplateId, workspaceId },
  });
  if (!template) {
    throw new TimetableError("Day template not found", 404);
  }
  return template;
}

// ─── School classes ───────────────────────────────────────────────────────────

export function serializeSchoolClass(row: Prisma.SchoolClassGetPayload<object>) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    grade: row.grade,
    learnerCount: row.learnerCount,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSchoolClasses(
  workspaceId: string,
  filters?: { active?: boolean; grade?: string }
) {
  const rows = await prisma.schoolClass.findMany({
    where: {
      workspaceId,
      ...(filters?.active != null ? { active: filters.active } : {}),
      ...(filters?.grade ? { grade: filters.grade } : {}),
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeSchoolClass);
}

export async function createSchoolClass(
  workspaceId: string,
  input: { name: string; code: string; grade: string; learnerCount?: number; active?: boolean }
) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const grade = input.grade.trim();

  if (!name || !code || !grade) {
    throw new TimetableError("name, code, and grade are required");
  }

  const learnerCount = input.learnerCount ?? 0;
  if (!Number.isInteger(learnerCount) || learnerCount < 0) {
    throw new TimetableError("learnerCount must be a non-negative integer");
  }

  const existing = await prisma.schoolClass.findFirst({
    where: { workspaceId, code },
  });
  if (existing) {
    throw new TimetableError("A class with this code already exists", 409);
  }

  const row = await prisma.schoolClass.create({
    data: {
      workspaceId,
      name,
      code,
      grade,
      learnerCount,
      active: input.active ?? true,
    },
  });
  return serializeSchoolClass(row);
}

export async function updateSchoolClass(
  workspaceId: string,
  id: string,
  input: {
    name?: string;
    code?: string;
    grade?: string;
    learnerCount?: number;
    active?: boolean;
  }
) {
  const existing = await prisma.schoolClass.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new TimetableError("Class not found", 404);
  }

  const code = input.code != null ? input.code.trim().toUpperCase() : undefined;
  if (code && code !== existing.code) {
    const duplicate = await prisma.schoolClass.findFirst({
      where: { workspaceId, code, NOT: { id } },
    });
    if (duplicate) {
      throw new TimetableError("A class with this code already exists", 409);
    }
  }

  if (input.learnerCount != null) {
    if (!Number.isInteger(input.learnerCount) || input.learnerCount < 0) {
      throw new TimetableError("learnerCount must be a non-negative integer");
    }
  }

  const row = await prisma.schoolClass.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(code != null ? { code } : {}),
      ...(input.grade != null ? { grade: input.grade.trim() } : {}),
      ...(input.learnerCount != null ? { learnerCount: input.learnerCount } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
  });
  return serializeSchoolClass(row);
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function serializeTimetableRoom(row: Prisma.TimetableRoomGetPayload<object>) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    roomType: row.roomType,
    capacity: row.capacity,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTimetableRooms(
  workspaceId: string,
  filters?: { active?: boolean; roomType?: TimetableRoomType }
) {
  const rows = await prisma.timetableRoom.findMany({
    where: {
      workspaceId,
      ...(filters?.active != null ? { active: filters.active } : {}),
      ...(filters?.roomType ? { roomType: filters.roomType } : {}),
    },
    orderBy: [{ name: "asc" }],
  });
  return rows.map(serializeTimetableRoom);
}

export async function createTimetableRoom(
  workspaceId: string,
  input: {
    name: string;
    code: string;
    roomType?: TimetableRoomType;
    capacity: number;
    active?: boolean;
  }
) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  if (!name || !code) {
    throw new TimetableError("name and code are required");
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new TimetableError("capacity must be a positive integer");
  }

  const existing = await prisma.timetableRoom.findFirst({
    where: { workspaceId, code },
  });
  if (existing) {
    throw new TimetableError("A room with this code already exists", 409);
  }

  const row = await prisma.timetableRoom.create({
    data: {
      workspaceId,
      name,
      code,
      roomType: input.roomType ?? TimetableRoomType.CLASSROOM,
      capacity: input.capacity,
      active: input.active ?? true,
    },
  });
  return serializeTimetableRoom(row);
}

export async function updateTimetableRoom(
  workspaceId: string,
  id: string,
  input: {
    name?: string;
    code?: string;
    roomType?: TimetableRoomType;
    capacity?: number;
    active?: boolean;
  }
) {
  const existing = await prisma.timetableRoom.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new TimetableError("Room not found", 404);
  }

  const code = input.code != null ? input.code.trim().toUpperCase() : undefined;
  if (code && code !== existing.code) {
    const duplicate = await prisma.timetableRoom.findFirst({
      where: { workspaceId, code, NOT: { id } },
    });
    if (duplicate) {
      throw new TimetableError("A room with this code already exists", 409);
    }
  }

  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    throw new TimetableError("capacity must be a positive integer");
  }

  const row = await prisma.timetableRoom.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(code != null ? { code } : {}),
      ...(input.roomType != null ? { roomType: input.roomType } : {}),
      ...(input.capacity != null ? { capacity: input.capacity } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
  });
  return serializeTimetableRoom(row);
}

// ─── Day templates & periods ──────────────────────────────────────────────────

const periodInclude = { periods: { orderBy: { periodOrder: "asc" as const } } };

type DayTemplateRow = Prisma.SchoolDayTemplateGetPayload<{ include: typeof periodInclude }>;

export function serializePeriodDefinition(row: Prisma.PeriodDefinitionGetPayload<object>) {
  return {
    id: row.id,
    dayTemplateId: row.dayTemplateId,
    periodOrder: row.periodOrder,
    label: row.label,
    startTime: row.startTime,
    endTime: row.endTime,
    periodType: row.periodType,
    doublePeriodCapable: row.doublePeriodCapable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeSchoolDayTemplate(row: DayTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    active: row.active,
    periods: row.periods.map(serializePeriodDefinition),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSchoolDayTemplates(
  workspaceId: string,
  filters?: { active?: boolean }
) {
  const rows = await prisma.schoolDayTemplate.findMany({
    where: {
      workspaceId,
      ...(filters?.active != null ? { active: filters.active } : {}),
    },
    include: periodInclude,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(serializeSchoolDayTemplate);
}

export async function createSchoolDayTemplate(
  workspaceId: string,
  input: { name: string; isDefault?: boolean; active?: boolean }
) {
  const name = input.name.trim();
  if (!name) {
    throw new TimetableError("name is required");
  }

  if (input.isDefault) {
    await prisma.schoolDayTemplate.updateMany({
      where: { workspaceId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const row = await prisma.schoolDayTemplate.create({
    data: {
      workspaceId,
      name,
      isDefault: input.isDefault ?? false,
      active: input.active ?? true,
    },
    include: periodInclude,
  });
  return serializeSchoolDayTemplate(row);
}

export async function updateSchoolDayTemplate(
  workspaceId: string,
  id: string,
  input: { name?: string; isDefault?: boolean; active?: boolean }
) {
  const existing = await prisma.schoolDayTemplate.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new TimetableError("Day template not found", 404);
  }

  if (input.isDefault) {
    await prisma.schoolDayTemplate.updateMany({
      where: { workspaceId, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const row = await prisma.schoolDayTemplate.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.isDefault != null ? { isDefault: input.isDefault } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
    include: periodInclude,
  });
  return serializeSchoolDayTemplate(row);
}

export async function createPeriodDefinition(
  workspaceId: string,
  dayTemplateId: string,
  input: {
    periodOrder: number;
    label: string;
    startTime: string;
    endTime: string;
    periodType?: PeriodType;
    doublePeriodCapable?: boolean;
  }
) {
  await ensureDayTemplate(workspaceId, dayTemplateId);

  const label = input.label.trim();
  if (!label) {
    throw new TimetableError("label is required");
  }
  if (!Number.isInteger(input.periodOrder) || input.periodOrder < 1) {
    throw new TimetableError("periodOrder must be a positive integer");
  }

  const startTime = parseTime(input.startTime, "startTime");
  const endTime = parseTime(input.endTime, "endTime");
  if (compareTimes(startTime, endTime) <= 0) {
    throw new TimetableError("endTime must be after startTime");
  }

  const row = await prisma.periodDefinition.create({
    data: {
      workspaceId,
      dayTemplateId,
      periodOrder: input.periodOrder,
      label,
      startTime,
      endTime,
      periodType: input.periodType ?? PeriodType.TEACHING,
      doublePeriodCapable: input.doublePeriodCapable ?? false,
    },
  });
  return serializePeriodDefinition(row);
}

export async function updatePeriodDefinition(
  workspaceId: string,
  dayTemplateId: string,
  id: string,
  input: {
    periodOrder?: number;
    label?: string;
    startTime?: string;
    endTime?: string;
    periodType?: PeriodType;
    doublePeriodCapable?: boolean;
  }
) {
  await ensureDayTemplate(workspaceId, dayTemplateId);

  const existing = await prisma.periodDefinition.findFirst({
    where: { id, dayTemplateId, workspaceId },
  });
  if (!existing) {
    throw new TimetableError("Period not found", 404);
  }

  const startTime = input.startTime != null ? parseTime(input.startTime, "startTime") : existing.startTime;
  const endTime = input.endTime != null ? parseTime(input.endTime, "endTime") : existing.endTime;
  if (compareTimes(startTime, endTime) <= 0) {
    throw new TimetableError("endTime must be after startTime");
  }

  if (input.periodOrder != null && (!Number.isInteger(input.periodOrder) || input.periodOrder < 1)) {
    throw new TimetableError("periodOrder must be a positive integer");
  }

  const row = await prisma.periodDefinition.update({
    where: { id },
    data: {
      ...(input.periodOrder != null ? { periodOrder: input.periodOrder } : {}),
      ...(input.label != null ? { label: input.label.trim() } : {}),
      ...(input.startTime != null ? { startTime } : {}),
      ...(input.endTime != null ? { endTime } : {}),
      ...(input.periodType != null ? { periodType: input.periodType } : {}),
      ...(input.doublePeriodCapable != null
        ? { doublePeriodCapable: input.doublePeriodCapable }
        : {}),
    },
  });
  return serializePeriodDefinition(row);
}

export async function deletePeriodDefinition(
  workspaceId: string,
  dayTemplateId: string,
  id: string
) {
  await ensureDayTemplate(workspaceId, dayTemplateId);

  const existing = await prisma.periodDefinition.findFirst({
    where: { id, dayTemplateId, workspaceId },
  });
  if (!existing) {
    throw new TimetableError("Period not found", 404);
  }

  await prisma.periodDefinition.delete({ where: { id } });
  return { ok: true };
}

// ─── Teacher assignments ──────────────────────────────────────────────────────

const teacherAssignmentInclude = {
  teacher: { select: { id: true, fullName: true, email: true } },
  class: { select: { id: true, name: true, code: true, grade: true } },
  subject: { select: { id: true, name: true, code: true } },
} satisfies Prisma.TeacherAssignmentInclude;

type TeacherAssignmentRow = Prisma.TeacherAssignmentGetPayload<{
  include: typeof teacherAssignmentInclude;
}>;

export function serializeTeacherAssignment(row: TeacherAssignmentRow) {
  return {
    id: row.id,
    teacher: row.teacher,
    class: row.class,
    subject: row.subject,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTeacherAssignments(
  workspaceId: string,
  filters?: { active?: boolean; classId?: string; teacherId?: string }
) {
  const rows = await prisma.teacherAssignment.findMany({
    where: {
      workspaceId,
      ...(filters?.active != null ? { active: filters.active } : {}),
      ...(filters?.classId ? { classId: filters.classId } : {}),
      ...(filters?.teacherId ? { teacherId: filters.teacherId } : {}),
    },
    include: teacherAssignmentInclude,
    orderBy: [{ class: { grade: "asc" } }, { class: { name: "asc" } }],
  });
  return rows.map(serializeTeacherAssignment);
}

export async function createTeacherAssignment(
  workspaceId: string,
  input: { teacherId: string; classId: string; subjectId: string; active?: boolean }
) {
  await ensureWorkspaceMembership(workspaceId, input.teacherId);
  await ensureSchoolClass(workspaceId, input.classId);
  await ensureWorkspaceSubject(workspaceId, input.subjectId);

  const existing = await prisma.teacherAssignment.findFirst({
    where: {
      workspaceId,
      teacherId: input.teacherId,
      classId: input.classId,
      subjectId: input.subjectId,
    },
  });
  if (existing) {
    throw new TimetableError("This teacher assignment already exists", 409);
  }

  const row = await prisma.teacherAssignment.create({
    data: {
      workspaceId,
      teacherId: input.teacherId,
      classId: input.classId,
      subjectId: input.subjectId,
      active: input.active ?? true,
    },
    include: teacherAssignmentInclude,
  });
  return serializeTeacherAssignment(row);
}

export async function updateTeacherAssignment(
  workspaceId: string,
  id: string,
  input: { teacherId?: string; classId?: string; subjectId?: string; active?: boolean }
) {
  const existing = await prisma.teacherAssignment.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new TimetableError("Teacher assignment not found", 404);
  }

  if (input.teacherId) {
    await ensureWorkspaceMembership(workspaceId, input.teacherId);
  }
  if (input.classId) {
    await ensureSchoolClass(workspaceId, input.classId);
  }
  if (input.subjectId) {
    await ensureWorkspaceSubject(workspaceId, input.subjectId);
  }

  const teacherId = input.teacherId ?? existing.teacherId;
  const classId = input.classId ?? existing.classId;
  const subjectId = input.subjectId ?? existing.subjectId;

  const duplicate = await prisma.teacherAssignment.findFirst({
    where: {
      workspaceId,
      teacherId,
      classId,
      subjectId,
      NOT: { id },
    },
  });
  if (duplicate) {
    throw new TimetableError("This teacher assignment already exists", 409);
  }

  const row = await prisma.teacherAssignment.update({
    where: { id },
    data: {
      ...(input.teacherId != null ? { teacherId: input.teacherId } : {}),
      ...(input.classId != null ? { classId: input.classId } : {}),
      ...(input.subjectId != null ? { subjectId: input.subjectId } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
    include: teacherAssignmentInclude,
  });
  return serializeTeacherAssignment(row);
}

// ─── Subject requirements ─────────────────────────────────────────────────────

const subjectRequirementInclude = {
  class: { select: { id: true, name: true, code: true, grade: true } },
  subject: { select: { id: true, name: true, code: true } },
} satisfies Prisma.SubjectRequirementInclude;

type SubjectRequirementRow = Prisma.SubjectRequirementGetPayload<{
  include: typeof subjectRequirementInclude;
}>;

export function serializeSubjectRequirement(row: SubjectRequirementRow) {
  return {
    id: row.id,
    class: row.class,
    subject: row.subject,
    periodsPerWeek: row.periodsPerWeek,
    doublePeriodsRequired: row.doublePeriodsRequired,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSubjectRequirements(
  workspaceId: string,
  filters?: { classId?: string }
) {
  const rows = await prisma.subjectRequirement.findMany({
    where: {
      workspaceId,
      ...(filters?.classId ? { classId: filters.classId } : {}),
    },
    include: subjectRequirementInclude,
    orderBy: [{ class: { grade: "asc" } }, { subject: { name: "asc" } }],
  });
  return rows.map(serializeSubjectRequirement);
}

export async function createSubjectRequirement(
  workspaceId: string,
  input: {
    classId: string;
    subjectId: string;
    periodsPerWeek: number;
    doublePeriodsRequired?: number;
  }
) {
  await ensureSchoolClass(workspaceId, input.classId);
  await ensureWorkspaceSubject(workspaceId, input.subjectId);

  if (!Number.isInteger(input.periodsPerWeek) || input.periodsPerWeek < 1) {
    throw new TimetableError("periodsPerWeek must be a positive integer");
  }

  const doublePeriodsRequired = input.doublePeriodsRequired ?? 0;
  if (!Number.isInteger(doublePeriodsRequired) || doublePeriodsRequired < 0) {
    throw new TimetableError("doublePeriodsRequired must be a non-negative integer");
  }

  const existing = await prisma.subjectRequirement.findFirst({
    where: {
      workspaceId,
      classId: input.classId,
      subjectId: input.subjectId,
    },
  });
  if (existing) {
    throw new TimetableError("A requirement for this class and subject already exists", 409);
  }

  const row = await prisma.subjectRequirement.create({
    data: {
      workspaceId,
      classId: input.classId,
      subjectId: input.subjectId,
      periodsPerWeek: input.periodsPerWeek,
      doublePeriodsRequired,
    },
    include: subjectRequirementInclude,
  });
  return serializeSubjectRequirement(row);
}

export async function updateSubjectRequirement(
  workspaceId: string,
  id: string,
  input: {
    classId?: string;
    subjectId?: string;
    periodsPerWeek?: number;
    doublePeriodsRequired?: number;
  }
) {
  const existing = await prisma.subjectRequirement.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new TimetableError("Subject requirement not found", 404);
  }

  if (input.classId) {
    await ensureSchoolClass(workspaceId, input.classId);
  }
  if (input.subjectId) {
    await ensureWorkspaceSubject(workspaceId, input.subjectId);
  }

  if (input.periodsPerWeek != null) {
    if (!Number.isInteger(input.periodsPerWeek) || input.periodsPerWeek < 1) {
      throw new TimetableError("periodsPerWeek must be a positive integer");
    }
  }

  if (input.doublePeriodsRequired != null) {
    if (!Number.isInteger(input.doublePeriodsRequired) || input.doublePeriodsRequired < 0) {
      throw new TimetableError("doublePeriodsRequired must be a non-negative integer");
    }
  }

  const classId = input.classId ?? existing.classId;
  const subjectId = input.subjectId ?? existing.subjectId;

  const duplicate = await prisma.subjectRequirement.findFirst({
    where: { workspaceId, classId, subjectId, NOT: { id } },
  });
  if (duplicate) {
    throw new TimetableError("A requirement for this class and subject already exists", 409);
  }

  const row = await prisma.subjectRequirement.update({
    where: { id },
    data: {
      ...(input.classId != null ? { classId: input.classId } : {}),
      ...(input.subjectId != null ? { subjectId: input.subjectId } : {}),
      ...(input.periodsPerWeek != null ? { periodsPerWeek: input.periodsPerWeek } : {}),
      ...(input.doublePeriodsRequired != null
        ? { doublePeriodsRequired: input.doublePeriodsRequired }
        : {}),
    },
    include: subjectRequirementInclude,
  });
  return serializeSubjectRequirement(row);
}

export { parseRoomType, parsePeriodType };
