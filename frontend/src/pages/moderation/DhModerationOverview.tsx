import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { getDhModerationOverview, type DhModerationItem } from "../../services/assessmentSetupApi";
import type { ModerationCentreData } from "../../types";

function formatPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function DhModerationOverview() {
  const [centreData, setCentreData] = useState<ModerationCentreData | null>(null);
  const [dhItems, setDhItems] = useState<DhModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [returnTarget, setReturnTarget] = useState<DhModerationItem | null>(null);
  const [actionError, setActionError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<ModerationCentreData>("/moderation").catch(() => null),
      getDhModerationOverview().catch(() => ({ items: [] })),
    ])
      .then(([centre, dh]) => {
        setCentreData(centre);
        setDhItems(dh.items);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (item: DhModerationItem) => {
    setBusyId(item.id);
    setActionError("");
    try {
      if (item.type === "assessment") {
        await apiFetch(`/assessments/${item.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ saveToQuestionBank: false }),
        });
      } else if (item.batchId) {
        await apiFetch(`/script-batches/${item.batchId}/approve`, { method: "POST" });
      }
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    setBusyId(returnTarget.id);
    setActionError("");
    try {
      if (returnTarget.type === "assessment") {
        await apiFetch(`/assessments/${returnTarget.id}/return`, {
          method: "POST",
          body: JSON.stringify({ comment: returnComment }),
        });
      } else if (returnTarget.batchId) {
        await apiFetch(`/script-batches/${returnTarget.batchId}/return`, {
          method: "POST",
          body: JSON.stringify({ comment: returnComment }),
        });
      }
      setReturnTarget(null);
      setReturnComment("");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusyId(null);
    }
  };

  const stats = centreData?.stats;

  if (loading) return <p>Loading moderation…</p>;

  return (
    <div>
      <h1 className="sc-page-title">Moderation</h1>
      <p className="sc-page-subtitle">
        Assessments awaiting DH review. All moderation documents are attached to each assessment.
      </p>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{dhItems.length}</div>
          <div>Awaiting DH review</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationCompleted ?? "—"}</div>
          <div>Moderation completed</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div>Compliance score</div>
        </div>
      </div>

      {dhItems.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>
            Assessments Awaiting DH Review
          </h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Assessment Name</th>
                    <th>Grade</th>
                    <th>Subject</th>
                    <th>Teacher</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dhItems.map((item) => (
                    <tr key={`${item.type}-${item.id}`}>
                      <td>
                        {item.assessmentName}
                        {item.scriptCount != null ? (
                          <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
                            {item.scriptCount} scripts
                          </span>
                        ) : null}
                      </td>
                      <td>{item.grade}</td>
                      <td>{item.subject}</td>
                      <td>{item.teacher}</td>
                      <td>
                        <span className="sc-badge sc-badge-muted">{item.statusLabel}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <Link
                            to={`/assessments/${item.assessmentId}`}
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                          >
                            Review
                          </Link>
                          <button
                            type="button"
                            className="sc-btn sc-btn-primary"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={busyId === item.id}
                            onClick={() => void handleApprove(item)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={busyId === item.id}
                            onClick={() => setReturnTarget(item)}
                          >
                            Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
          <p className="sc-dash-empty">No assessments awaiting DH review.</p>
        </div>
      )}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <Link to="/moderation/queue" className="sc-btn sc-btn-ghost">
          Open full DH moderation queue
        </Link>
      </div>

      {returnTarget ? (
        <div className="sc-qb-picker-overlay" onClick={() => setReturnTarget(null)}>
          <div className="sc-qb-picker-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2>Return to Teacher</h2>
            <p>{returnTarget.assessmentName}</p>
            <textarea
              className="sc-input"
              rows={4}
              placeholder="Comments for teacher…"
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
            />
            <div className="sc-form-actions">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={!returnComment.trim() || busyId === returnTarget.id}
                onClick={() => void handleReturn()}
              >
                Return with Comments
              </button>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setReturnTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
