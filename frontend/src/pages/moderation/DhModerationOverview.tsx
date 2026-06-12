import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { getDhModerationOverview, type DhModerationItem } from "../../services/assessmentSetupApi";
import type { ModerationCentreData, WorkspaceRole } from "../../types";
import ModerationEscalateModal from "./shared/ModerationEscalateModal";
import ModerationReturnModal from "./shared/ModerationReturnModal";
import ModerationRowActions from "./shared/ModerationRowActions";
import ModerationSteps from "./shared/ModerationSteps";
import { getModerationReviewPath } from "./shared/moderationReviewLink";
import {
  getModerationJourneyStatus,
  moderationJourneyStatusClass,
} from "./shared/moderationJourneyStatus";
import "../dashboard/Dashboard.css";
import "./ModerationWorkflow.css";

function formatPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function DhModerationOverview() {
  const { user } = useAuth();
  const canEscalate = hasPermission(user, "moderation.request_approval");

  const [centreData, setCentreData] = useState<ModerationCentreData | null>(null);
  const [dhItems, setDhItems] = useState<DhModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [returnTarget, setReturnTarget] = useState<DhModerationItem | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<DhModerationItem | null>(null);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
  const [actionError, setActionError] = useState("");
  const [approveTarget, setApproveTarget] = useState<DhModerationItem | null>(null);
  const [saveToBank, setSaveToBank] = useState(true);
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (!dhItems.length) {
      setEscalatedIds(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      dhItems.map(async (item) => {
        try {
          const trail = await apiFetch<{ approvalRequests: { status: string }[] }>(
            `/moderation-trail/assessments/${item.assessmentId}/trail`
          );
          return trail.approvalRequests.some((r) => r.status === "PENDING")
            ? item.assessmentId
            : null;
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
  }, [dhItems]);

  const handleApprove = async (item: DhModerationItem, saveQuestionsToBank: boolean) => {
    setBusyId(item.id);
    setActionError("");
    try {
      if (item.type === "assessment") {
        await apiFetch(`/assessments/${item.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ saveToQuestionBank: saveQuestionsToBank }),
        });
      } else if (item.batchId) {
        await apiFetch(`/script-batches/${item.batchId}/approve`, { method: "POST" });
      }
      setApproveTarget(null);
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

  const handleEscalate = async () => {
    if (!escalateTarget) return;
    setBusyId(escalateTarget.id);
    setActionError("");
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
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setBusyId(null);
    }
  };

  const stats = centreData?.stats;
  const hasQueue = dhItems.length > 0;

  const flowSteps = useMemo(
    () => [
      { n: 1, label: "See submitted items", done: hasQueue },
      { n: 2, label: "Review submission", done: false },
      { n: 3, label: "Approve / Return / Escalate", done: false },
    ],
    [hasQueue]
  );

  const activeStep = hasQueue ? 2 : 1;

  if (loading) return <p>Loading moderation…</p>;

  return (
    <div className="sc-dash sc-mod-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">DH Moderation</h1>
          <p className="sc-page-subtitle">
            Review teacher submissions, then approve, return with feedback, or escalate.
          </p>
        </div>
        <div className="sc-dash-meta">
          <span className="sc-dash-meta-pill">
            Awaiting review: <strong>{dhItems.length}</strong>
          </span>
        </div>
      </header>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <ModerationSteps steps={flowSteps} activeStep={activeStep} ariaLabel="DH moderation workflow" />

      <div className="sc-mod-stats">
        <div className="sc-card sc-card-gold sc-mod-stat-card">
          <div className="sc-mod-stat-value">{dhItems.length}</div>
          <div className="sc-mod-stat-label">Submitted to DH</div>
        </div>
        <div className="sc-card sc-mod-stat-card">
          <div className="sc-mod-stat-value">{stats?.moderationCompleted ?? "—"}</div>
          <div className="sc-mod-stat-label">Moderation completed</div>
        </div>
        <div className="sc-card sc-mod-stat-card">
          <div className="sc-mod-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div className="sc-mod-stat-label">Compliance score</div>
        </div>
      </div>

      <section>
        <div className="sc-mod-section-header">
          <h2 className="sc-mod-panel-title" style={{ margin: 0 }}>
            <span className="sc-mod-panel-step">1</span>
            Submitted Items
          </h2>
          <Link to="/moderation/queue" className="sc-btn sc-btn-ghost sc-mod-table-btn">
            Open Full Queue
          </Link>
        </div>

        {hasQueue ? (
          <div className="sc-card sc-mod-queue">
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Grade</th>
                    <th>Subject</th>
                    <th>Teacher</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dhItems.map((item) => {
                    const journey = getModerationJourneyStatus(
                      item.status,
                      escalatedIds.has(item.assessmentId)
                    );
                    return (
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
                          <span
                            className={`sc-mod-status ${moderationJourneyStatusClass(journey.key)}`}
                          >
                            {journey.label}
                          </span>
                        </td>
                        <td>
                          <ModerationRowActions
                            reviewTo={getModerationReviewPath({
                              assessmentId: item.assessmentId,
                              batchId: item.batchId,
                              type: item.type,
                            })}
                            busy={busyId === item.id}
                            onApprove={() => {
                              setSaveToBank(true);
                              setApproveTarget(item);
                            }}
                            onReturn={() => setReturnTarget(item)}
                            onEscalate={
                              canEscalate
                                ? () => {
                                    setEscalateTarget(item);
                                    setEscalateRole("MODERATOR");
                                    setEscalateComment("");
                                  }
                                : undefined
                            }
                            approveLabel={item.type === "script_batch" ? "Approve batch" : "Approve"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="sc-card sc-card-padded sc-mod-queue">
            <p className="sc-dash-empty">No items awaiting DH review.</p>
            <div className="sc-mod-empty-actions">
              <Link to="/moderation/queue" className="sc-btn sc-btn-ghost">
                Open Moderation Queue
              </Link>
              <Link to="/assessments" className="sc-btn sc-btn-ghost">
                View Assessments
              </Link>
            </div>
          </div>
        )}
      </section>

      {approveTarget ? (
        <div
          className="sc-card sc-card-gold sc-form-grid"
          style={{ marginTop: "1.5rem", padding: "1.5rem", maxWidth: 560 }}
        >
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            Approve — {approveTarget.assessmentName}
          </h3>
          {approveTarget.type === "assessment" ? (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={saveToBank}
                onChange={(e) => setSaveToBank(e.target.checked)}
              />
              Save approved questions to Question Bank (DH Approved)
            </label>
          ) : (
            <p className="sc-mod-hint" style={{ margin: 0 }}>
              Approving this script batch will finalise DH moderation for all scripts in the batch.
            </p>
          )}
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={busyId === approveTarget.id}
              onClick={() => void handleApprove(approveTarget, saveToBank)}
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

      <ModerationReturnModal
        open={!!returnTarget}
        itemName={returnTarget?.assessmentName ?? ""}
        comment={returnComment}
        onCommentChange={setReturnComment}
        busy={!!returnTarget && busyId === returnTarget.id}
        onConfirm={() => void handleReturn()}
        onCancel={() => {
          setReturnTarget(null);
          setReturnComment("");
        }}
      />

      <ModerationEscalateModal
        open={!!escalateTarget}
        itemName={escalateTarget?.assessmentName ?? ""}
        role={escalateRole}
        onRoleChange={setEscalateRole}
        comment={escalateComment}
        onCommentChange={setEscalateComment}
        busy={!!escalateTarget && busyId === escalateTarget.id}
        onConfirm={() => void handleEscalate()}
        onCancel={() => {
          setEscalateTarget(null);
          setEscalateComment("");
        }}
      />
    </div>
  );
}
