import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../../api";
import { usePermissions } from "../../../hooks/usePermissions";
import ModerationEscalateModal from "../../../pages/moderation/shared/ModerationEscalateModal";
import { getModerationReviewPath } from "../../../pages/moderation/shared/moderationReviewLink";
import type { WorkspaceRole } from "../../../types";
import "../../../pages/moderation/ModerationWorkflow.css";
import "./AssessmentModerationTab.css";

type ModerationTrail = {
  comments: Array<{
    id: string;
    body: string;
    type: string;
    resolved: boolean;
    author: { fullName: string };
    createdAt: string;
  }>;
  approvalRequests: Array<{
    id: string;
    status: string;
    assignedRole: string;
    comment: string | null;
    requestedBy: { fullName: string };
  }>;
  auditTrail: Array<{
    id: string;
    action: string;
    comment: string | null;
    performedBy: { fullName: string };
    createdAt: string;
  }>;
};

type Props = {
  assessmentId: string;
  assessmentTitle?: string;
  batchId?: string | null;
};

export default function AssessmentModerationTab({
  assessmentId,
  assessmentTitle = "Assessment",
  batchId,
}: Props) {
  const { can } = usePermissions();
  const [trail, setTrail] = useState<ModerationTrail | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ModerationTrail>(
        `/moderation-trail/assessments/${assessmentId}/trail`
      );
      setTrail(data);
    } catch {
      setTrail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [assessmentId]);

  async function addComment() {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/moderation-trail/assessments/${assessmentId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEscalate() {
    setEscalating(true);
    setActionError("");
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
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setEscalating(false);
    }
  }

  const reviewPath = getModerationReviewPath({ assessmentId, batchId });

  if (loading) return <p>Loading moderation trail…</p>;
  if (!trail) return <p className="sc-muted">Moderation data unavailable.</p>;

  return (
    <div className="sc-moderation-tab">
      <div className="sc-moderation-tab-actions">
        <Link to={reviewPath} className="sc-btn sc-btn-ghost sc-mod-table-btn">
          {batchId ? "Open batch analytics" : "Open assessment"}
        </Link>
        {can("moderation.request_approval") ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-mod-table-btn sc-mod-table-btn-escalate"
            onClick={() => {
              setEscalateRole("MODERATOR");
              setEscalateComment("");
              setActionError("");
              setShowEscalateModal(true);
            }}
          >
            Escalate
          </button>
        ) : null}
      </div>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      {can("moderation.comment") ? (
        <div className="sc-card sc-card-padded sc-moderation-tab-section">
          <h3>Add Comment</h3>
          <div className="sc-moderation-tab-comment-form">
            <textarea
              className="sc-input"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Moderation comment or change request…"
            />
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={submitting || !comment.trim()}
              onClick={() => void addComment()}
            >
              Post Comment
            </button>
          </div>
        </div>
      ) : null}

      <div className="sc-card sc-card-padded sc-moderation-tab-section">
        <h3>Comments</h3>
        {trail.comments.length === 0 ? (
          <p className="sc-muted">No moderation comments yet.</p>
        ) : (
          <ul className="sc-moderation-tab-list">
            {trail.comments.map((c) => (
              <li key={c.id}>
                <span className="sc-moderation-tab-list-meta">
                  <strong>{c.author.fullName}</strong> · {c.type}
                  {c.resolved ? (
                    <span className="sc-moderation-tab-status sc-moderation-tab-status-resolved">
                      resolved
                    </span>
                  ) : null}
                </span>
                {c.body}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sc-card sc-card-padded sc-moderation-tab-section">
        <h3>Approval Requests</h3>
        {trail.approvalRequests.length === 0 ? (
          <p className="sc-muted">No approval requests.</p>
        ) : (
          <ul className="sc-moderation-tab-list">
            {trail.approvalRequests.map((r) => (
              <li key={r.id}>
                <span className="sc-moderation-tab-list-meta">
                  <span className="sc-moderation-tab-status sc-moderation-tab-status-pending">
                    {r.status}
                  </span>
                  {r.requestedBy.fullName} → {r.assignedRole.replaceAll("_", " ")}
                </span>
                {r.comment ?? "No comment provided."}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sc-card sc-card-padded sc-moderation-tab-section">
        <h3>Approval History</h3>
        {trail.auditTrail.length === 0 ? (
          <p className="sc-muted">No approval history recorded.</p>
        ) : (
          <ul className="sc-moderation-tab-list">
            {trail.auditTrail.map((a) => (
              <li key={a.id}>
                <span className="sc-moderation-tab-list-meta">
                  {a.action} by {a.performedBy.fullName}
                </span>
                {a.comment ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ModerationEscalateModal
        open={showEscalateModal}
        itemName={assessmentTitle}
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
