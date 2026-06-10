import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type {
  Assessment,
  HodModerationDashboard,
  LearnerScriptSummary,
  ScriptBatchSummary,
} from "../../types";
import "../scripts/Scripts.css";

type ReturnTarget = { assessment: Assessment } | null;

export default function HodModerationQueue() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Assessment[]>([]);
  const [scriptQueue, setScriptQueue] = useState<
    (ScriptBatchSummary & { learnerScripts: LearnerScriptSummary[]; assessment: { title: string; totalMarks: number } })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget>(null);
  const [returnComment, setReturnComment] = useState("");
  const [saveToBank, setSaveToBank] = useState(true);
  const [approveTarget, setApproveTarget] = useState<Assessment | null>(null);
  const [scriptReturnTarget, setScriptReturnTarget] = useState<string | null>(null);
  const [scriptReturnComment, setScriptReturnComment] = useState("");
  const [hodDashboard, setHodDashboard] = useState<HodModerationDashboard | null>(null);

  const loadQueue = useCallback(() => {
    setLoading(true);
    setError("");
    const requests: Promise<void>[] = [
      apiFetch<Assessment[]>("/assessments/moderation-queue")
        .then(setQueue)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load queue")
        ),
    ];

    if (hasPermission(user, "scripts.moderate")) {
      requests.push(
        apiFetch<typeof scriptQueue>("/script-batches/moderation-queue")
          .then(setScriptQueue)
          .catch(() => setScriptQueue([]))
      );
      requests.push(
        apiFetch<HodModerationDashboard>("/script-batches/moderation-dashboard")
          .then(setHodDashboard)
          .catch(() => setHodDashboard(null))
      );
    }

    Promise.all(requests).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = async (assessment: Assessment, saveQuestionsToBank: boolean) => {
    setActionError("");
    setBusyId(assessment.id);

    try {
      await apiFetch(`/assessments/${assessment.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ saveToQuestionBank: saveQuestionsToBank }),
      });
      setApproveTarget(null);
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReturn = async () => {
    if (!returnTarget) return;

    setActionError("");
    setBusyId(returnTarget.assessment.id);

    try {
      await apiFetch(`/assessments/${returnTarget.assessment.id}/return`, {
        method: "POST",
        body: JSON.stringify({ comment: returnComment }),
      });
      setReturnTarget(null);
      setReturnComment("");
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveScriptBatch = async (batchId: string) => {
    setActionError("");
    setBusyId(batchId);
    try {
      await apiFetch(`/script-batches/${batchId}/review`, { method: "POST" });
      await apiFetch(`/script-batches/${batchId}/approve`, { method: "POST" });
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve batch failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReturnScriptBatch = async () => {
    if (!scriptReturnTarget) return;
    setActionError("");
    setBusyId(scriptReturnTarget);
    try {
      await apiFetch(`/script-batches/${scriptReturnTarget}/return`, {
        method: "POST",
        body: JSON.stringify({ comment: scriptReturnComment }),
      });
      setScriptReturnTarget(null);
      setScriptReturnComment("");
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Return batch failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">HOD Moderation Queue</h1>
      <p className="sc-page-subtitle">
        Review assessments submitted by teachers. Approve or return with feedback.
      </p>

      {loading ? <p style={{ marginTop: "1.5rem" }}>Loading queue…</p> : null}
      {error ? <p className="sc-error" style={{ marginTop: "1.5rem" }}>{error}</p> : null}
      {actionError ? (
        <p className="sc-error" style={{ marginTop: "1rem" }}>{actionError}</p>
      ) : null}

      {hodDashboard ? (
        <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>
            Moderation Overview
          </h2>
          <div className="sc-hod-dashboard-grid">
            <div className="sc-analytics-card">
              <div className="sc-analytics-value">{hodDashboard.summary.pendingModeration}</div>
              <div className="sc-analytics-label">Pending moderation</div>
            </div>
            <div className="sc-analytics-card sc-variance-card">
              <div className="sc-analytics-value">{hodDashboard.summary.overdueModeration}</div>
              <div className="sc-analytics-label">Overdue (&gt;7 days)</div>
            </div>
            <div className="sc-analytics-card">
              <div className="sc-analytics-value">{hodDashboard.summary.returnedScripts}</div>
              <div className="sc-analytics-label">Returned scripts</div>
            </div>
            <div className="sc-analytics-card sc-variance-ok">
              <div className="sc-analytics-value">{hodDashboard.summary.approvedScripts}</div>
              <div className="sc-analytics-label">Approved</div>
            </div>
            <div className="sc-analytics-card sc-card-gold">
              <div className="sc-analytics-value">{hodDashboard.summary.finalisedScripts}</div>
              <div className="sc-analytics-label">Finalised</div>
            </div>
          </div>
          {hodDashboard.overdueScripts.length > 0 ? (
            <div className="sc-table-wrap">
              <table className="sc-table sc-table-compact">
                <thead>
                  <tr>
                    <th>Script</th>
                    <th>Learner</th>
                    <th>Batch</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {hodDashboard.overdueScripts.map((s) => (
                    <tr key={s.scriptId}>
                      <td>
                        <Link to={`/scripts/${s.scriptId}`}>#{s.scriptNumber}</Link>
                      </td>
                      <td>{s.learnerName}</td>
                      <td>{s.batchTitle}</td>
                      <td>
                        {s.submittedToHodAt
                          ? new Date(s.submittedToHodAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="sc-card" style={{ marginTop: "1.5rem", padding: "0.5rem 0" }}>
          {queue.length === 0 ? (
            <div className="sc-placeholder-panel">
              <h3>Queue is empty</h3>
              <p>No assessments awaiting HOD review.</p>
            </div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Teacher</th>
                    <th>Subject</th>
                    <th>Grade</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/assessments/${item.id}`}>{item.title}</Link>
                      </td>
                      <td>{item.creatorTeacher.fullName}</td>
                      <td>{item.subject.name}</td>
                      <td>{item.grade.name}</td>
                      <td>
                        <span className="sc-badge sc-badge-gold">{item.status}</span>
                      </td>
                      <td>
                        <div className="sc-form-actions" style={{ marginTop: 0 }}>
                          <Link
                            to={`/assessments/${item.id}`}
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                          >
                            Review
                          </Link>
                          <button
                            type="button"
                            className="sc-btn sc-btn-primary"
                            disabled={busyId === item.id}
                            onClick={() => {
                              setSaveToBank(true);
                              setApproveTarget(item);
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            disabled={busyId === item.id}
                            onClick={() => setReturnTarget({ assessment: item })}
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
          )}
        </div>
      ) : null}

      {approveTarget ? (
        <div
          className="sc-card sc-card-gold sc-form-grid"
          style={{ marginTop: "1.5rem", padding: "1.5rem", maxWidth: 560 }}
        >
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            Approve — {approveTarget.title}
          </h3>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={saveToBank}
              onChange={(e) => setSaveToBank(e.target.checked)}
            />
            Save approved questions to Question Bank (HOD Approved)
          </label>
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={busyId === approveTarget.id}
              onClick={() => handleApprove(approveTarget, saveToBank)}
            >
              Confirm approval
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setApproveTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {returnTarget ? (
        <div
          className="sc-card sc-card-gold sc-form-grid"
          style={{ marginTop: "1.5rem", padding: "1.5rem", maxWidth: 560 }}
        >
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            Return to teacher — {returnTarget.assessment.title}
          </h3>
          <div>
            <label className="sc-label" htmlFor="return-comment">
              Comment (required)
            </label>
            <textarea
              id="return-comment"
              className="sc-input"
              rows={4}
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
              placeholder="Explain what the teacher should revise…"
            />
          </div>
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!returnComment.trim() || busyId === returnTarget.assessment.id}
              onClick={handleReturn}
            >
              Return to teacher
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => {
                setReturnTarget(null);
                setReturnComment("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {hasPermission(user, "scripts.moderate") ? (
        <div className="sc-card" style={{ marginTop: "2rem", padding: "0.5rem 0" }}>
          <h2 style={{ padding: "0 1rem", color: "var(--sc-gold-light)" }}>Script Marking Review</h2>
          <p className="sc-page-subtitle" style={{ padding: "0 1rem" }}>
            Batches submitted by teachers for HOD moderation.
          </p>
          {scriptQueue.length === 0 ? (
            <div className="sc-placeholder-panel">
              <p>No script batches awaiting review.</p>
            </div>
          ) : (
            scriptQueue.map((batch) => (
              <div key={batch.id} style={{ padding: "1rem", borderTop: "1px solid var(--sc-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong>{batch.title}</strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                      {batch.assessment?.title} · {batch.learnerScripts.length} scripts · {batch.status}
                    </div>
                  </div>
                  <div className="sc-form-actions" style={{ marginTop: 0 }}>
                    {hasPermission(user, "scripts.approve") ? (
                      <button
                        type="button"
                        className="sc-btn sc-btn-primary"
                        disabled={busyId === batch.id}
                        onClick={() => handleApproveScriptBatch(batch.id)}
                      >
                        Approve batch
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      disabled={busyId === batch.id}
                      onClick={() => setScriptReturnTarget(batch.id)}
                    >
                      Return
                    </button>
                  </div>
                </div>
                <div className="sc-table-wrap" style={{ marginTop: "0.75rem" }}>
                  <table className="sc-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Teacher total</th>
                        <th>HOD total</th>
                        <th>Final</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.learnerScripts.map((s) => (
                        <tr key={s.id}>
                          <td>{s.learner.firstName} {s.learner.lastName}</td>
                          <td>{s.teacherTotal ?? "—"}</td>
                          <td>{s.hodTotal ?? "—"}</td>
                          <td>{s.finalTotal ?? "—"}</td>
                          <td>
                            <Link to={`/scripts/${s.id}`} className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem" }}>
                              Review
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {scriptReturnTarget ? (
        <div className="sc-card sc-card-gold sc-form-grid" style={{ marginTop: "1.5rem", padding: "1.5rem", maxWidth: 560 }}>
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>Return script batch</h3>
          <textarea
            className="sc-input"
            rows={4}
            value={scriptReturnComment}
            onChange={(e) => setScriptReturnComment(e.target.value)}
            placeholder="Comment for teacher…"
          />
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!scriptReturnComment.trim() || busyId === scriptReturnTarget}
              onClick={handleReturnScriptBatch}
            >
              Return to teacher
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setScriptReturnTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>
          Future script marking layers
        </h3>
        <p style={{ margin: 0, color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
          When script marking is built, annotations will use layered overlays on a single
          scan: original script (base), teacher marks in <strong style={{ color: "#ff6b6b" }}>red</strong>,
          and HOD moderation in <strong style={{ color: "#3ecf8e" }}>green</strong> — no rescanning required.
          See <code>docs/SCRIPT_MARKING_LAYERS.md</code>.
        </p>
      </div>
    </div>
  );
}
