import type { WorkspaceRole } from "../../../types";
import { ESCALATE_ROLES } from "./escalateRoles";

type Props = {
  open: boolean;
  itemName: string;
  role: WorkspaceRole;
  onRoleChange: (role: WorkspaceRole) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ModerationEscalateModal({
  open,
  itemName,
  role,
  onRoleChange,
  comment,
  onCommentChange,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="sc-mod-modal-overlay" onClick={onCancel}>
      <div className="sc-mod-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Escalate for Approval</h2>
        <p className="sc-mod-hint sc-mod-modal-subtitle">{itemName}</p>
        <label className="sc-mod-field">
          Escalate to
          <select
            className="sc-input"
            value={role}
            onChange={(e) => onRoleChange(e.target.value as WorkspaceRole)}
          >
            {ESCALATE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sc-mod-field">
          Reason (optional)
          <textarea
            className="sc-input"
            rows={3}
            placeholder="Reason for escalation…"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </label>
        <div className="sc-mod-modal-actions">
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-mod-table-btn-escalate"
            disabled={busy}
            onClick={onConfirm}
          >
            Send Escalation
          </button>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
