import type { WorkflowStage } from "../../../types/phase2";

const STAGE_COLORS: Record<string, string> = {
  draft: "muted",
  under_review: "warning",
  moderation: "gold",
  approved: "success",
  published: "success",
  archived: "muted",
};

type Props = {
  stage: WorkflowStage | null;
  fallbackStatus?: string;
};

export default function WorkflowStageBadge({ stage, fallbackStatus }: Props) {
  const label = stage?.label ?? fallbackStatus?.replaceAll("_", " ") ?? "Unknown";
  const tone = stage ? STAGE_COLORS[stage.key] ?? "muted" : "muted";

  return <span className={`sc-badge sc-badge-${tone}`}>{label}</span>;
}
