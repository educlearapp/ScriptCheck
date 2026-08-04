import type { LearnerScriptStatus } from "../types";

const MARKED_OR_BEYOND: LearnerScriptStatus[] = [
  "MARKED",
  "MODERATION",
  "MODERATED",
  "FINALISED",
  "SUBMITTED_TO_HOD",
  "HOD_REVIEW",
  "APPROVED",
];

const SUBMITTED_STATUSES: LearnerScriptStatus[] = [
  "SUBMITTED_TO_HOD",
  "HOD_REVIEW",
  "MODERATION",
];

export type BatchScriptRow = {
  id: string;
  status: LearnerScriptStatus;
  teacherTotal?: number | null;
  finalTotal?: number | null;
  flaggedForReview?: boolean;
};

export type BatchDashboardStats = {
  totalScripts: number;
  notStarted: number;
  inProgress: number;
  marked: number;
  submitted: number;
  averageMark: number | null;
  progressPercent: number;
  flaggedForReview: number;
  nextUnfinishedScriptId: string | null;
  allMarked: boolean;
};

export function isScriptFinishedForTeacher(status: LearnerScriptStatus): boolean {
  return MARKED_OR_BEYOND.includes(status);
}

export function computeBatchDashboardStats(scripts: BatchScriptRow[]): BatchDashboardStats {
  let notStarted = 0;
  let inProgress = 0;
  let marked = 0;
  let submitted = 0;
  let flaggedForReview = 0;
  const markValues: number[] = [];

  for (const s of scripts) {
    if (s.flaggedForReview) flaggedForReview++;
    const total = s.finalTotal ?? s.teacherTotal;
    if (typeof total === "number") markValues.push(total);

    if (SUBMITTED_STATUSES.includes(s.status)) {
      submitted++;
      marked++;
    } else if (MARKED_OR_BEYOND.includes(s.status)) {
      marked++;
    } else if (
      s.status === "MARKING" ||
      s.status === "IN_PROGRESS" ||
      s.status === "RETURNED_TO_TEACHER"
    ) {
      inProgress++;
    } else {
      notStarted++;
    }
  }

  const nextUnfinished =
    scripts.find((s) => !isScriptFinishedForTeacher(s.status))?.id ?? null;

  return {
    totalScripts: scripts.length,
    notStarted,
    inProgress,
    marked,
    submitted,
    averageMark: markValues.length
      ? Math.round((markValues.reduce((a, b) => a + b, 0) / markValues.length) * 10) / 10
      : null,
    progressPercent:
      scripts.length > 0
        ? Math.round((marked / scripts.length) * 1000) / 10
        : 0,
    flaggedForReview,
    nextUnfinishedScriptId: nextUnfinished,
    allMarked: scripts.length > 0 && scripts.every((s) => isScriptFinishedForTeacher(s.status)),
  };
}
