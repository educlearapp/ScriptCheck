import type { PaperVaultAuditEntry } from "../../types";

const ACTION_LABELS: Record<string, string> = {
  PAPER_UPLOADED: "Paper uploaded",
  PAPER_UPDATED: "New version uploaded",
  PAPER_SUBMITTED_FOR_REVIEW: "Submitted for review",
  PAPER_RETURNED_FOR_CHANGES: "Returned for changes",
  PAPER_APPROVED: "Approved",
  PAPER_LOCKED: "Locked",
  PAPER_RELEASED: "Released",
  PAPER_ARCHIVED: "Archived",
  PAPER_DOWNLOADED: "Downloaded",
  PAPER_DOWNLOAD_BLOCKED: "Download blocked",
};

type Props = {
  entries: PaperVaultAuditEntry[];
  loading?: boolean;
};

export default function PaperAuditTimeline({ entries, loading }: Props) {
  if (loading) {
    return <p className="sc-script-empty">Loading audit timeline…</p>;
  }

  if (entries.length === 0) {
    return <p className="sc-script-empty">No paper vault events yet.</p>;
  }

  return (
    <ul className="sc-audit-timeline">
      {entries.map((entry) => {
        const meta = entry.metadata ?? {};
        const detail =
          typeof meta.fileName === "string"
            ? meta.fileName
            : typeof meta.reason === "string"
              ? meta.reason
              : typeof meta.comment === "string"
                ? meta.comment
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
