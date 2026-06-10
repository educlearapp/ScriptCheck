import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PortalAnalytics } from "../../types";
import { portalFetch } from "../../portal/api";
import "../../portal/PortalLayout.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

export default function PortalAnalyticsPage() {
  const { learnerId } = useParams<{ learnerId: string }>();
  const [data, setData] = useState<PortalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!learnerId) return;
    portalFetch<PortalAnalytics>(`/portal/learners/${learnerId}/analytics`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [learnerId]);

  if (loading) return <p>Loading analytics…</p>;
  if (!data) return <p>Unable to load analytics.</p>;

  const maxPct = Math.max(
    ...data.assessmentTrends.map((t) => t.percentage),
    100
  );

  return (
    <div>
      <Link to="/portal" className="portal-link">
        ← Dashboard
      </Link>
      <h1 className="portal-page-title">Progress Analytics</h1>
      <p className="portal-page-subtitle">Read-only performance insights</p>

      <div className="portal-grid-4">
        <div className="portal-card">
          <div className="portal-stat-value">
            {data.performanceGrowth != null
              ? `${data.performanceGrowth > 0 ? "+" : ""}${data.performanceGrowth}%`
              : "—"}
          </div>
          <div className="portal-stat-label">Performance growth</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">
            {formatPct(data.gradeComparison.learnerAverage)}
          </div>
          <div className="portal-stat-label">Your average</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">
            {formatPct(data.gradeComparison.gradeAverage)}
          </div>
          <div className="portal-stat-label">{data.gradeComparison.grade} average</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">
            {data.gradeComparison.difference != null
              ? `${data.gradeComparison.difference > 0 ? "+" : ""}${data.gradeComparison.difference}%`
              : "—"}
          </div>
          <div className="portal-stat-label">vs grade</div>
        </div>
      </div>

      {data.assessmentTrends.length > 0 ? (
        <div className="portal-section">
          <h2>Assessment trends</h2>
          <div className="portal-card">
            <div className="portal-trend-chart">
              {data.assessmentTrends.map((t, i) => (
                <div
                  key={i}
                  className="portal-trend-bar"
                  style={{ height: `${(t.percentage / maxPct) * 100}%` }}
                  title={`${t.title}: ${t.percentage}%`}
                >
                  <span className="portal-trend-bar-label">{i + 1}</span>
                </div>
              ))}
            </div>
            <table className="portal-table">
              <tbody>
                {data.assessmentTrends.map((t, i) => (
                  <tr key={i}>
                    <td>{t.title}</td>
                    <td>{t.subject}</td>
                    <td>{formatPct(t.percentage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.subjectTrends.length > 0 ? (
        <div className="portal-section">
          <h2>Subject trends</h2>
          {data.subjectTrends.map((st) => (
            <div key={st.subject} className="portal-card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{st.subject}</h3>
              <div className="portal-trend-chart">
                {st.points.map((p, i) => (
                  <div
                    key={i}
                    className="portal-trend-bar"
                    style={{
                      height: `${(p.percentage / Math.max(...st.points.map((x) => x.percentage), 100)) * 100}%`,
                    }}
                    title={`${p.percentage}%`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
