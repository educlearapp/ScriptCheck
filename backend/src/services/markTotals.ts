import { ModerationVarianceLevel } from "@prisma/client";

export type ComputedMarkTotals = {
  teacherTotal: number;
  hodTotal: number | null;
  finalTotal: number;
  markDifference: number | null;
  teacherPercentage: number | null;
  hodPercentage: number | null;
  finalPercentage: number | null;
  moderationVariancePercent: number | null;
  varianceLevel: ModerationVarianceLevel;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calculateVarianceLevel(
  variancePercent: number | null
): ModerationVarianceLevel {
  if (variancePercent == null) return ModerationVarianceLevel.NONE;
  if (variancePercent <= 5) return ModerationVarianceLevel.OK;
  if (variancePercent <= 10) return ModerationVarianceLevel.WARNING;
  if (variancePercent <= 15) return ModerationVarianceLevel.SIGNIFICANT;
  return ModerationVarianceLevel.CRITICAL;
}

export function computeMarkTotals(
  teacherTotal: number,
  hodTotal: number | null,
  finalTotal: number,
  assessmentTotalMarks: number
): ComputedMarkTotals {
  const teacherPercentage =
    assessmentTotalMarks > 0
      ? round1((teacherTotal / assessmentTotalMarks) * 100)
      : null;

  const hodPercentage =
    hodTotal != null && assessmentTotalMarks > 0
      ? round1((hodTotal / assessmentTotalMarks) * 100)
      : null;

  const finalPercentage =
    assessmentTotalMarks > 0
      ? round1((finalTotal / assessmentTotalMarks) * 100)
      : null;

  const markDifference = hodTotal != null ? round1(hodTotal - teacherTotal) : null;

  const moderationVariancePercent =
    hodTotal != null && assessmentTotalMarks > 0
      ? round1((Math.abs(hodTotal - teacherTotal) / assessmentTotalMarks) * 100)
      : null;

  const varianceLevel = calculateVarianceLevel(moderationVariancePercent);

  return {
    teacherTotal,
    hodTotal,
    finalTotal,
    markDifference,
    teacherPercentage,
    hodPercentage,
    finalPercentage,
    moderationVariancePercent,
    varianceLevel,
  };
}

export const VARIANCE_COLORS: Record<ModerationVarianceLevel, string> = {
  NONE: "#888888",
  OK: "#3ecf8e",
  WARNING: "#f0ad4e",
  SIGNIFICANT: "#ff8c42",
  CRITICAL: "#ff6b6b",
};

export const VARIANCE_LABELS: Record<ModerationVarianceLevel, string> = {
  NONE: "No moderation",
  OK: "Within tolerance",
  WARNING: "Warning (>5%)",
  SIGNIFICANT: "Significant (>10%)",
  CRITICAL: "Critical (>15%)",
};
