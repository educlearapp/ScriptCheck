import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDownloadPath, apiFetch } from "../../api";
import MarkVarianceBadge from "../../components/scripts/MarkVarianceBadge";
import ConcessionAlerts from "../../components/concessions/ConcessionAlerts";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { useTrialGate } from "../../trial/TrialGateContext";
import type {
  BatchModerationAnalytics,
  MarkerPerformanceRow,
} from "../../types";
import "../scripts/Scripts.css";

export default function BatchModerationDashboard() {
  const { batchId } = useParams<{ batchId: string }>();
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();
  const [analytics, setAnalytics] = useState<BatchModerationAnalytics | null>(null);
  const [markers, setMarkers] = useState<MarkerPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canExport = hasPermission(user, "results.export");

  const load = useCallback(() => {
    if (!batchId) return;
    setLoading(true);
    Promise.all([
      apiFetch<BatchModerationAnalytics>(`/script-batches/${batchId}/analytics`),
      apiFetch<MarkerPerformanceRow[]>(`/script-batches/${batchId}/marker-performance`),
    ])
      .then(([a, m]) => {
        setAnalytics(a);
        setMarkers(m);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load analytics")
      )
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = () => {
    if (!batchId) return;
    if (!gateProductionAction()) return;
    void apiDownloadPath(
      `/script-batches/${batchId}/export.csv`,
      `batch-${batchId.slice(0, 8)}-marks.csv`
    );
  };

  if (loading) return <p>Loading batch analytics…</p>;
  if (error) return <p className="sc-error">{error}</p>;
  if (!analytics) return null;

  const wc = analytics.workflowCounts;

  return (
    <div>
      <Link to={`/assessments/${analytics.assessment.id}/scripts`} className="sc-detail-back">
        ← Scripts
      </Link>
      <h1 className="sc-page-title">{analytics.title}</h1>
      <p className="sc-page-subtitle">
        {analytics.assessment.title} · Batch moderation analytics
      </p>

      {hasPermission(user, "concessions.view") ? (
        <ConcessionAlerts assessmentId={analytics.assessment.id} compact />
      ) : null}

      <div className="sc-analytics-grid">
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{analytics.totalScripts}</div>
          <div className="sc-analytics-label">Total scripts</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{wc.uploaded}</div>
          <div className="sc-analytics-label">Uploaded</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{wc.marked}</div>
          <div className="sc-analytics-label">Marked</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{wc.moderated}</div>
          <div className="sc-analytics-label">Moderated</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{wc.finalised}</div>
          <div className="sc-analytics-label">Finalised</div>
        </div>
        <div className="sc-analytics-card sc-card-gold">
          <div className="sc-analytics-value">{analytics.marks.average ?? "—"}</div>
          <div className="sc-analytics-label">Average mark</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{analytics.marks.highest ?? "—"}</div>
          <div className="sc-analytics-label">Highest</div>
        </div>
        <div className="sc-analytics-card">
          <div className="sc-analytics-value">{analytics.marks.lowest ?? "—"}</div>
          <div className="sc-analytics-label">Lowest</div>
        </div>
        <div className="sc-analytics-card sc-variance-card">
          <div className="sc-analytics-value">{analytics.varianceCounts.totalFlagged}</div>
          <div className="sc-analytics-label">Variance flagged</div>
          <div className="sc-variance-breakdown">
            <span className="sc-variance-warning">{analytics.varianceCounts.warning} warn</span>
            <span className="sc-variance-significant">{analytics.varianceCounts.significant} sig</span>
            <span className="sc-variance-critical">{analytics.varianceCounts.critical} crit</span>
          </div>
        </div>
      </div>

      {canExport ? (
        <div className="sc-form-actions" style={{ margin: "1rem 0" }}>
          <button type="button" className="sc-btn sc-btn-primary" onClick={handleExport}>
            Download Results
          </button>
        </div>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1rem", padding: "1rem" }}>
        <h3 className="sc-script-panel-title">Marker Performance</h3>
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Scripts</th>
                <th>Avg awarded</th>
                <th>Avg variance</th>
                <th>Returned</th>
                <th>Approval %</th>
              </tr>
            </thead>
            <tbody>
              {markers.length === 0 ? (
                <tr>
                  <td colSpan={6}>No marker data yet.</td>
                </tr>
              ) : (
                markers.map((m) => (
                  <tr key={m.teacherId}>
                    <td>{m.teacherName}</td>
                    <td>{m.scriptsMarked}</td>
                    <td>{m.averageMarkAwarded ?? "—"}</td>
                    <td>{m.averageModerationVariance != null ? `${m.averageModerationVariance}%` : "—"}</td>
                    <td>{m.scriptsReturnedByHod}</td>
                    <td>{m.approvalRate != null ? `${m.approvalRate}%` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sc-card" style={{ marginTop: "1rem", padding: "1rem" }}>
        <h3 className="sc-script-panel-title">Script Marks</h3>
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Script</th>
                <th>Learner</th>
                <th>Teacher</th>
                <th>DH</th>
                <th>Final</th>
                <th>Diff</th>
                <th>Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {analytics.scripts.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/scripts/${s.id}`}>#{s.scriptNumber}</Link>
                  </td>
                  <td>{s.learnerName}</td>
                  <td>{s.teacherTotal ?? "—"}</td>
                  <td>{s.hodTotal ?? "—"}</td>
                  <td>{s.finalTotal ?? "—"}</td>
                  <td>{s.markDifference ?? "—"}</td>
                  <td>
                    <MarkVarianceBadge
                      level={s.varianceLevel}
                      variancePercent={s.moderationVariancePercent}
                      compact
                    />
                  </td>
                  <td>{s.workflowStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
