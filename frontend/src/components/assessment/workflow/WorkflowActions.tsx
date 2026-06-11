import { useState } from "react";
import { usePermissions } from "../../../hooks/usePermissions";

type Props = {
  availableActions: string[];
  transitioning: boolean;
  error?: string;
  onAction: (action: string, comment?: string) => Promise<boolean>;
  onSuccess?: () => void;
};

const ACTION_LABELS: Record<string, string> = {
  submit: "Submit for Review",
  approve: "Approve",
  return: "Return",
  publish: "Publish",
  archive: "Archive",
};

const ACTION_API_MAP: Record<string, string> = {
  submit: "SUBMIT",
  approve: "APPROVE",
  return: "RETURN",
  publish: "PUBLISH",
  archive: "ARCHIVE",
};

export default function WorkflowActions({
  availableActions,
  transitioning,
  error,
  onAction,
  onSuccess,
}: Props) {
  const { hasRole, hasAnyRole } = usePermissions();
  const [comment, setComment] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);

  const roleFilteredActions = availableActions.filter((action) => {
    if (action === "submit") {
      return hasRole("TEACHER") || hasAnyRole(["HOD", "PRINCIPAL"]);
    }
    if (action === "approve" || action === "return") {
      if (hasAnyRole(["HOD", "MODERATOR", "PRINCIPAL", "EXAMINATION_BODY", "EXAM_BODY_ADMIN"])) {
        return true;
      }
    }
    if (action === "publish") {
      return hasAnyRole(["EXAMINATION_BODY", "EXAM_BODY_ADMIN", "PRINCIPAL", "HOD"]);
    }
    if (action === "archive") {
      return hasAnyRole(["SCHOOL_OWNER", "SCHOOL_ADMIN", "PRINCIPAL"]);
    }
    return true;
  });

  async function handleAction(action: string) {
    if (action === "return") {
      setShowReturnForm(true);
      return;
    }
    const ok = await onAction(ACTION_API_MAP[action]);
    if (ok) {
      setComment("");
      onSuccess?.();
    }
  }

  async function handleReturn() {
    if (!comment.trim()) return;
    const ok = await onAction("RETURN", comment.trim());
    if (ok) {
      setComment("");
      setShowReturnForm(false);
      onSuccess?.();
    }
  }

  if (roleFilteredActions.length === 0) {
    return (
      <p className="sc-muted" style={{ margin: 0 }}>
        No workflow actions available for your role at this stage.
      </p>
    );
  }

  return (
    <div className="sc-workflow-actions">
      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-form-actions" style={{ marginTop: 0 }}>
        {roleFilteredActions.map((action) => (
          <button
            key={action}
            type="button"
            className={action === "submit" || action === "publish" ? "sc-btn sc-btn-primary" : "sc-btn sc-btn-ghost"}
            disabled={transitioning}
            onClick={() => void handleAction(action)}
          >
            {transitioning ? "Processing…" : ACTION_LABELS[action] ?? action}
          </button>
        ))}
      </div>

      {showReturnForm ? (
        <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
          <label className="sc-label">Return comment (required)</label>
          <textarea
            className="sc-input"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain what changes are needed…"
          />
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={transitioning || !comment.trim()}
              onClick={() => void handleReturn()}
            >
              Confirm Return
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setShowReturnForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
