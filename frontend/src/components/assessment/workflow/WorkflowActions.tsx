import { useState } from "react";
import { apiFetch } from "../../../api";
import { usePermissions } from "../../../hooks/usePermissions";
import ModerationEscalateModal from "../../../pages/moderation/shared/ModerationEscalateModal";
import ModerationReturnModal from "../../../pages/moderation/shared/ModerationReturnModal";
import type { WorkspaceRole } from "../../../types";
import "../../../pages/moderation/ModerationWorkflow.css";

type Props = {
  availableActions: string[];
  transitioning: boolean;
  error?: string;
  onAction: (action: string, comment?: string) => Promise<boolean>;
  onSuccess?: () => void;
  assessmentId?: string;
  assessmentTitle?: string;
  onEscalated?: () => void;
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
  assessmentId,
  assessmentTitle,
  onEscalated,
}: Props) {
  const { hasRole, hasAnyRole, can } = usePermissions();
  const [comment, setComment] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState("");

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

  const showEscalate =
    !!assessmentId &&
    can("moderation.request_approval") &&
    (roleFilteredActions.includes("approve") || roleFilteredActions.includes("return"));

  async function handleAction(action: string) {
    if (action === "return") {
      setShowReturnModal(true);
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
      setShowReturnModal(false);
      onSuccess?.();
    }
  }

  async function handleEscalate() {
    if (!assessmentId) return;
    setEscalating(true);
    setEscalateError("");
    try {
      await apiFetch(`/moderation-trail/assessments/${assessmentId}/approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          assignedRole: escalateRole,
          comment: escalateComment.trim() || undefined,
        }),
      });
      setShowEscalateModal(false);
      setEscalateComment("");
      onEscalated?.();
      onSuccess?.();
    } catch (err) {
      setEscalateError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setEscalating(false);
    }
  }

  if (roleFilteredActions.length === 0 && !showEscalate) {
    return (
      <p className="sc-muted" style={{ margin: 0 }}>
        No workflow actions available for your role at this stage.
      </p>
    );
  }

  return (
    <div className="sc-workflow-actions">
      {error ? <p className="sc-error">{error}</p> : null}
      {escalateError ? <p className="sc-error">{escalateError}</p> : null}

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
        {showEscalate ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-mod-table-btn-escalate"
            disabled={transitioning || escalating}
            onClick={() => {
              setEscalateRole("MODERATOR");
              setEscalateComment("");
              setEscalateError("");
              setShowEscalateModal(true);
            }}
          >
            Escalate
          </button>
        ) : null}
      </div>

      <ModerationReturnModal
        open={showReturnModal}
        itemName={assessmentTitle ?? "Assessment"}
        comment={comment}
        onCommentChange={setComment}
        busy={transitioning}
        onConfirm={() => void handleReturn()}
        onCancel={() => {
          setShowReturnModal(false);
          setComment("");
        }}
        confirmLabel="Confirm Return"
        placeholder="Explain what changes are needed…"
      />

      <ModerationEscalateModal
        open={showEscalateModal}
        itemName={assessmentTitle ?? "Assessment"}
        role={escalateRole}
        onRoleChange={setEscalateRole}
        comment={escalateComment}
        onCommentChange={setEscalateComment}
        busy={escalating}
        onConfirm={() => void handleEscalate()}
        onCancel={() => {
          setShowEscalateModal(false);
          setEscalateComment("");
        }}
      />
    </div>
  );
}
