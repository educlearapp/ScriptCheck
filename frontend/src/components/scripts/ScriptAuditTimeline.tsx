import type { ScriptAuditEntry } from "../../types";

const ACTION_LABELS: Record<string, string> = {
  SCRIPT_PAGE_UPLOADED: "Pages uploaded",
  SCRIPT_ANNOTATION_CREATED: "Note added on page",
  SCRIPT_ANNOTATION_UPDATED: "Note updated",
  SCRIPT_MARK_SAVED: "Marks saved",
  SCRIPT_MARK_CAPTURED: "Marks saved",
  SCRIPT_MARK_UPDATED: "Marks updated",
  SCRIPT_VARIANCE_FLAGGED: "Mark difference flagged",
  SCRIPT_MARKED_COMPLETE: "Learner finished",
  SCRIPT_STATUS_CHANGED: "Progress updated",
  SCRIPT_LAYER_LOCKED: "Editing locked",
  SCRIPT_LAYER_UNLOCKED: "Editing unlocked",
  SCRIPT_FINALISED: "Paper locked",
  SCRIPT_BATCH_SUBMITTED_TO_HOD: "Sent to Department Head",
  SCRIPT_BATCH_APPROVED: "Approved by Department Head",
  SCRIPT_BATCH_RETURNED: "Returned to teacher",
  LEARNER_SCRIPT_CREATED: "Learner paper created",
  EXAM_SESSION_STARTED: "Exam session started",
  EXAM_DEVICE_REGISTERED: "Device registered",
  EXAM_DEVICE_SESSION_ENDED: "Device session ended",
};

type Props = {
  entries: ScriptAuditEntry[];
  loading?: boolean;
};

export default function ScriptAuditTimeline({ entries, loading }: Props) {
  if (loading) {
    return <p className="sc-script-empty">Loading history…</p>;
  }

  if (entries.length === 0) {
    return <p className="sc-script-empty">No history yet.</p>;
  }

  return (
    <ul className="sc-audit-timeline">
      {entries.map((entry) => {
        const meta = entry.metadata ?? {};
        const detail =
          typeof meta.toStatus === "string"
            ? `→ ${meta.toStatus}`
            : typeof meta.varianceLevel === "string"
              ? `${meta.varianceLevel}${meta.moderationVariancePercent != null ? ` (${meta.moderationVariancePercent}%)` : ""}`
              : typeof meta.layer === "string"
                ? meta.layer
                : typeof meta.reason === "string"
                  ? meta.reason
                  : null;

        return (
          <li key={entry.id} className="sc-audit-entry">
            <div className="sc-audit-entry-header">
              <span className="sc-audit-action">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
              <span className="sc-audit-time">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="sc-audit-meta">
              {entry.actor?.fullName ?? "System"}
              {detail ? ` · ${detail}` : ""}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
