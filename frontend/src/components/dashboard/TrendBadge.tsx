import type { TrendDirection } from "../../types";

const LABELS: Record<TrendDirection, string> = {
  improving: "Improving",
  stable: "Stable",
  declining: "Declining",
};

const CLASSES: Record<TrendDirection, string> = {
  improving: "sc-badge sc-badge-success",
  stable: "sc-badge sc-badge-muted",
  declining: "sc-badge sc-badge-warning",
};

export default function TrendBadge({ trend }: { trend: TrendDirection }) {
  return <span className={CLASSES[trend]}>{LABELS[trend]}</span>;
}
