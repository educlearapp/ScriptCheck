import { DayOfWeek, PeriodType } from "@prisma/client";
import type { TimetableClash } from "./lessonTimetable";

export const TEACHER_WORKLOAD_CONFIG = {
  maxPeriodsPerDay: 6,
  maxConsecutivePeriods: 4,
  maxPeriodsPerWeek: 25,
  avoidFirstPeriod: false,
  avoidLastPeriod: false,
  heavyDayThreshold: 5,
  unevenLoadSpread: 3,
  underloadWeeklyThreshold: 8,
  draftMode: "warn" as "warn" | "block",
  publishMode: "warn" as "warn" | "block",
};

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

export type TeacherWorkloadClashType =
  | "TEACHER_DAILY_OVERLOAD"
  | "TEACHER_WEEKLY_OVERLOAD"
  | "TEACHER_CONSECUTIVE"
  | "TEACHER_HEAVY_DAY"
  | "TEACHER_UNEVEN_LOAD"
  | "TEACHER_FIRST_PERIOD"
  | "TEACHER_LAST_PERIOD"
  | "TEACHER_UNDERLOAD";

export type TeacherDayLoad = {
  dayOfWeek: DayOfWeek;
  periods: number;
  maxConsecutive: number;
  freePeriods: number;
};

export type TeacherWorkloadItem = {
  teacherUserId: string;
  teacherName: string;
  totalPeriodsPerWeek: number;
  periodsPerDay: Record<DayOfWeek, number>;
  maxConsecutivePeriods: number;
  maxConsecutiveByDay: Partial<Record<DayOfWeek, number>>;
  freePeriodsPerDay: Record<DayOfWeek, number>;
  averagePeriodsPerDay: number;
  isOverloadedWeekly: boolean;
  isUnderloaded: boolean;
  hasUnevenLoad: boolean;
  overloadedDays: DayOfWeek[];
  heavyDays: DayOfWeek[];
  warningCount: number;
};

export type TeacherWorkloadSummary = {
  overloadedTeacherCount: number;
  consecutiveWarningCount: number;
  heavyDayWarningCount: number;
  unevenLoadCount: number;
  weeklyOverloadCount: number;
  underloadCount: number;
  totalWarnings: number;
};

export type TeacherWorkloadResult = {
  summary: TeacherWorkloadSummary;
  teachers: TeacherWorkloadItem[];
};

type PeriodInfo = {
  id: string;
  periodOrder: number;
  label: string;
  periodType: PeriodType;
  doublePeriodCapable: boolean;
};

type EntryForWorkload = {
  id: string;
  dayOfWeek: DayOfWeek;
  periodId: string;
  teacherUserId: string;
  isDoublePeriod: boolean;
  period: { label: string; periodOrder: number };
  teacher: { fullName: string };
  schoolClass?: { code: string };
  subject?: { code: string };
};

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
  const firstTeaching = teachingPeriods[0] ?? null;
  const lastTeaching = teachingPeriods[teachingPeriods.length - 1] ?? null;
  return { byId, sorted, nextById, prevById, teachingPeriods, firstTeaching, lastTeaching };
}

function getOccupiedPeriodIds(
  entry: { dayOfWeek: DayOfWeek; periodId: string; isDoublePeriod: boolean },
  nextById: Map<string, PeriodInfo | null>
): Array<{ day: DayOfWeek; periodId: string }> {
  const slots = [{ day: entry.dayOfWeek, periodId: entry.periodId }];
  if (entry.isDoublePeriod) {
    const next = nextById.get(entry.periodId);
    if (next) slots.push({ day: entry.dayOfWeek, periodId: next.id });
  }
  return slots;
}

function maxConsecutiveOnDay(
  occupiedPeriodIds: Set<string>,
  teachingPeriods: PeriodInfo[]
): number {
  let max = 0;
  let current = 0;
  for (const period of teachingPeriods) {
    if (occupiedPeriodIds.has(period.id)) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

function wouldExceedConsecutive(
  occupiedPeriodIds: Set<string>,
  newPeriodIds: string[],
  teachingPeriods: PeriodInfo[],
  maxAllowed: number
): boolean {
  const combined = new Set(occupiedPeriodIds);
  for (const id of newPeriodIds) combined.add(id);
  return maxConsecutiveOnDay(combined, teachingPeriods) > maxAllowed;
}

function countConsecutiveAtSlot(
  occupiedPeriodIds: Set<string>,
  newPeriodIds: string[],
  teachingPeriods: PeriodInfo[]
): number {
  const combined = new Set(occupiedPeriodIds);
  for (const id of newPeriodIds) combined.add(id);
  return maxConsecutiveOnDay(combined, teachingPeriods);
}

function emptyDayRecord(): Record<DayOfWeek, number> {
  return {
    [DayOfWeek.MONDAY]: 0,
    [DayOfWeek.TUESDAY]: 0,
    [DayOfWeek.WEDNESDAY]: 0,
    [DayOfWeek.THURSDAY]: 0,
    [DayOfWeek.FRIDAY]: 0,
  };
}

function buildTeacherSchedule(
  entries: EntryForWorkload[],
  nextById: Map<string, PeriodInfo | null>
) {
  const byTeacher = new Map<
    string,
    {
      name: string;
      dayPeriods: Map<DayOfWeek, Set<string>>;
      weekTotal: number;
    }
  >();

  for (const entry of entries) {
    if (!entry.teacherUserId) continue;
    let teacher = byTeacher.get(entry.teacherUserId);
    if (!teacher) {
      teacher = { name: entry.teacher.fullName, dayPeriods: new Map(), weekTotal: 0 };
      byTeacher.set(entry.teacherUserId, teacher);
    }
    const slots = getOccupiedPeriodIds(entry, nextById);
    for (const slot of slots) {
      const set = teacher.dayPeriods.get(slot.day) ?? new Set<string>();
      set.add(slot.periodId);
      teacher.dayPeriods.set(slot.day, set);
      teacher.weekTotal++;
    }
  }

  return byTeacher;
}

export function analyzeTeacherWorkload(
  entries: EntryForWorkload[],
  periods: PeriodInfo[]
): TeacherWorkloadResult {
  const { teachingPeriods, nextById } = buildPeriodMaps(periods);
  const teachingPeriodCount = teachingPeriods.length;
  const byTeacher = buildTeacherSchedule(entries, nextById);
  const teachers: TeacherWorkloadItem[] = [];

  for (const [teacherUserId, data] of byTeacher) {
    const periodsPerDay = emptyDayRecord();
    const freePeriodsPerDay = emptyDayRecord();
    const maxConsecutiveByDay: Partial<Record<DayOfWeek, number>> = {};
    const overloadedDays: DayOfWeek[] = [];
    const heavyDays: DayOfWeek[] = [];
    let maxConsecutivePeriods = 0;

    for (const day of DAY_ORDER) {
      const occupied = data.dayPeriods.get(day) ?? new Set<string>();
      const count = occupied.size;
      periodsPerDay[day] = count;
      freePeriodsPerDay[day] = Math.max(0, teachingPeriodCount - count);
      const consecutive = maxConsecutiveOnDay(occupied, teachingPeriods);
      maxConsecutiveByDay[day] = consecutive;
      maxConsecutivePeriods = Math.max(maxConsecutivePeriods, consecutive);

      if (count > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay) {
        overloadedDays.push(day);
      }
      if (count >= TEACHER_WORKLOAD_CONFIG.heavyDayThreshold) {
        heavyDays.push(day);
      }
    }

    const activeDays = DAY_ORDER.filter((d) => periodsPerDay[d] > 0);
    const averagePeriodsPerDay =
      activeDays.length > 0
        ? activeDays.reduce((sum, d) => sum + periodsPerDay[d], 0) / activeDays.length
        : 0;

    const dayLoads = activeDays.map((d) => periodsPerDay[d]);
    const maxDayLoad = dayLoads.length ? Math.max(...dayLoads) : 0;
    const minDayLoad = dayLoads.length ? Math.min(...dayLoads) : 0;
    const hasUnevenLoad =
      activeDays.length >= 2 && maxDayLoad - minDayLoad >= TEACHER_WORKLOAD_CONFIG.unevenLoadSpread;

    const isOverloadedWeekly =
      TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek > 0 &&
      data.weekTotal > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek;

    const isUnderloaded = data.weekTotal < TEACHER_WORKLOAD_CONFIG.underloadWeeklyThreshold;

    let warningCount = 0;
    if (isOverloadedWeekly) warningCount++;
    if (isUnderloaded) warningCount++;
    if (hasUnevenLoad) warningCount++;
    if (overloadedDays.length > 0) warningCount += overloadedDays.length;
    if (maxConsecutivePeriods > TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods) warningCount++;
    if (heavyDays.length > 0 && overloadedDays.length === 0) warningCount++;

    teachers.push({
      teacherUserId,
      teacherName: data.name,
      totalPeriodsPerWeek: data.weekTotal,
      periodsPerDay,
      maxConsecutivePeriods,
      maxConsecutiveByDay,
      freePeriodsPerDay,
      averagePeriodsPerDay: Math.round(averagePeriodsPerDay * 10) / 10,
      isOverloadedWeekly,
      isUnderloaded,
      hasUnevenLoad,
      overloadedDays,
      heavyDays,
      warningCount,
    });
  }

  teachers.sort((a, b) => b.warningCount - a.warningCount || b.totalPeriodsPerWeek - a.totalPeriodsPerWeek);

  const summary: TeacherWorkloadSummary = {
    overloadedTeacherCount: teachers.filter(
      (t) => t.overloadedDays.length > 0 || t.isOverloadedWeekly
    ).length,
    consecutiveWarningCount: teachers.filter(
      (t) => t.maxConsecutivePeriods > TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods
    ).length,
    heavyDayWarningCount: teachers.filter((t) => t.heavyDays.length > 0).length,
    unevenLoadCount: teachers.filter((t) => t.hasUnevenLoad).length,
    weeklyOverloadCount: teachers.filter((t) => t.isOverloadedWeekly).length,
    underloadCount: teachers.filter((t) => t.isUnderloaded).length,
    totalWarnings: 0,
  };
  summary.totalWarnings =
    summary.consecutiveWarningCount +
    summary.heavyDayWarningCount +
    summary.unevenLoadCount +
    summary.weeklyOverloadCount;

  return { summary, teachers };
}

export function buildTeacherWorkloadWarnings(
  entries: EntryForWorkload[],
  periods: PeriodInfo[]
): TimetableClash[] {
  const { teachingPeriods, nextById, firstTeaching, lastTeaching } = buildPeriodMaps(periods);
  const analysis = analyzeTeacherWorkload(entries, periods);
  const warnings: TimetableClash[] = [];
  const byTeacher = buildTeacherSchedule(entries, nextById);

  for (const teacher of analysis.teachers) {
    const schedule = byTeacher.get(teacher.teacherUserId);
    if (!schedule) continue;

    if (teacher.isOverloadedWeekly) {
      const sampleEntry = entries.find((e) => e.teacherUserId === teacher.teacherUserId);
      warnings.push({
        severity: "WARNING",
        type: "TEACHER_WEEKLY_OVERLOAD",
        dayOfWeek: sampleEntry?.dayOfWeek ?? DayOfWeek.MONDAY,
        periodId: sampleEntry?.periodId ?? "",
        periodLabel: sampleEntry?.period.label ?? "",
        entryId: sampleEntry?.id ?? "",
        conflictingEntryId: sampleEntry?.id ?? "",
        message: `${teacher.teacherName} has ${teacher.totalPeriodsPerWeek} periods this week (max recommended ${TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek})`,
      });
    }

    if (teacher.hasUnevenLoad) {
      const sampleEntry = entries.find((e) => e.teacherUserId === teacher.teacherUserId);
      const loads = DAY_ORDER.map((d) => `${d.slice(0, 3)}:${teacher.periodsPerDay[d]}`).join(", ");
      warnings.push({
        severity: "WARNING",
        type: "TEACHER_UNEVEN_LOAD",
        dayOfWeek: sampleEntry?.dayOfWeek ?? DayOfWeek.MONDAY,
        periodId: sampleEntry?.periodId ?? "",
        periodLabel: sampleEntry?.period.label ?? "",
        entryId: sampleEntry?.id ?? "",
        conflictingEntryId: sampleEntry?.id ?? "",
        message: `${teacher.teacherName} has uneven weekly load (${loads})`,
      });
    }

    if (teacher.isUnderloaded) {
      const sampleEntry = entries.find((e) => e.teacherUserId === teacher.teacherUserId);
      warnings.push({
        severity: "WARNING",
        type: "TEACHER_UNDERLOAD",
        dayOfWeek: sampleEntry?.dayOfWeek ?? DayOfWeek.MONDAY,
        periodId: sampleEntry?.periodId ?? "",
        periodLabel: sampleEntry?.period.label ?? "",
        entryId: sampleEntry?.id ?? "",
        conflictingEntryId: sampleEntry?.id ?? "",
        message: `${teacher.teacherName} has only ${teacher.totalPeriodsPerWeek} period(s) this week — may be underloaded`,
      });
    }

    for (const day of teacher.overloadedDays) {
      const dayEntries = entries.filter(
        (e) => e.teacherUserId === teacher.teacherUserId && e.dayOfWeek === day
      );
      for (const entry of dayEntries) {
        warnings.push({
          severity: "WARNING",
          type: "TEACHER_DAILY_OVERLOAD",
          dayOfWeek: day,
          periodId: entry.periodId,
          periodLabel: entry.period.label,
          entryId: entry.id,
          conflictingEntryId: entry.id,
          message: `${teacher.teacherName} exceeds daily limit on ${day}: ${teacher.periodsPerDay[day]} periods (max ${TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay})`,
        });
      }
    }

    if (
      teacher.maxConsecutivePeriods > TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods
    ) {
      for (const day of DAY_ORDER) {
        const consecutive = teacher.maxConsecutiveByDay[day] ?? 0;
        if (consecutive <= TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods) continue;
        const occupied = schedule.dayPeriods.get(day) ?? new Set<string>();
        for (const period of teachingPeriods) {
          if (!occupied.has(period.id)) continue;
          const entry = entries.find(
            (e) =>
              e.teacherUserId === teacher.teacherUserId &&
              e.dayOfWeek === day &&
              (e.periodId === period.id ||
                (e.isDoublePeriod && getOccupiedPeriodIds(e, nextById).some((s) => s.periodId === period.id)))
          );
          if (!entry) continue;
          warnings.push({
            severity: "WARNING",
            type: "TEACHER_CONSECUTIVE",
            dayOfWeek: day,
            periodId: period.id,
            periodLabel: period.label,
            entryId: entry.id,
            conflictingEntryId: entry.id,
            message: `${teacher.teacherName} has ${consecutive} consecutive periods on ${day} (max ${TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods})`,
          });
        }
      }
    }

    for (const day of teacher.heavyDays) {
      if (teacher.overloadedDays.includes(day)) continue;
      const dayEntries = entries.filter(
        (e) => e.teacherUserId === teacher.teacherUserId && e.dayOfWeek === day
      );
      for (const entry of dayEntries) {
        warnings.push({
          severity: "WARNING",
          type: "TEACHER_HEAVY_DAY",
          dayOfWeek: day,
          periodId: entry.periodId,
          periodLabel: entry.period.label,
          entryId: entry.id,
          conflictingEntryId: entry.id,
          message: `${teacher.teacherName} has a heavy day on ${day}: ${teacher.periodsPerDay[day]} periods`,
        });
      }
    }

    if (TEACHER_WORKLOAD_CONFIG.avoidFirstPeriod && firstTeaching) {
      for (const entry of entries.filter((e) => e.teacherUserId === teacher.teacherUserId)) {
        const slots = getOccupiedPeriodIds(entry, nextById);
        if (slots.some((s) => s.periodId === firstTeaching.id)) {
          warnings.push({
            severity: "WARNING",
            type: "TEACHER_FIRST_PERIOD",
            dayOfWeek: entry.dayOfWeek,
            periodId: firstTeaching.id,
            periodLabel: firstTeaching.label,
            entryId: entry.id,
            conflictingEntryId: entry.id,
            message: `${teacher.teacherName} is scheduled in first period on ${entry.dayOfWeek}`,
          });
        }
      }
    }

    if (TEACHER_WORKLOAD_CONFIG.avoidLastPeriod && lastTeaching) {
      for (const entry of entries.filter((e) => e.teacherUserId === teacher.teacherUserId)) {
        const slots = getOccupiedPeriodIds(entry, nextById);
        if (slots.some((s) => s.periodId === lastTeaching.id)) {
          warnings.push({
            severity: "WARNING",
            type: "TEACHER_LAST_PERIOD",
            dayOfWeek: entry.dayOfWeek,
            periodId: lastTeaching.id,
            periodLabel: lastTeaching.label,
            entryId: entry.id,
            conflictingEntryId: entry.id,
            message: `${teacher.teacherName} is scheduled in last period on ${entry.dayOfWeek}`,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.type}:${w.entryId}:${w.dayOfWeek}:${w.periodId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkEntryWorkloadImpact(
  entries: EntryForWorkload[],
  periods: PeriodInfo[],
  proposed: {
    dayOfWeek: DayOfWeek;
    periodId: string;
    teacherUserId: string;
    isDoublePeriod: boolean;
    excludeEntryId?: string;
  }
): string[] {
  const filtered = entries.filter((e) => e.id !== proposed.excludeEntryId);
  const { nextById, teachingPeriods, firstTeaching, lastTeaching } = buildPeriodMaps(periods);
  const newSlots = getOccupiedPeriodIds(
    {
      dayOfWeek: proposed.dayOfWeek,
      periodId: proposed.periodId,
      isDoublePeriod: proposed.isDoublePeriod,
    },
    nextById
  );
  const newPeriodIds = newSlots.map((s) => s.periodId);

  const teacherEntries = filtered.filter((e) => e.teacherUserId === proposed.teacherUserId);
  const dayOccupied = new Set<string>();
  let weekTotal = 0;

  for (const entry of teacherEntries) {
    const slots = getOccupiedPeriodIds(entry, nextById);
    for (const slot of slots) {
      weekTotal++;
      if (slot.day === proposed.dayOfWeek) {
        dayOccupied.add(slot.periodId);
      }
    }
  }

  const warnings: string[] = [];
  const dayTotal = dayOccupied.size + newPeriodIds.length;

  if (dayTotal > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay) {
    warnings.push(
      `This lesson would give the teacher ${dayTotal} periods on ${proposed.dayOfWeek} (max ${TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay}).`
    );
  } else if (dayTotal >= TEACHER_WORKLOAD_CONFIG.heavyDayThreshold) {
    warnings.push(
      `This lesson would make ${proposed.dayOfWeek} a heavy day (${dayTotal} periods).`
    );
  }

  const weekAfter = weekTotal + newPeriodIds.length;
  if (
    TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek > 0 &&
    weekAfter > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek
  ) {
    warnings.push(
      `This lesson would bring the teacher to ${weekAfter} periods this week (max recommended ${TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek}).`
    );
  }

  if (
    wouldExceedConsecutive(
      dayOccupied,
      newPeriodIds,
      teachingPeriods,
      TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods
    )
  ) {
    const consecutive = countConsecutiveAtSlot(dayOccupied, newPeriodIds, teachingPeriods);
    warnings.push(
      `This lesson would create ${consecutive} consecutive periods on ${proposed.dayOfWeek} (max ${TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods}).`
    );
  }

  if (TEACHER_WORKLOAD_CONFIG.avoidFirstPeriod && firstTeaching) {
    if (newPeriodIds.includes(firstTeaching.id)) {
      warnings.push(`This lesson is in the first period of the day.`);
    }
  }

  if (TEACHER_WORKLOAD_CONFIG.avoidLastPeriod && lastTeaching) {
    if (newPeriodIds.includes(lastTeaching.id)) {
      warnings.push(`This lesson is in the last period of the day.`);
    }
  }

  return warnings;
}

export function scoreTeacherWorkloadPlacement(input: {
  day: DayOfWeek;
  periodId: string;
  teacherId: string;
  isDouble: boolean;
  teacherDayCount: number;
  teacherWeekCount: number;
  dayOccupiedPeriodIds: Set<string>;
  teachingPeriods: PeriodInfo[];
  nextById: Map<string, PeriodInfo | null>;
  firstTeachingId: string | null;
  lastTeachingId: string | null;
}): number {
  let score = 0;
  const {
    day,
    periodId,
    isDouble,
    teacherDayCount,
    teacherWeekCount,
    dayOccupiedPeriodIds,
    teachingPeriods,
    nextById,
    firstTeachingId,
    lastTeachingId,
  } = input;

  const newPeriodIds = [periodId];
  if (isDouble) {
    const next = nextById.get(periodId);
    if (next) newPeriodIds.push(next.id);
  }

  score -= teacherDayCount * 12;
  score -= teacherWeekCount * 3;

  const dayAfter = teacherDayCount + newPeriodIds.length;
  if (dayAfter > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay) {
    score -= 80;
  } else if (dayAfter >= TEACHER_WORKLOAD_CONFIG.heavyDayThreshold) {
    score -= 25;
  }

  const weekAfter = teacherWeekCount + newPeriodIds.length;
  if (
    TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek > 0 &&
    weekAfter > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerWeek
  ) {
    score -= 40;
  }

  if (
    wouldExceedConsecutive(
      dayOccupiedPeriodIds,
      newPeriodIds,
      teachingPeriods,
      TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods
    )
  ) {
    score -= 50;
  } else {
    const consecutive = countConsecutiveAtSlot(dayOccupiedPeriodIds, newPeriodIds, teachingPeriods);
    if (consecutive >= TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods) {
      score -= 20;
    }
  }

  if (TEACHER_WORKLOAD_CONFIG.avoidFirstPeriod && firstTeachingId) {
    if (newPeriodIds.includes(firstTeachingId)) score -= 15;
  }
  if (TEACHER_WORKLOAD_CONFIG.avoidLastPeriod && lastTeachingId) {
    if (newPeriodIds.includes(lastTeachingId)) score -= 15;
  }

  const dayIndex = DAY_ORDER.indexOf(day);
  score -= dayIndex;

  return score;
}

export function isTeacherWorkloadClashType(type: string): boolean {
  return (
    type === "TEACHER_DAILY_OVERLOAD" ||
    type === "TEACHER_WEEKLY_OVERLOAD" ||
    type === "TEACHER_CONSECUTIVE" ||
    type === "TEACHER_HEAVY_DAY" ||
    type === "TEACHER_UNEVEN_LOAD" ||
    type === "TEACHER_FIRST_PERIOD" ||
    type === "TEACHER_LAST_PERIOD" ||
    type === "TEACHER_UNDERLOAD"
  );
}
