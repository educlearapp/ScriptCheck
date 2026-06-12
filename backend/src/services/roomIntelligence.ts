import { DayOfWeek, TimetableRoomType } from "@prisma/client";
import type { TimetableClash } from "./lessonTimetable";

export const ROOM_INTELLIGENCE_CONFIG = {
  capacity: {
    draftMode: "warn" as "warn" | "block",
    publishMode: "warn" as "warn" | "block",
  },
  roomType: {
    draftMode: "warn" as "warn" | "block",
    publishMode: "warn" as "warn" | "block",
  },
};

export type RoomInfo = {
  id: string;
  code: string;
  name: string;
  roomType: TimetableRoomType;
  capacity: number;
};

export type SubjectInfo = {
  name: string;
  code: string;
};

export type RoomUtilisationItem = {
  roomId: string;
  roomCode: string;
  roomName: string;
  scheduledSlots: number;
  totalTeachingSlots: number;
  utilisationPercent: number;
};

export type RoomIntelligenceSummary = {
  underCapacityCount: number;
  roomTypeMismatchCount: number;
  missingRoomCount: number;
};

type EntryForRoomCheck = {
  id: string;
  dayOfWeek: DayOfWeek;
  periodId: string;
  period: { label: string };
  schoolClassId: string;
  schoolClass: { code: string; learnerCount?: number };
  subject: SubjectInfo;
  roomId: string | null;
  room: { id: string; code: string; roomType?: TimetableRoomType; capacity?: number } | null;
};

export function getPreferredRoomType(subject: SubjectInfo): TimetableRoomType {
  const text = `${subject.name} ${subject.code}`.toLowerCase();

  if (
    /physical science|life science|natural science|\bscience\b/.test(text)
  ) {
    return TimetableRoomType.LAB;
  }
  if (
    /\bcat\b|computer application|computer applications|\bit\b|information technology|\btechnology\b/.test(
      text
    )
  ) {
    return TimetableRoomType.COMPUTER_LAB;
  }
  if (/\bpe\b|physical education|\bsport\b|\bsports\b/.test(text)) {
    return TimetableRoomType.SPORTS;
  }
  if (/assembly|\bhall\b|choir|ensemble|orchestra/.test(text)) {
    return TimetableRoomType.HALL;
  }

  return TimetableRoomType.CLASSROOM;
}

export function formatRoomType(type: TimetableRoomType): string {
  return type.replace(/_/g, " ");
}

export function isRoomTypeMatch(
  preferred: TimetableRoomType,
  actual: TimetableRoomType
): boolean {
  if (preferred === actual) return true;
  if (actual === TimetableRoomType.OTHER) return true;
  return false;
}

export function scoreRoomPlacement(
  room: RoomInfo | null,
  subject: SubjectInfo,
  learnerCount: number
): number {
  if (!room) return 0;

  let score = 5;

  const preferred = getPreferredRoomType(subject);
  if (isRoomTypeMatch(preferred, room.roomType)) {
    score += 20;
  } else {
    score -= 15;
  }

  if (room.capacity >= learnerCount) {
    score += 10;
  } else if (learnerCount > 0) {
    score -= 20;
  }

  return score;
}

export function buildRoomCapacityWarnings(
  entries: EntryForRoomCheck[],
  classLearnerCounts: Map<string, number>,
  roomsById: Map<string, RoomInfo>
): TimetableClash[] {
  const warnings: TimetableClash[] = [];

  for (const entry of entries) {
    if (!entry.roomId || !entry.room) continue;

    const room = roomsById.get(entry.roomId);
    if (!room) continue;

    const learnerCount =
      entry.schoolClass.learnerCount ?? classLearnerCounts.get(entry.schoolClassId) ?? 0;
    if (learnerCount <= 0) continue;

    if (room.capacity < learnerCount) {
      warnings.push({
        severity: "WARNING",
        type: "ROOM_CAPACITY",
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.periodId,
        periodLabel: entry.period.label,
        entryId: entry.id,
        conflictingEntryId: entry.id,
        message: `Room too small: ${entry.room.code} (capacity ${room.capacity}) for ${entry.schoolClass.code} (${learnerCount} learners) — ${entry.subject.code} on ${entry.dayOfWeek} ${entry.period.label}`,
      });
    }
  }

  return warnings;
}

export function buildRoomTypeMismatchWarnings(
  entries: EntryForRoomCheck[],
  roomsById: Map<string, RoomInfo>
): TimetableClash[] {
  const warnings: TimetableClash[] = [];

  for (const entry of entries) {
    if (!entry.roomId || !entry.room) continue;

    const room = roomsById.get(entry.roomId);
    if (!room) continue;

    const preferred = getPreferredRoomType(entry.subject);
    if (isRoomTypeMatch(preferred, room.roomType)) continue;

    warnings.push({
      severity: "WARNING",
      type: "ROOM_TYPE_MISMATCH",
      dayOfWeek: entry.dayOfWeek,
      periodId: entry.periodId,
      periodLabel: entry.period.label,
      entryId: entry.id,
      conflictingEntryId: entry.id,
      message: `Room type mismatch: ${entry.subject.code} prefers ${formatRoomType(preferred)} but ${entry.room.code} is ${formatRoomType(room.roomType)} — ${entry.schoolClass.code} on ${entry.dayOfWeek} ${entry.period.label}`,
    });
  }

  return warnings;
}

export function computeRoomUtilisation(
  entries: Array<{ roomId: string | null; isDoublePeriod: boolean }>,
  rooms: RoomInfo[],
  teachingPeriodCount: number
): RoomUtilisationItem[] {
  const totalTeachingSlots = teachingPeriodCount * 5;
  const scheduledByRoom = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.roomId) continue;
    const weight = entry.isDoublePeriod ? 2 : 1;
    scheduledByRoom.set(entry.roomId, (scheduledByRoom.get(entry.roomId) ?? 0) + weight);
  }

  return rooms.map((room) => {
    const scheduledSlots = scheduledByRoom.get(room.id) ?? 0;
    const utilisationPercent =
      totalTeachingSlots > 0
        ? Math.round((scheduledSlots / totalTeachingSlots) * 100)
        : 0;
    return {
      roomId: room.id,
      roomCode: room.code,
      roomName: room.name,
      scheduledSlots,
      totalTeachingSlots,
      utilisationPercent,
    };
  });
}

export function buildRoomIntelligenceWarnings(
  entries: EntryForRoomCheck[],
  classLearnerCounts: Map<string, number>,
  roomsById: Map<string, RoomInfo>
): TimetableClash[] {
  return [
    ...buildRoomCapacityWarnings(entries, classLearnerCounts, roomsById),
    ...buildRoomTypeMismatchWarnings(entries, roomsById),
  ];
}

export function summarizeRoomIntelligence(
  entries: EntryForRoomCheck[],
  warnings: TimetableClash[]
): RoomIntelligenceSummary {
  return {
    underCapacityCount: warnings.filter((w) => w.type === "ROOM_CAPACITY").length,
    roomTypeMismatchCount: warnings.filter((w) => w.type === "ROOM_TYPE_MISMATCH").length,
    missingRoomCount: entries.filter((e) => !e.roomId).length,
  };
}
