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
  WorkspaceRole,
} from "../../types";
import ModerationEscalateModal from "./shared/ModerationEscalateModal";
import ModerationReturnModal from "./shared/ModerationReturnModal";
import ModerationRowActions from "./shared/ModerationRowActions";
import {
  getModerationJourneyStatus,
  moderationJourneyStatusClass,
} from "./shared/moderationJourneyStatus";
import { getModerationReviewPath } from "./shared/moderationReviewLink";
import "../scripts/Scripts.css";
import "./ModerationWorkflow.css";

type ScriptQueueItem = ScriptBatchSummary & {
  learnerScripts: LearnerScriptSummary[];
  assessment: { id: string; title: string; totalMarks: number };
};

type ReturnTarget =
  | { kind: "assessment"; id: string; title: string }
  | { kind: "batch"; batchId: string; title: string };

type EscalateTarget = { assessmentId: string; title: string; busyKey: string };

export default function HodModerationQueue() {
  const { user } = useAuth();
  const canEscalate = hasPermission(user, "moderation.request_approval");

  const [queue, setQueue] = useState<Assessment[]>([]);
  const [scriptQueue, setScriptQueue] = useState<ScriptQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [saveToBank, setSaveToBank] = useState(true);
  const [approveTarget, setApproveTarget] = useState<Assessment | null>(null);
  const [approveBatchTarget, setApproveBatchTarget] = useState<ScriptQueueItem | null>(null);
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());
  const [escalateTarget, setEscalateTarget] = useState<EscalateTarget | null>(null);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
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
        apiFetch<ScriptQueueItem[]>("/script-batches/moderation-queue")
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

  useEffect(() => {
    const assessmentIds = new Set<string>([
      ...queue.map((a) => a.id),
      ...scriptQueue.map((b) => b.assessment.id),
    ]);
    if (!assessmentIds.size) {
      setEscalatedIds(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      [...assessmentIds].map(async (id) => {
        try {
          const trail = await apiFetch<{ approvalRequests: { status: string }[] }>(
            `/moderation-trail/assessments/${id}/trail`
          );
          return trail.approvalRequests.some((r) => r.status === "PENDING") ? id : null;
        } catch {
          return null;
        }
      })
    ).then((ids) => {
      if (!cancelled) {
        setEscalatedIds(new Set(ids.filter((id): id is string => Boolean(id))));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queue, scriptQueue]);

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
    const busyKey = returnTarget.kind === "assessment" ? returnTarget.id : returnTarget.batchId;
    setBusyId(busyKey);

    try {
      if (returnTarget.kind === "assessment") {
        await apiFetch(`/assessments/${returnTarget.id}/return`, {
          method: "POST",
          body: JSON.stringify({ comment: returnComment }),
        });
      } else {
        await apiFetch(`/script-batches/${returnTarget.batchId}/return`, {
          method: "POST",
          body: JSON.stringify({ comment: returnComment }),
        });
      }
      setReturnTarget(null);
      setReturnComment("");
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleEscalate = async () => {
    if (!escalateTarget) return;
    setActionError("");
    setBusyId(escalateTarget.busyKey);

    try {
      await apiFetch(`/moderation-trail/assessments/${escalateTarget.assessmentId}/approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          assignedRole: escalateRole,
          comment: escalateComment.trim() || undefined,
        }),
      });
      setEscalateTarget(null);
      setEscalateComment("");
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveScriptBatch = async (batch: ScriptQueueItem) => {
    setActionError("");
    setBusyId(batch.id);
    try {
      await apiFetch(`/script-batches/${batch.id}/review`, { method: "POST" });
      await apiFetch(`/script-batches/${batch.id}/approve`, { method: "POST" });
      setApproveBatchTarget(null);
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve batch failed");
    } finally {
      setBusyId(null);
    }
  };

  const openEscalate = (assessmentId: string, title: string, busyKey: string) => {
    setEscalateTarget({ assessmentId, title, busyKey });
    setEscalateRole("MODERATOR");
    setEscalateComment("");
  };

  const returnBusy =
    returnTarget != null &&
    busyId === (returnTarget.kind === "assessment" ? returnTarget.id : returnTarget.batchId);

  return (
    <div className="sc-mod-hub">
      <h1 className="sc-page-title">DH Moderation Queue</h1>
      <p className="sc-page-subtitle">
        Review assessments submitted by teachers. Approve, return with feedback, or escalate.
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
        <div className="sc-card sc-mod-queue" style={{ marginTop: "1.5rem" }}>
          {queue.length === 0 ? (
            <div className="sc-placeholder-panel">
              <h3>Queue is empty</h3>
              <p>No assessments awaiting DH review.</p>
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
                  {queue.map((item) => {
                    const journey = getModerationJourneyStatus(
                      item.status,
                      escalatedIds.has(item.id)
                    );
                    return (
                      <tr key={item.id}>
                        <td>
                          <Link to={`/assessments/${item.id}`}>{item.title}</Link>
                        </td>
                        <td>{item.creatorTeacher.fullName}</td>
                        <td>{item.subject.name}</td>
                        <td>{item.grade.name}</td>
                        <td>
                          <span
                            className={`sc-mod-status ${moderationJourneyStatusClass(journey.key)}`}
                          >
                            {journey.label}
                          </span>
                        </td>
                        <td>
                          <ModerationRowActions
                            reviewTo={getModerationReviewPath({ assessmentId: item.id })}
                            busy={busyId === item.id}
                            onApprove={() => {
                              setSaveToBank(true);
                              setApproveTarget(item);
                            }}
                            onReturn={() =>
                              setReturnTarget({ kind: "assessment", id: item.id, title: item.title })
                            }
                            onEscalate={
                              canEscalate
                                ? () => openEscalate(item.id, item.title, item.id)
                                : undefined
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
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
            Save approved questions to Question Bank (DH Approved)
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

      {hasPermission(user, "scripts.moderate") ? (
        <div className="sc-card sc-mod-queue" style={{ marginTop: "2rem" }}>
          <h2 style={{ padding: "0 1rem", color: "var(--sc-gold-light)" }}>Script Marking Review</h2>
          <p className="sc-page-subtitle" style={{ padding: "0 1rem" }}>
            Batches submitted by teachers for DH moderation.
          </p>
          {scriptQueue.length === 0 ? (
            <div className="sc-placeholder-panel">
              <p>No script batches awaiting review.</p>
            </div>
          ) : (
            scriptQueue.map((batch) => {
              const journey = getModerationJourneyStatus(
                batch.status,
                escalatedIds.has(batch.assessment.id)
              );
              return (
              <div key={batch.id} style={{ padding: "1rem", borderTop: "1px solid var(--sc-border)" }}>
                <div className="sc-mod-section-header" style={{ padding: 0 }}>
                  <div>
                    <strong>{batch.title}</strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                      {batch.assessment?.title} · {batch.learnerScripts.length} scripts ·{" "}
                      <span
                        className={`sc-mod-status ${moderationJourneyStatusClass(journey.key)}`}
                      >
                        {journey.label}
                      </span>
                    </div>
                  </div>
                  <ModerationRowActions
                    reviewTo={getModerationReviewPath({
                      assessmentId: batch.assessment.id,
                      batchId: batch.id,
                      type: "script_batch",
                    })}
                    busy={busyId === batch.id}
                    approveLabel="Approve batch"
                    onApprove={
                      hasPermission(user, "scripts.approve")
                        ? () => setApproveBatchTarget(batch)
                        : undefined
                    }
                    onReturn={() =>
                      setReturnTarget({
                        kind: "batch",
                        batchId: batch.id,
                        title: batch.title,
                      })
                    }
                    onEscalate={
                      canEscalate && batch.assessment?.id
                        ? () => openEscalate(batch.assessment.id, batch.title, batch.id)
                        : undefined
                    }
                  />
                </div>
                <div className="sc-table-wrap" style={{ marginTop: "0.75rem" }}>
                  <table className="sc-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Teacher total</th>
                        <th>DH total</th>
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
                            <Link to={`/scripts/${s.id}`} className="sc-btn sc-btn-ghost sc-mod-table-btn">
                              Open script
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
            })
          )}
        </div>
      ) : null}

      {approveBatchTarget ? (
        <div
          className="sc-card sc-card-gold sc-form-grid"
          style={{ marginTop: "1.5rem", padding: "1.5rem", maxWidth: 560 }}
        >
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            Approve batch — {approveBatchTarget.title}
          </h3>
          <p className="sc-mod-hint" style={{ margin: 0 }}>
            This will mark the batch as reviewed and approved for all {approveBatchTarget.learnerScripts.length} scripts.
          </p>
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={busyId === approveBatchTarget.id}
              onClick={() => void handleApproveScriptBatch(approveBatchTarget)}
            >
              Confirm approval
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setApproveBatchTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ModerationReturnModal
        open={!!returnTarget}
        itemName={returnTarget?.title ?? ""}
        comment={returnComment}
        onCommentChange={setReturnComment}
        busy={returnBusy}
        onConfirm={() => void handleReturn()}
        onCancel={() => {
          setReturnTarget(null);
          setReturnComment("");
        }}
      />

      <ModerationEscalateModal
        open={!!escalateTarget}
        itemName={escalateTarget?.title ?? ""}
        role={escalateRole}
        onRoleChange={setEscalateRole}
        comment={escalateComment}
        onCommentChange={setEscalateComment}
        busy={!!escalateTarget && busyId === escalateTarget.busyKey}
        onConfirm={() => void handleEscalate()}
        onCancel={() => {
          setEscalateTarget(null);
          setEscalateComment("");
        }}
      />

    </div>
  );
}
