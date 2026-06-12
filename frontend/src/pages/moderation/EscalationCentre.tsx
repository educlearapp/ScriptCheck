import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import PageLoader from "../../components/loading/PageLoader";
import {
  fetchEscalationRequests,
  respondToEscalation,
  type EscalationRequest,
  type EscalationStatusFilter,
} from "../../services/escalationApi";
import { getRoleLabel } from "../../utils/roleLabels";
import ModerationReturnModal from "./shared/ModerationReturnModal";
import { moderationStatusClass } from "./shared/moderationStatus";
import "./ModerationWorkflow.css";

type TabKey = "pending" | "approved" | "returned" | "history";

const TAB_STATUS: Record<Exclude<TabKey, "history">, EscalationStatusFilter> = {
  pending: "PENDING",
  approved: "APPROVED",
  returned: "REJECTED",
};

function escalationStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "PENDING") return "sc-mod-status-pending";
  if (s === "APPROVED") return "sc-mod-status-approved";
  if (s === "REJECTED") return "sc-mod-status-returned";
  return moderationStatusClass(status);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function EscalationCentre() {
  const { user } = useAuth();
  const canRespond = hasPermission(user, "moderation.approve");

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [requests, setRequests] = useState<EscalationRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, returned: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<EscalationRequest | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const statusFilter: EscalationStatusFilter =
    activeTab === "history" ? "all" : TAB_STATUS[activeTab];

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchEscalationRequests({ status: statusFilter }),
      fetchEscalationRequests({ status: "PENDING" }),
      fetchEscalationRequests({ status: "APPROVED" }),
      fetchEscalationRequests({ status: "REJECTED" }),
      fetchEscalationRequests({ status: "all" }),
    ])
      .then(([tabData, pending, approved, returned, all]) => {
        setRequests(tabData.requests);
        setCounts({
          pending: pending.requests.length,
          approved: approved.requests.length,
          returned: returned.requests.length,
          total: all.requests.length,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load escalations");
        setRequests([]);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = useMemo(
    () =>
      [
        { key: "pending" as const, label: "Pending", count: counts.pending },
        { key: "approved" as const, label: "Approved", count: counts.approved },
        { key: "returned" as const, label: "Returned", count: counts.returned },
        { key: "history" as const, label: "All history", count: counts.total },
      ] satisfies Array<{ key: TabKey; label: string; count: number }>,
    [counts]
  );

  const handleApprove = async (request: EscalationRequest) => {
    setBusyId(request.id);
    setActionError("");
    try {
      await respondToEscalation(request.id, "APPROVED");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    setActionError("");
    try {
      await respondToEscalation(rejectTarget.id, "REJECTED", rejectComment);
      setRejectTarget(null);
      setRejectComment("");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && requests.length === 0 && !error) {
    return <PageLoader message="Loading escalation centre…" />;
  }

  return (
    <div className="sc-mod-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Escalation Centre</h1>
          <p className="sc-page-subtitle">
            Review escalation requests from DH moderation — approve or return with feedback.
          </p>
        </div>
        <div className="sc-mod-section-header" style={{ margin: 0 }}>
          <Link to="/moderation" className="sc-btn sc-btn-ghost sc-mod-table-btn">
            DH Moderation
          </Link>
          <Link to="/moderation/queue" className="sc-btn sc-btn-ghost sc-mod-table-btn">
            Full Queue
          </Link>
        </div>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}
      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <div className="sc-mod-stats" style={{ marginBottom: "1rem" }}>
        <div className="sc-card sc-card-gold sc-mod-stat-card">
          <div className="sc-mod-stat-value">{counts.pending}</div>
          <div className="sc-mod-stat-label">Pending</div>
        </div>
        <div className="sc-card sc-mod-stat-card">
          <div className="sc-mod-stat-value">{counts.approved}</div>
          <div className="sc-mod-stat-label">Approved</div>
        </div>
        <div className="sc-card sc-mod-stat-card">
          <div className="sc-mod-stat-value">{counts.returned}</div>
          <div className="sc-mod-stat-label">Returned</div>
        </div>
      </div>

      <div className="sc-mod-tabs" role="tablist" aria-label="Escalation filters">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`sc-mod-tab${activeTab === tab.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className="sc-mod-tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      <section className="sc-card sc-mod-queue" style={{ marginTop: "0.75rem" }}>
        {loading ? (
          <p className="sc-mod-hint" style={{ padding: "1rem" }}>
            Refreshing…
          </p>
        ) : requests.length === 0 ? (
          <p className="sc-mod-hint" style={{ padding: "1rem" }}>
            {activeTab === "pending"
              ? "No pending escalations."
              : activeTab === "approved"
                ? "No approved escalations yet."
                : activeTab === "returned"
                  ? "No returned escalations."
                  : "No escalation history yet."}
          </p>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Subject</th>
                  <th>Requested by</th>
                  <th>Assigned to</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Responded</th>
                  <th>Comment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const isPending = req.status === "PENDING";
                  const busy = busyId === req.id;
                  return (
                    <tr key={req.id}>
                      <td>
                        <Link to={`/assessments/${req.assessment.id}`} className="sc-link">
                          {req.assessment.title}
                        </Link>
                      </td>
                      <td>{req.assessment.subject.name}</td>
                      <td>{req.requestedBy.fullName}</td>
                      <td>{getRoleLabel(req.assignedRole)}</td>
                      <td>
                        <span className={`sc-mod-status ${escalationStatusClass(req.status)}`}>
                          {req.status === "REJECTED" ? "Returned" : req.status}
                        </span>
                      </td>
                      <td>{formatDate(req.createdAt)}</td>
                      <td>
                        {req.respondedAt ? (
                          <>
                            {formatDate(req.respondedAt)}
                            {req.respondedBy ? (
                              <div className="sc-muted" style={{ fontSize: "0.75rem" }}>
                                {req.respondedBy.fullName}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ maxWidth: "12rem" }}>
                        <span className="sc-muted" style={{ fontSize: "0.82rem" }}>
                          {req.comment || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="sc-mod-table-actions">
                          <Link
                            to={`/assessments/${req.assessment.id}`}
                            className="sc-btn sc-btn-ghost sc-mod-table-btn"
                          >
                            Review
                          </Link>
                          {isPending && canRespond ? (
                            <>
                              <button
                                type="button"
                                className="sc-btn sc-btn-primary sc-mod-table-btn"
                                disabled={busy}
                                onClick={() => handleApprove(req)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="sc-btn sc-btn-ghost sc-mod-table-btn sc-mod-table-btn-escalate"
                                disabled={busy}
                                onClick={() => {
                                  setRejectTarget(req);
                                  setRejectComment("");
                                }}
                              >
                                Return
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModerationReturnModal
        open={rejectTarget != null}
        itemName={rejectTarget?.assessment.title ?? ""}
        comment={rejectComment}
        onCommentChange={setRejectComment}
        busy={rejectTarget != null && busyId === rejectTarget.id}
        onConfirm={handleReject}
        onCancel={() => {
          setRejectTarget(null);
          setRejectComment("");
        }}
        title="Return Escalation"
        confirmLabel="Return to DH"
        placeholder="Reason for returning this escalation…"
        requireComment
      />
    </div>
  );
}
