import { useEffect, useState } from "react";
import { apiFetch } from "../../../api";
import { usePermissions } from "../../../hooks/usePermissions";

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
};

export default function AssessmentModerationTab({ assessmentId }: Props) {
  const { can } = usePermissions();
  const [trail, setTrail] = useState<ModerationTrail | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  if (loading) return <p>Loading moderation trail…</p>;
  if (!trail) return <p className="sc-muted">Moderation data unavailable.</p>;

  return (
    <div className="sc-moderation-tab">
      {can("moderation.comment") ? (
        <div className="sc-card sc-card-padded">
          <h3 style={{ marginTop: 0 }}>Add Comment</h3>
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
      ) : null}

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Comments</h3>
        {trail.comments.length === 0 ? (
          <p className="sc-muted">No moderation comments yet.</p>
        ) : (
          <ul className="sc-dash-list">
            {trail.comments.map((c) => (
              <li key={c.id}>
                <strong>{c.author.fullName}</strong> ({c.type})
                {c.resolved ? " · resolved" : ""}: {c.body}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Approval Requests</h3>
        {trail.approvalRequests.length === 0 ? (
          <p className="sc-muted">No approval requests.</p>
        ) : (
          <ul className="sc-dash-list">
            {trail.approvalRequests.map((r) => (
              <li key={r.id}>
                {r.status} — {r.requestedBy.fullName} → {r.assignedRole.replaceAll("_", " ")}
                {r.comment ? `: ${r.comment}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Approval History</h3>
        <ul className="sc-dash-list">
          {trail.auditTrail.map((a) => (
            <li key={a.id}>
              {a.action} by {a.performedBy.fullName}
              {a.comment ? ` — ${a.comment}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
