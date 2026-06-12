import type { TimetableRoom, TimetableRoomType, WorkspaceSubject } from "../../types";

export function getPreferredRoomType(subject: { name: string; code: string }): TimetableRoomType {
  const text = `${subject.name} ${subject.code}`.toLowerCase();

  if (/physical science|life science|natural science|\bscience\b/.test(text)) {
    return "LAB";
  }
  if (
    /\bcat\b|computer application|computer applications|\bit\b|information technology|\btechnology\b/.test(
      text
    )
  ) {
    return "COMPUTER_LAB";
  }
  if (/\bpe\b|physical education|\bsport\b|\bsports\b/.test(text)) {
    return "SPORTS";
  }
  if (/assembly|\bhall\b|choir|ensemble|orchestra/.test(text)) {
    return "HALL";
  }

  return "CLASSROOM";
}

export function formatRoomType(type: TimetableRoomType): string {
  return type.replace(/_/g, " ");
}

export function isRoomTypeMatch(
  preferred: TimetableRoomType,
  actual: TimetableRoomType
): boolean {
  if (preferred === actual) return true;
  if (actual === "OTHER") return true;
  return false;
}

export function getRoomSelectionWarnings(input: {
  room: TimetableRoom | undefined;
  subject: WorkspaceSubject | undefined;
  learnerCount: number;
}): string[] {
  const warnings: string[] = [];
  const { room, subject, learnerCount } = input;
  if (!room || !subject) return warnings;

  if (learnerCount > 0 && room.capacity < learnerCount) {
    warnings.push(
      `${room.code} capacity (${room.capacity}) is below class size (${learnerCount} learners).`
    );
  }

  const preferred = getPreferredRoomType(subject);
  if (!isRoomTypeMatch(preferred, room.roomType)) {
    warnings.push(
      `${subject.code} prefers a ${formatRoomType(preferred)} but ${room.code} is ${formatRoomType(room.roomType)}.`
    );
  }

  return warnings;
}

export function isRoomIssueClashType(type: string): boolean {
  return type === "MISSING_ROOM" || type === "ROOM_CAPACITY" || type === "ROOM_TYPE_MISMATCH";
}
