import { DayOfWeek, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { TimetableClash } from "./lessonTimetable";

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
  schoolClass: { select: { id: true, name: true, code: true, grade: true } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, fullName: true, email: true } },
  room: { select: { id: true, name: true, code: true } },
} satisfies Prisma.LessonEntryInclude;

export const TIMETABLE_INTELLIGENCE_CONFIG = {
  teacherAssignment: {
    draftMode: "warn" as "warn" | "block",
    publishMode: "block" as "warn" | "block",
  },
};

export type RequirementCoverageStatus = "COMPLETE" | "MISSING" | "OVER_SCHEDULED";

export type RequirementCoverageItem = {
  classId: string;
  classCode: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  periodsPerWeek: number;
  doublePeriodsRequired: number;
  scheduledPeriods: number;
  scheduledDoublePeriods: number;
  missingPeriods: number;
  extraPeriods: number;
  missingDoublePeriods: number;
  extraDoublePeriods: number;
  status: RequirementCoverageStatus;
};

export type TeacherAssignmentViolation = {
  entryId: string;
  classId: string;
  classCode: string;
  subjectId: string;
  subjectCode: string;
  teacherUserId: string;
  teacherName: string;
  message: string;
};

export type ReadinessSummary = {
  totalClasses: number;
  classesWithCompleteRequirements: number;
  totalSubjectRequirements: number;
  subjectsFullyScheduled: number;
  missingPeriodsTotal: number;
  extraPeriodsTotal: number;
  hardClashCount: number;
  warningCount: number;
  unassignedTeacherCount: number;
  unassignedRoomCount: number;
  teacherAssignmentViolationCount: number;
  incompleteSubjectCount: number;
};

export type TimetableReadinessResult = {
  canPublish: boolean;
  valid: boolean;
  hardClashes: TimetableClash[];
  warnings: TimetableClash[];
  clashCount: number;
  requirementCoverage: RequirementCoverageItem[];
  teacherAssignmentViolations: TeacherAssignmentViolation[];
  readinessSummary: ReadinessSummary;
  blockingReasons: string[];
};

type EntryRow = Prisma.LessonEntryGetPayload<{ include: typeof lessonEntryInclude }>;

function periodWeight(isDoublePeriod: boolean) {
  return isDoublePeriod ? 2 : 1;
}

export async function loadTimetableIntelligenceContext(workspaceId: string, timetableId: string) {
  const timetable = await prisma.lessonTimetable.findFirst({
    where: { id: timetableId, workspaceId },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          periods: { orderBy: { periodOrder: "asc" as const } },
        },
      },
    },
  });
  if (!timetable) {
    return null;
  }

  const [entries, requirements, assignments, classes] = await Promise.all([
    prisma.lessonEntry.findMany({
      where: { workspaceId, timetableId },
      include: lessonEntryInclude,
    }),
    prisma.subjectRequirement.findMany({
      where: { workspaceId },
      include: {
        class: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.teacherAssignment.findMany({
      where: { workspaceId, active: true },
      select: { teacherId: true, classId: true, subjectId: true },
    }),
    prisma.schoolClass.findMany({
      where: { workspaceId, active: true },
      select: { id: true },
    }),
  ]);

  const assignmentKeys = new Set(
    assignments.map((a) => `${a.teacherId}:${a.classId}:${a.subjectId}`)
  );

  return { timetable, entries, requirements, assignmentKeys, classes };
}

export function computeRequirementCoverage(
  requirements: Array<{
    classId: string;
    subjectId: string;
    periodsPerWeek: number;
    doublePeriodsRequired: number;
    class: { id: string; code: string; name: string };
    subject: { id: string; code: string; name: string };
  }>,
  entries: EntryRow[]
): RequirementCoverageItem[] {
  return requirements.map((req) => {
    const matching = entries.filter(
      (e) => e.schoolClassId === req.classId && e.subjectId === req.subjectId
    );
    const scheduledPeriods = matching.reduce(
      (sum, e) => sum + periodWeight(e.isDoublePeriod),
      0
    );
    const scheduledDoublePeriods = matching.filter((e) => e.isDoublePeriod).length;

    const missingPeriods = Math.max(0, req.periodsPerWeek - scheduledPeriods);
    const extraPeriods = Math.max(0, scheduledPeriods - req.periodsPerWeek);
    const missingDoublePeriods = Math.max(
      0,
      req.doublePeriodsRequired - scheduledDoublePeriods
    );
    const extraDoublePeriods = Math.max(
      0,
      scheduledDoublePeriods - req.doublePeriodsRequired
    );

    let status: RequirementCoverageStatus = "COMPLETE";
    if (missingPeriods > 0 || missingDoublePeriods > 0) {
      status = "MISSING";
    } else if (extraPeriods > 0 || extraDoublePeriods > 0) {
      status = "OVER_SCHEDULED";
    }

    return {
      classId: req.class.id,
      classCode: req.class.code,
      className: req.class.name,
      subjectId: req.subject.id,
      subjectCode: req.subject.code,
      subjectName: req.subject.name,
      periodsPerWeek: req.periodsPerWeek,
      doublePeriodsRequired: req.doublePeriodsRequired,
      scheduledPeriods,
      scheduledDoublePeriods,
      missingPeriods,
      extraPeriods,
      missingDoublePeriods,
      extraDoublePeriods,
      status,
    };
  });
}

export function detectTeacherAssignmentViolations(
  entries: EntryRow[],
  assignmentKeys: Set<string>
): TeacherAssignmentViolation[] {
  const violations: TeacherAssignmentViolation[] = [];

  for (const entry of entries) {
    const key = `${entry.teacherUserId}:${entry.schoolClassId}:${entry.subjectId}`;
    if (!assignmentKeys.has(key)) {
      violations.push({
        entryId: entry.id,
        classId: entry.schoolClassId,
        classCode: entry.schoolClass.code,
        subjectId: entry.subjectId,
        subjectCode: entry.subject.code,
        teacherUserId: entry.teacherUserId,
        teacherName: entry.teacher.fullName,
        message: `${entry.teacher.fullName} is not assigned to teach ${entry.subject.code} for ${entry.schoolClass.code}`,
      });
    }
  }

  return violations;
}

export function buildCoverageWarnings(coverage: RequirementCoverageItem[]): TimetableClash[] {
  const warnings: TimetableClash[] = [];

  for (const item of coverage) {
    if (item.extraPeriods > 0 || item.extraDoublePeriods > 0) {
      warnings.push({
        severity: "WARNING",
        type: "OVER_SCHEDULED",
        dayOfWeek: "MONDAY" as DayOfWeek,
        periodId: "",
        periodLabel: "",
        entryId: "",
        conflictingEntryId: "",
        message: `Over-scheduled: ${item.classCode} ${item.subjectCode} has ${item.extraPeriods} extra period(s)${item.extraDoublePeriods > 0 ? ` and ${item.extraDoublePeriods} extra double(s)` : ""}`,
      });
    }
  }

  return warnings;
}

export function buildMissingRoomWarnings(entries: EntryRow[]): TimetableClash[] {
  return entries
    .filter((e) => !e.roomId)
    .map((e) => ({
      severity: "WARNING" as const,
      type: "MISSING_ROOM" as const,
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      periodLabel: e.period.label,
      entryId: e.id,
      conflictingEntryId: e.id,
      message: `No room assigned: ${e.schoolClass.code} ${e.subject.code} on ${e.dayOfWeek} ${e.period.label}`,
    }));
}

export async function evaluateTimetableReadiness(
  workspaceId: string,
  timetableId: string
): Promise<TimetableReadinessResult | null> {
  const ctx = await loadTimetableIntelligenceContext(workspaceId, timetableId);
  if (!ctx) {
    return null;
  }

  const { timetable, entries, requirements, assignmentKeys, classes } = ctx;
  const periods = timetable.template.periods.map((p) => ({
    id: p.id,
    periodOrder: p.periodOrder,
    label: p.label,
    periodType: p.periodType,
    doublePeriodCapable: p.doublePeriodCapable,
  }));

  const { detectLessonTimetableClashes } = await import("./lessonTimetable");
  const clashResult = detectLessonTimetableClashes(entries, periods);
  const requirementCoverage = computeRequirementCoverage(requirements, entries);
  const teacherAssignmentViolations = detectTeacherAssignmentViolations(
    entries,
    assignmentKeys
  );

  const coverageWarnings = buildCoverageWarnings(requirementCoverage);
  const missingRoomWarnings = buildMissingRoomWarnings(entries);
  const warnings = [
    ...clashResult.warnings,
    ...coverageWarnings,
    ...missingRoomWarnings,
  ];

  const classIdsWithRequirements = new Set(requirements.map((r) => r.classId));
  const completeClassIds = new Set<string>();
  for (const classId of classIdsWithRequirements) {
    const classCoverage = requirementCoverage.filter((c) => c.classId === classId);
    if (classCoverage.length > 0 && classCoverage.every((c) => c.status === "COMPLETE")) {
      completeClassIds.add(classId);
    }
  }

  const subjectsFullyScheduled = requirementCoverage.filter(
    (c) => c.status === "COMPLETE"
  ).length;
  const incompleteSubjectCount = requirementCoverage.filter(
    (c) => c.status === "MISSING"
  ).length;
  const missingPeriodsTotal = requirementCoverage.reduce(
    (sum, c) => sum + c.missingPeriods,
    0
  );
  const extraPeriodsTotal = requirementCoverage.reduce(
    (sum, c) => sum + c.extraPeriods,
    0
  );

  const unassignedTeacherCount = entries.filter((e) => !e.teacherUserId).length;
  const unassignedRoomCount = entries.filter((e) => !e.roomId).length;

  const blockingReasons: string[] = [];

  if (clashResult.hardClashes.length > 0) {
    blockingReasons.push(
      `${clashResult.hardClashes.length} hard teacher/class/room clash(es)`
    );
  }
  if (missingPeriodsTotal > 0) {
    blockingReasons.push(`${missingPeriodsTotal} required period(s) still missing`);
  }
  if (requirementCoverage.some((c) => c.missingDoublePeriods > 0)) {
    const missingDoubles = requirementCoverage.reduce(
      (sum, c) => sum + c.missingDoublePeriods,
      0
    );
    blockingReasons.push(`${missingDoubles} required double period(s) still missing`);
  }
  if (teacherAssignmentViolations.length > 0) {
    blockingReasons.push(
      `${teacherAssignmentViolations.length} teacher assignment violation(s)`
    );
  }
  if (unassignedTeacherCount > 0) {
    blockingReasons.push(`${unassignedTeacherCount} lesson(s) without a teacher`);
  }

  const scheduledClassSubjectKeys = new Set(
    entries.map((e) => `${e.schoolClassId}:${e.subjectId}`)
  );
  const unscheduledRequirements = requirements.filter(
    (r) => !scheduledClassSubjectKeys.has(`${r.classId}:${r.subjectId}`)
  );
  if (unscheduledRequirements.length > 0) {
    blockingReasons.push(
      `${unscheduledRequirements.length} class/subject requirement(s) have no scheduled lessons`
    );
  }

  const canPublish = blockingReasons.length === 0;

  const readinessSummary: ReadinessSummary = {
    totalClasses: classes.length,
    classesWithCompleteRequirements: completeClassIds.size,
    totalSubjectRequirements: requirements.length,
    subjectsFullyScheduled,
    missingPeriodsTotal,
    extraPeriodsTotal,
    hardClashCount: clashResult.hardClashes.length,
    warningCount: warnings.length,
    unassignedTeacherCount,
    unassignedRoomCount,
    teacherAssignmentViolationCount: teacherAssignmentViolations.length,
    incompleteSubjectCount,
  };

  return {
    canPublish,
    valid: canPublish,
    hardClashes: clashResult.hardClashes,
    warnings,
    clashCount: clashResult.hardClashes.length + warnings.length,
    requirementCoverage,
    teacherAssignmentViolations,
    readinessSummary,
    blockingReasons,
  };
}

export async function checkTeacherAssignmentForEntry(
  workspaceId: string,
  input: { teacherUserId: string; schoolClassId: string; subjectId: string }
): Promise<TeacherAssignmentViolation | null> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      workspaceId,
      teacherId: input.teacherUserId,
      classId: input.schoolClassId,
      subjectId: input.subjectId,
      active: true,
    },
  });
  if (assignment) {
    return null;
  }

  const [teacher, schoolClass, subject] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.teacherUserId },
      select: { fullName: true },
    }),
    prisma.schoolClass.findUnique({
      where: { id: input.schoolClassId },
      select: { code: true },
    }),
    prisma.workspaceSubject.findUnique({
      where: { id: input.subjectId },
      select: { code: true },
    }),
  ]);

  return {
    entryId: "",
    classId: input.schoolClassId,
    classCode: schoolClass?.code ?? "",
    subjectId: input.subjectId,
    subjectCode: subject?.code ?? "",
    teacherUserId: input.teacherUserId,
    teacherName: teacher?.fullName ?? "Teacher",
    message: `${teacher?.fullName ?? "Teacher"} is not assigned to teach ${subject?.code ?? "subject"} for ${schoolClass?.code ?? "class"}`,
  };
}
