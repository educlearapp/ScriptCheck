import type { DayOfWeek, LessonEntry, PeriodDefinition, TimetableClash } from "../../types";

export const DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
};

export function entryKey(day: DayOfWeek, periodId: string) {
  return `${day}:${periodId}`;
}

export function buildEntryMap(entries: LessonEntry[]) {
  const map = new Map<string, LessonEntry>();
  for (const entry of entries) {
    map.set(entryKey(entry.dayOfWeek, entry.periodId), entry);
  }
  return map;
}

export function clashesForCell(
  clashes: TimetableClash[],
  day: DayOfWeek,
  periodId: string
) {
  return clashes.filter((c) => c.dayOfWeek === day && c.periodId === periodId);
}

export function sortPeriods(periods: PeriodDefinition[]) {
  return [...periods].sort((a, b) => a.periodOrder - b.periodOrder);
}
