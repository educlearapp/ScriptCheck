import type { DayOfWeek, LessonEntry, PeriodDefinition } from "../../types";
import { DAYS } from "./timetableUtils";

export const TEACHER_WORKLOAD_CONFIG = {
  maxPeriodsPerDay: 6,
  maxConsecutivePeriods: 4,
  maxPeriodsPerWeek: 25,
  avoidFirstPeriod: false,
  avoidLastPeriod: false,
  heavyDayThreshold: 5,
  unevenLoadSpread: 3,
  underloadWeeklyThreshold: 8,
};

type PeriodInfo = Pick<PeriodDefinition, "id" | "periodOrder" | "label" | "periodType" | "doublePeriodCapable">;

function buildPeriodMaps(periods: PeriodInfo[]) {
  const sorted = [...periods].sort((a, b) => a.periodOrder - b.periodOrder);
  const nextById = new Map<string, PeriodInfo | null>();
  for (let i = 0; i < sorted.length; i++) {
    nextById.set(sorted[i].id, sorted[i + 1] ?? null);
  }
  const teachingPeriods = sorted.filter((p) => p.periodType === "TEACHING");
  const firstTeaching = teachingPeriods[0] ?? null;
  const lastTeaching = teachingPeriods[teachingPeriods.length - 1] ?? null;
  return { nextById, teachingPeriods, firstTeaching, lastTeaching };
}

function getOccupiedPeriodIds(
  entry: { dayOfWeek: DayOfWeek; periodId: string; isDoublePeriod: boolean },
  nextById: Map<string, PeriodInfo | null>
) {
  const slots = [{ day: entry.dayOfWeek, periodId: entry.periodId }];
  if (entry.isDoublePeriod) {
    const next = nextById.get(entry.periodId);
    if (next) slots.push({ day: entry.dayOfWeek, periodId: next.id });
  }
  return slots;
}

function maxConsecutiveOnDay(occupiedPeriodIds: Set<string>, teachingPeriods: PeriodInfo[]) {
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
) {
  const combined = new Set(occupiedPeriodIds);
  for (const id of newPeriodIds) combined.add(id);
  return maxConsecutiveOnDay(combined, teachingPeriods) > maxAllowed;
}

function countConsecutiveAtSlot(
  occupiedPeriodIds: Set<string>,
  newPeriodIds: string[],
  teachingPeriods: PeriodInfo[]
) {
  const combined = new Set(occupiedPeriodIds);
  for (const id of newPeriodIds) combined.add(id);
  return maxConsecutiveOnDay(combined, teachingPeriods);
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

export function getTeacherSelectionWorkloadWarnings(input: {
  periods: PeriodDefinition[];
  teacherEntries: LessonEntry[];
  dayOfWeek: DayOfWeek;
  periodId: string;
  teacherUserId: string;
  isDoublePeriod: boolean;
  excludeEntryId?: string;
}): string[] {
  const { periods, teacherEntries, excludeEntryId } = input;
  if (!input.teacherUserId) return [];

  const filtered = teacherEntries.filter((e) => e.id !== excludeEntryId);
  const { nextById, teachingPeriods, firstTeaching, lastTeaching } = buildPeriodMaps(periods);
  const newSlots = getOccupiedPeriodIds(
    {
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
      isDoublePeriod: input.isDoublePeriod,
    },
    nextById
  );
  const newPeriodIds = newSlots.map((s) => s.periodId);

  const dayOccupied = new Set<string>();
  let weekTotal = 0;

  for (const entry of filtered) {
    const slots = getOccupiedPeriodIds(entry, nextById);
    for (const slot of slots) {
      weekTotal++;
      if (slot.day === input.dayOfWeek) {
        dayOccupied.add(slot.periodId);
      }
    }
  }

  const warnings: string[] = [];
  const dayTotal = dayOccupied.size + newPeriodIds.length;

  if (dayTotal > TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay) {
    warnings.push(
      `This lesson would give the teacher ${dayTotal} periods on ${input.dayOfWeek} (max ${TEACHER_WORKLOAD_CONFIG.maxPeriodsPerDay}).`
    );
  } else if (dayTotal >= TEACHER_WORKLOAD_CONFIG.heavyDayThreshold) {
    warnings.push(`This lesson would make ${input.dayOfWeek} a heavy day (${dayTotal} periods).`);
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
      `This lesson would create ${consecutive} consecutive periods on ${input.dayOfWeek} (max ${TEACHER_WORKLOAD_CONFIG.maxConsecutivePeriods}).`
    );
  }

  if (TEACHER_WORKLOAD_CONFIG.avoidFirstPeriod && firstTeaching) {
    if (newPeriodIds.includes(firstTeaching.id)) {
      warnings.push("This lesson is in the first period of the day.");
    }
  }

  if (TEACHER_WORKLOAD_CONFIG.avoidLastPeriod && lastTeaching) {
    if (newPeriodIds.includes(lastTeaching.id)) {
      warnings.push("This lesson is in the last period of the day.");
    }
  }

  return warnings;
}

export function formatDayLoads(periodsPerDay: Partial<Record<DayOfWeek, number>>): string {
  return DAYS.map((d) => `${d.slice(0, 3)}: ${periodsPerDay[d] ?? 0}`).join(" · ");
}
