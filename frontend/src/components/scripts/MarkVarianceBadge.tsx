import type { ModerationVarianceLevel } from "../../types";

const LABELS: Record<ModerationVarianceLevel, string> = {
  NONE: "No moderation",
  OK: "Within tolerance",
  WARNING: "Warning (>5%)",
  SIGNIFICANT: "Significant (>10%)",
  CRITICAL: "Critical (>15%)",
};

type Props = {
  level: ModerationVarianceLevel;
  variancePercent?: number | null;
  compact?: boolean;
};

export default function MarkVarianceBadge({ level, variancePercent, compact }: Props) {
  if (level === "NONE") return null;

  return (
    <span
      className={`sc-variance-badge sc-variance-${level.toLowerCase()}`}
      title={LABELS[level]}
    >
      {compact ? level : `${LABELS[level]}${variancePercent != null ? ` · ${variancePercent}%` : ""}`}
    </span>
  );
}
