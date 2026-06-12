import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { getDhModerationOverview, getSetupStatus, type DhModerationItem } from "../../services/assessmentSetupApi";
import { UPLOAD_FILES_HINT } from "../../config/uploadLimits";
import type { Assessment, ModerationCentreData, WorkspaceRole } from "../../types";
import ModerationEscalateModal from "./shared/ModerationEscalateModal";
import ModerationReturnModal from "./shared/ModerationReturnModal";
import ModerationSteps from "./shared/ModerationSteps";
import { getModerationReviewPath } from "./shared/moderationReviewLink";
import { moderationStatusClass } from "./shared/moderationStatus";
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
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [returnTarget, setReturnTarget] = useState<DhModerationItem | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<DhModerationItem | null>(null);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
  const [actionError, setActionError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<ModerationCentreData>("/moderation").catch(() => null),
      getDhModerationOverview().catch(() => ({ items: [] })),
      apiFetch<Assessment[]>("/assessments").catch(() => []),
    ])
      .then(([centre, dh, all]) => {
        setCentreData(centre);
        setDhItems(dh.items);
        setAssessments(all);
        if (!selectedId && all[0]) setSelectedId(all[0].id);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSetupComplete(false);
      return;
    }
    getSetupStatus(selectedId)
      .then((s) => setSetupComplete(s.setupComplete))
      .catch(() => setSetupComplete(false));
  }, [selectedId]);

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
  const setupBase = selectedId ? `/assessments/${selectedId}/setup` : "/assessments/new";
  const hasQueue = dhItems.length > 0;

  const flowSteps = useMemo(
    () => [
      { n: 1, label: "Select assessment", done: !!selectedId },
      { n: 2, label: "Upload moderation sample", done: setupComplete },
      { n: 3, label: "Review moderation data", done: hasQueue },
      { n: 4, label: "Approve / Return / Escalate", done: false },
    ],
    [selectedId, setupComplete, hasQueue]
  );

  const activeStep = hasQueue ? 4 : flowSteps.find((s) => !s.done)?.n ?? 4;

  if (loading) return <p>Loading moderation…</p>;

  return (
    <div className="sc-dash sc-mod-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Moderation</h1>
          <p className="sc-page-subtitle">
            Upload moderation documents, review the queue, approve, return or escalate.
          </p>
        </div>
        <div className="sc-dash-meta">
          <span className="sc-dash-meta-pill">
            Awaiting DH review: <strong>{dhItems.length}</strong>
          </span>
        </div>
      </header>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <ModerationSteps steps={flowSteps} activeStep={activeStep} />

      <div className="sc-card sc-card-padded sc-mod-workflow-card">
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">1</span>
          Select Assessment &amp; Upload
        </h2>
        <div className="sc-mod-select-row">
          <label className="sc-mod-field">
            Select Assessment
            <select
              className="sc-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— Select assessment —</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.grade.name} · {a.subject.name})
                </option>
              ))}
            </select>
          </label>
          <Link to={setupBase} className="sc-btn sc-btn-primary" style={{ alignSelf: "flex-end" }}>
            Upload Assessment for Moderation
          </Link>
        </div>
        <p className="sc-mod-hint">
          Master documents attach via Assessment Setup. {UPLOAD_FILES_HINT}
        </p>
        <div className="sc-mod-upload-grid">
          {["Question Paper", "Memorandum", "Rubric", "Sample Marked Scripts"].map((label) => (
            <div key={label} className="sc-mod-upload-card">
              <h3>{label}</h3>
              <span className="sc-badge sc-badge-muted">Via setup wizard</span>
              {selectedId ? (
                <Link
                  to={`/assessments/${selectedId}/setup`}
                  className="sc-btn sc-btn-ghost sc-mod-table-btn"
                >
                  Upload
                </Link>
              ) : (
                <Link to="/assessments/new" className="sc-btn sc-btn-ghost sc-mod-table-btn">
                  Create Assessment
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="sc-mod-stats">
        <div className="sc-card sc-card-gold sc-mod-stat-card">
          <div className="sc-mod-stat-value">{dhItems.length}</div>
          <div className="sc-mod-stat-label">Awaiting DH review</div>
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
            <span className="sc-mod-panel-step">3</span>
            Review &amp; Moderate
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
                        <span className={`sc-mod-status ${moderationStatusClass(item.status)}`}>
                          {item.statusLabel}
                        </span>
                      </td>
                      <td>
                        <div className="sc-mod-table-actions">
                          <Link
                            to={getModerationReviewPath({
                              assessmentId: item.assessmentId,
                              batchId: item.batchId,
                              type: item.type,
                            })}
                            className="sc-btn sc-btn-ghost sc-mod-table-btn"
                          >
                            Review
                          </Link>
                          <button
                            type="button"
                            className="sc-btn sc-btn-primary sc-mod-table-btn"
                            disabled={busyId === item.id}
                            onClick={() => void handleApprove(item)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-mod-table-btn"
                            disabled={busyId === item.id}
                            onClick={() => setReturnTarget(item)}
                          >
                            Return
                          </button>
                          {canEscalate ? (
                            <button
                              type="button"
                              className="sc-btn sc-btn-ghost sc-mod-table-btn sc-mod-table-btn-escalate"
                              disabled={busyId === item.id}
                              onClick={() => {
                                setEscalateTarget(item);
                                setEscalateRole("MODERATOR");
                                setEscalateComment("");
                              }}
                            >
                              Escalate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="sc-card sc-card-padded sc-mod-queue">
            <p className="sc-dash-empty">No assessments awaiting DH review.</p>
            <div className="sc-mod-empty-actions">
              <Link to={setupBase} className="sc-btn sc-btn-primary">
                Upload Assessment for Moderation
              </Link>
              <Link to="/assessments" className="sc-btn sc-btn-ghost">
                View Assessments
              </Link>
            </div>
          </div>
        )}
      </section>

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
