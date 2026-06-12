import { DayOfWeek, LessonTimetableStatus, PeriodType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { TimetableError } from "./timetableFoundation";
import { DAY_ORDER, lessonEntryInclude } from "./lessonTimetable";
import {
  computeRequirementCoverage,
  evaluateTimetableReadiness,
  loadTimetableIntelligenceContext,
  type RequirementCoverageItem,
  type TimetableReadinessResult,
} from "./timetableReadiness";
import { scoreRoomPlacement, type RoomInfo } from "./roomIntelligence";
import { scoreTeacherWorkloadPlacement } from "./teacherWorkload";

export type UnplacedRequirement = {
  classId: string;
  classCode: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  missingPeriods: number;
  missingDoublePeriods: number;
  reason: string;
};

export type TimetableGenerateResult = {
  generatedCount: number;
  skippedCount: number;
  unplacedRequirements: UnplacedRequirement[];
  warnings: string[];
  readiness: TimetableReadinessResult;
};

type PeriodInfo = {
  id: string;
  periodOrder: number;
  label: string;
  periodType: PeriodType;
  doublePeriodCapable: boolean;
};

type PlacementTask = {
  classId: string;
  classCode: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  learnerCount: number;
  isDouble: boolean;
  teacherCount: number;
  availableSlots: number;
};

type PlannedEntry = {
  dayOfWeek: DayOfWeek;
  periodId: string;
  schoolClassId: string;
  subjectId: string;
  teacherUserId: string;
  roomId: string | null;
  isDoublePeriod: boolean;
};

type EntryRow = Prisma.LessonEntryGetPayload<{ include: typeof lessonEntryInclude }>;

function slotKey(day: DayOfWeek, periodId: string, resource: string, id: string) {
  return `${day}:${periodId}:${resource}:${id}`;
}

function buildPeriodMaps(periods: PeriodInfo[]) {
  const byId = new Map(periods.map((p) => [p.id, p]));
  const sorted = [...periods].sort((a, b) => a.periodOrder - b.periodOrder);
  const nextById = new Map<string, PeriodInfo | null>();
  const prevById = new Map<string, PeriodInfo | null>();
  for (let i = 0; i < sorted.length; i++) {
    nextById.set(sorted[i].id, sorted[i + 1] ?? null);
    prevById.set(sorted[i].id, sorted[i - 1] ?? null);
  }
  const teachingPeriods = sorted.filter((p) => p.periodType === PeriodType.TEACHING);
  return { byId, sorted, nextById, prevById, teachingPeriods };
}

class OccupancyTracker {
  private classSlots = new Set<string>();
  private teacherSlots = new Set<string>();
  private roomSlots = new Set<string>();
  private classSubjectBySlot = new Map<string, string>();
  private teacherDayCount = new Map<string, number>();
  private teacherWeekCount = new Map<string, number>();
  private teacherDayPeriodIds = new Map<string, Set<string>>();
  private subjectDayCount = new Map<string, number>();
  private teachingPeriods: PeriodInfo[] = [];
  private firstTeachingId: string | null = null;
  private lastTeachingId: string | null = null;

  constructor(
    existingEntries: EntryRow[],
    nextById: Map<string, PeriodInfo | null>,
    teachingPeriods: PeriodInfo[]
  ) {
    this.teachingPeriods = teachingPeriods;
    if (teachingPeriods.length > 0) {
      this.firstTeachingId = teachingPeriods[0].id;
      this.lastTeachingId = teachingPeriods[teachingPeriods.length - 1].id;
    }
    for (const entry of existingEntries) {
      this.occupyEntry(entry, nextById);
    }
  }

  private occupyEntry(
    entry: {
      dayOfWeek: DayOfWeek;
      periodId: string;
      schoolClassId: string;
      subjectId: string;
      teacherUserId: string;
      roomId: string | null;
      isDoublePeriod: boolean;
    },
    nextById: Map<string, PeriodInfo | null>
  ) {
    const slots = this.getSlots(entry, nextById);
    for (const slot of slots) {
      this.classSlots.add(slotKey(slot.day, slot.periodId, "class", entry.schoolClassId));
      this.teacherSlots.add(
        slotKey(slot.day, slot.periodId, "teacher", entry.teacherUserId)
      );
      if (entry.roomId) {
        this.roomSlots.add(slotKey(slot.day, slot.periodId, "room", entry.roomId));
      }
      this.classSubjectBySlot.set(
        slotKey(slot.day, slot.periodId, "class", entry.schoolClassId),
        entry.subjectId
      );
    }
    const dayKey = `${entry.dayOfWeek}:${entry.teacherUserId}`;
    this.teacherDayCount.set(
      dayKey,
      (this.teacherDayCount.get(dayKey) ?? 0) + slots.length
    );
    this.teacherWeekCount.set(
      entry.teacherUserId,
      (this.teacherWeekCount.get(entry.teacherUserId) ?? 0) + slots.length
    );
    const dayPeriodKey = dayKey;
    const periodSet = this.teacherDayPeriodIds.get(dayPeriodKey) ?? new Set<string>();
    for (const slot of slots) {
      periodSet.add(slot.periodId);
    }
    this.teacherDayPeriodIds.set(dayPeriodKey, periodSet);
    const subjectDayKey = `${entry.dayOfWeek}:${entry.schoolClassId}:${entry.subjectId}`;
    this.subjectDayCount.set(
      subjectDayKey,
      (this.subjectDayCount.get(subjectDayKey) ?? 0) + 1
    );
  }

  addPlanned(entry: PlannedEntry, nextById: Map<string, PeriodInfo | null>) {
    this.occupyEntry(entry, nextById);
  }

  private getSlots(
    entry: { dayOfWeek: DayOfWeek; periodId: string; isDoublePeriod: boolean },
    nextById: Map<string, PeriodInfo | null>
  ) {
    const slots = [{ day: entry.dayOfWeek, periodId: entry.periodId }];
    if (entry.isDoublePeriod) {
      const next = nextById.get(entry.periodId);
      if (next) {
        slots.push({ day: entry.dayOfWeek, periodId: next.id });
      }
    }
    return slots;
  }

  isClassFree(day: DayOfWeek, periodId: string, classId: string) {
    return !this.classSlots.has(slotKey(day, periodId, "class", classId));
  }

  isTeacherFree(day: DayOfWeek, periodId: string, teacherId: string) {
    return !this.teacherSlots.has(slotKey(day, periodId, "teacher", teacherId));
  }

  isRoomFree(day: DayOfWeek, periodId: string, roomId: string) {
    return !this.roomSlots.has(slotKey(day, periodId, "room", roomId));
  }

  canPlace(
    day: DayOfWeek,
    periodId: string,
    classId: string,
    teacherId: string,
    roomId: string | null,
    isDouble: boolean,
    nextById: Map<string, PeriodInfo | null>,
    byId: Map<string, PeriodInfo>
  ): boolean {
    const periodIds = [periodId];
    if (isDouble) {
      const next = nextById.get(periodId);
      if (!next || next.periodType === PeriodType.BREAK) return false;
      const period = byId.get(periodId);
      if (!period?.doublePeriodCapable) return false;
      periodIds.push(next.id);
    }

    for (const pid of periodIds) {
      const p = byId.get(pid);
      if (!p || p.periodType === PeriodType.BREAK) return false;
      if (!this.isClassFree(day, pid, classId)) return false;
      if (!this.isTeacherFree(day, pid, teacherId)) return false;
      if (roomId && !this.isRoomFree(day, pid, roomId)) return false;
    }
    return true;
  }

  scorePlacement(
    day: DayOfWeek,
    periodId: string,
    classId: string,
    subjectId: string,
    teacherId: string,
    roomId: string | null,
    isDouble: boolean,
    nextById: Map<string, PeriodInfo | null>,
    prevById: Map<string, PeriodInfo | null>,
    roomScore = 0
  ): number {
    let score = roomScore;

    const teacherDayKey = `${day}:${teacherId}`;
    const teacherDayLoad = this.teacherDayCount.get(teacherDayKey) ?? 0;
    const teacherWeekLoad = this.teacherWeekCount.get(teacherId) ?? 0;
    const dayOccupied = this.teacherDayPeriodIds.get(teacherDayKey) ?? new Set<string>();

    score += scoreTeacherWorkloadPlacement({
      day,
      periodId,
      teacherId,
      isDouble,
      teacherDayCount: teacherDayLoad,
      teacherWeekCount: teacherWeekLoad,
      dayOccupiedPeriodIds: dayOccupied,
      teachingPeriods: this.teachingPeriods,
      nextById,
      firstTeachingId: this.firstTeachingId,
      lastTeachingId: this.lastTeachingId,
    });

    const subjectDayKey = `${day}:${classId}:${subjectId}`;
    const subjectOnDay = this.subjectDayCount.get(subjectDayKey) ?? 0;
    score -= subjectOnDay * 8;

    const periodIds = [periodId];
    if (isDouble) {
      const next = nextById.get(periodId);
      if (next) periodIds.push(next.id);
    }

    for (const pid of periodIds) {
      const prev = prevById.get(pid);
      if (prev) {
        const prevSubject = this.classSubjectBySlot.get(
          slotKey(day, prev.id, "class", classId)
        );
        if (prevSubject === subjectId) score -= 15;
      }
      const next = nextById.get(pid);
      if (next && next.periodType !== PeriodType.BREAK) {
        const nextSubject = this.classSubjectBySlot.get(
          slotKey(day, next.id, "class", classId)
        );
        if (nextSubject === subjectId) score -= 15;
      }
    }

    return score;
  }

  countAvailableSlots(
    classId: string,
    teacherId: string,
    roomIds: string[],
    isDouble: boolean,
    teachingPeriods: PeriodInfo[],
    nextById: Map<string, PeriodInfo | null>,
    byId: Map<string, PeriodInfo>
  ): number {
    let count = 0;
    for (const day of DAY_ORDER) {
      for (const period of teachingPeriods) {
        if (isDouble) {
          const next = nextById.get(period.id);
          if (!period.doublePeriodCapable || !next || next.periodType === PeriodType.BREAK) {
            continue;
          }
        }
        const roomId = roomIds.find((r) =>
          this.canPlace(day, period.id, classId, teacherId, r, isDouble, nextById, byId)
        );
        if (
          this.canPlace(day, period.id, classId, teacherId, roomId ?? null, isDouble, nextById, byId)
        ) {
          count++;
        } else if (
          this.canPlace(day, period.id, classId, teacherId, null, isDouble, nextById, byId)
        ) {
          count++;
        }
      }
    }
    return count;
  }
}

function buildPlacementTasks(
  coverage: RequirementCoverageItem[],
  assignmentsByClassSubject: Map<string, string[]>,
  classLearnerCounts: Map<string, number>,
  occupancy: OccupancyTracker,
  teachingPeriods: PeriodInfo[],
  nextById: Map<string, PeriodInfo | null>,
  byId: Map<string, PeriodInfo>,
  roomIds: string[]
): { tasks: PlacementTask[]; warnings: string[] } {
  const tasks: PlacementTask[] = [];
  const warnings: string[] = [];

  for (const item of coverage) {
    if (item.status !== "MISSING") continue;

    const assignKey = `${item.classId}:${item.subjectId}`;
    const teachers = assignmentsByClassSubject.get(assignKey) ?? [];
    if (teachers.length === 0) {
      warnings.push(
        `No teacher assignment for ${item.classCode} ${item.subjectCode} — skipped`
      );
      continue;
    }

    const teacherId = teachers[0];
    const teacherCount = teachers.length;

    for (let i = 0; i < item.missingDoublePeriods; i++) {
      const availableSlots = occupancy.countAvailableSlots(
        item.classId,
        teacherId,
        roomIds,
        true,
        teachingPeriods,
        nextById,
        byId
      );
      tasks.push({
        classId: item.classId,
        classCode: item.classCode,
        subjectId: item.subjectId,
        subjectCode: item.subjectCode,
        subjectName: item.subjectName,
        learnerCount: classLearnerCounts.get(item.classId) ?? 0,
        isDouble: true,
        teacherCount,
        availableSlots,
      });
    }

    const singlesNeeded = Math.max(0, item.missingPeriods - item.missingDoublePeriods * 2);
    for (let i = 0; i < singlesNeeded; i++) {
      const availableSlots = occupancy.countAvailableSlots(
        item.classId,
        teacherId,
        roomIds,
        false,
        teachingPeriods,
        nextById,
        byId
      );
      tasks.push({
        classId: item.classId,
        classCode: item.classCode,
        subjectId: item.subjectId,
        subjectCode: item.subjectCode,
        subjectName: item.subjectName,
        learnerCount: classLearnerCounts.get(item.classId) ?? 0,
        isDouble: false,
        teacherCount,
        availableSlots,
      });
    }
  }

  tasks.sort((a, b) => {
    if (a.isDouble !== b.isDouble) return a.isDouble ? -1 : 1;
    if (a.teacherCount !== b.teacherCount) return a.teacherCount - b.teacherCount;
    return a.availableSlots - b.availableSlots;
  });

  return { tasks, warnings };
}

function findBestPlacement(
  task: PlacementTask,
  teachers: string[],
  rooms: RoomInfo[],
  teachingPeriods: PeriodInfo[],
  occupancy: OccupancyTracker,
  nextById: Map<string, PeriodInfo | null>,
  prevById: Map<string, PeriodInfo | null>,
  byId: Map<string, PeriodInfo>
): PlannedEntry | null {
  let best: PlannedEntry | null = null;
  let bestScore = -Infinity;
  const subject = { name: task.subjectName, code: task.subjectCode };

  for (const teacherId of teachers) {
    for (const day of DAY_ORDER) {
      for (const period of teachingPeriods) {
        if (task.isDouble) {
          const next = nextById.get(period.id);
          if (!period.doublePeriodCapable || !next || next.periodType === PeriodType.BREAK) {
            continue;
          }
        }

        let roomId: string | null = null;
        let roomScore = 0;

        for (const room of rooms) {
          if (
            !occupancy.canPlace(
              day,
              period.id,
              task.classId,
              teacherId,
              room.id,
              task.isDouble,
              nextById,
              byId
            )
          ) {
            continue;
          }

          const candidateScore = scoreRoomPlacement(room, subject, task.learnerCount);
          if (candidateScore > roomScore) {
            roomScore = candidateScore;
            roomId = room.id;
          }
        }

        if (
          !occupancy.canPlace(
            day,
            period.id,
            task.classId,
            teacherId,
            roomId,
            task.isDouble,
            nextById,
            byId
          )
        ) {
          continue;
        }

        const score = occupancy.scorePlacement(
          day,
          period.id,
          task.classId,
          task.subjectId,
          teacherId,
          roomId,
          task.isDouble,
          nextById,
          prevById,
          roomScore
        );

        if (score > bestScore) {
          bestScore = score;
          best = {
            dayOfWeek: day,
            periodId: period.id,
            schoolClassId: task.classId,
            subjectId: task.subjectId,
            teacherUserId: teacherId,
            roomId,
            isDoublePeriod: task.isDouble,
          };
        }
      }
    }
  }

  return best;
}

function buildUnplacedRequirements(
  coverage: RequirementCoverageItem[],
  assignmentsByClassSubject: Map<string, string[]>
): UnplacedRequirement[] {
  return coverage
    .filter((c) => c.status === "MISSING")
    .map((c) => {
      const hasTeacher =
        (assignmentsByClassSubject.get(`${c.classId}:${c.subjectId}`) ?? []).length > 0;
      let reason = "Could not find clash-free slot";
      if (!hasTeacher) {
        reason = "No active teacher assignment";
      } else if (c.missingDoublePeriods > 0) {
        reason = `Missing ${c.missingPeriods} period(s) including ${c.missingDoublePeriods} double(s)`;
      } else {
        reason = `Missing ${c.missingPeriods} period(s)`;
      }
      return {
        classId: c.classId,
        classCode: c.classCode,
        className: c.className,
        subjectId: c.subjectId,
        subjectCode: c.subjectCode,
        subjectName: c.subjectName,
        missingPeriods: c.missingPeriods,
        missingDoublePeriods: c.missingDoublePeriods,
        reason,
      };
    });
}

export async function generateLessonTimetable(
  workspaceId: string,
  timetableId: string
): Promise<TimetableGenerateResult> {
  const ctx = await loadTimetableIntelligenceContext(workspaceId, timetableId);
  if (!ctx) {
    throw new TimetableError("Lesson timetable not found", 404);
  }

  const { timetable, entries, requirements, classLearnerCounts } = ctx;

  if (timetable.status !== LessonTimetableStatus.DRAFT) {
    throw new TimetableError("Only draft timetables can be auto-generated", 409);
  }

  const periods = timetable.template.periods.map((p) => ({
    id: p.id,
    periodOrder: p.periodOrder,
    label: p.label,
    periodType: p.periodType,
    doublePeriodCapable: p.doublePeriodCapable,
  }));

  const { nextById, prevById, teachingPeriods, byId } = buildPeriodMaps(periods);

  const assignments = await prisma.teacherAssignment.findMany({
    where: { workspaceId, active: true },
    select: { teacherId: true, classId: true, subjectId: true },
  });

  const assignmentsByClassSubject = new Map<string, string[]>();
  for (const a of assignments) {
    const key = `${a.classId}:${a.subjectId}`;
    const list = assignmentsByClassSubject.get(key) ?? [];
    list.push(a.teacherId);
    assignmentsByClassSubject.set(key, list);
  }

  const rooms = await prisma.timetableRoom.findMany({
    where: { workspaceId, active: true },
    select: { id: true, code: true, name: true, roomType: true, capacity: true },
    orderBy: { code: "asc" },
  });
  const roomIds = rooms.map((r) => r.id);

  const occupancy = new OccupancyTracker(entries, nextById, teachingPeriods);
  const initialCoverage = computeRequirementCoverage(requirements, entries);
  const { tasks, warnings: preWarnings } = buildPlacementTasks(
    initialCoverage,
    assignmentsByClassSubject,
    classLearnerCounts,
    occupancy,
    teachingPeriods,
    nextById,
    byId,
    roomIds
  );

  const planned: PlannedEntry[] = [];
  let skippedCount = 0;

  for (const task of tasks) {
    const teachers = assignmentsByClassSubject.get(`${task.classId}:${task.subjectId}`) ?? [];
    const placement = findBestPlacement(
      task,
      teachers,
      rooms,
      teachingPeriods,
      occupancy,
      nextById,
      prevById,
      byId
    );

    if (!placement) {
      skippedCount += task.isDouble ? 2 : 1;
      continue;
    }

    planned.push(placement);
    occupancy.addPlanned(placement, nextById);
  }

  if (planned.length > 0) {
    await prisma.$transaction(
      planned.map((p) =>
        prisma.lessonEntry.create({
          data: {
            workspaceId,
            timetableId,
            dayOfWeek: p.dayOfWeek,
            periodId: p.periodId,
            schoolClassId: p.schoolClassId,
            subjectId: p.subjectId,
            teacherUserId: p.teacherUserId,
            roomId: p.roomId,
            isDoublePeriod: p.isDoublePeriod,
            locked: false,
          },
        })
      )
    );
  }

  const readiness = await evaluateTimetableReadiness(workspaceId, timetableId);
  if (!readiness) {
    throw new TimetableError("Failed to evaluate timetable after generation", 500);
  }

  if (readiness.hardClashes.length > 0) {
    throw new TimetableError(
      "Generator produced hard clashes — this should not happen. Please report this issue.",
      500
    );
  }

  const postCoverage = readiness.requirementCoverage;
  const unplacedRequirements = buildUnplacedRequirements(postCoverage, assignmentsByClassSubject);

  const postWarnings = [...preWarnings];
  if (skippedCount > 0) {
    postWarnings.push(`${skippedCount} period slot(s) could not be placed`);
  }

  return {
    generatedCount: planned.length,
    skippedCount,
    unplacedRequirements,
    warnings: postWarnings,
    readiness,
  };
}
