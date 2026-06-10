import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiDownload, apiFetch } from "../../api";
import TrendBadge from "../../components/dashboard/TrendBadge";
import type { PrincipalDashboardData } from "../../types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<PrincipalDashboardData | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PrincipalDashboardData>("/dashboard/principal")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;
  const snap = data?.academicSnapshot;

  async function downloadReport(type: "principal" | "governing-body") {
    setDownloading(type);
    try {
      const path =
        type === "principal"
          ? "/dashboard/reports/principal.pdf"
          : "/dashboard/reports/governing-body.pdf";
      await apiDownload(path, `${type}-report.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <h1 className="sc-page-title">Academic Intelligence Centre</h1>
      <p className="sc-page-subtitle">
        Principal overview for {user?.workspaceName}.
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.schoolAverage)}</div>
          <div>School average</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.passRate)}</div>
          <div>Pass rate</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.distinctionRate)}</div>
          <div>Distinction rate</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.atRiskLearnerCount ?? "—"}</div>
          <div>At-risk learners</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.assessmentsOutstanding ?? "—"}</div>
          <div>Assessments outstanding</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div>Moderation compliance</div>
        </div>
      </div>

      <div className="sc-card sc-card-gold" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <div className="sc-detail-label">Exam readiness score</div>
        <div className="sc-stat-value">
          {formatPct(stats?.examReadinessScore)}{" "}
          <span className="sc-badge sc-badge-muted" style={{ fontSize: "0.75rem" }}>
            {stats?.examReadinessStatus?.replaceAll("_", " ") ?? "—"}
          </span>
        </div>
      </div>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Academic snapshot</h2>
        <div className="sc-grid-2" style={{ gap: "1rem" }}>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Top subject</div>
            <div>{snap?.topSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>{formatPct(snap?.topSubject?.average)}</div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Lowest subject</div>
            <div>{snap?.lowestSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>{formatPct(snap?.lowestSubject?.average)}</div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Most improved</div>
            <div>{snap?.mostImprovedSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>
              {snap?.mostImprovedSubject?.improvementPct != null
                ? `+${snap.mostImprovedSubject.improvementPct}%`
                : "—"}
            </div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Most declined</div>
            <div>{snap?.mostDeclinedSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>
              {snap?.mostDeclinedSubject?.declinePct != null
                ? `-${snap.mostDeclinedSubject.declinePct}%`
                : "—"}
            </div>
          </div>
        </div>
      </section>

      <div className="sc-grid-2" style={{ gap: "1rem", marginTop: "1.5rem" }}>
        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Subject performance</h3>
          {data?.subjectPerformance.length ? (
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Pass</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.subjectPerformance.map((row) => (
                  <tr key={row.subject}>
                    <td>{row.subject}</td>
                    <td>{formatPct(row.average)}</td>
                    <td>{formatPct(row.passRate)}</td>
                    <td><TrendBadge trend={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>No published data yet.</p>
          )}
        </div>

        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Grade performance</h3>
          {data?.gradePerformance.length ? (
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Average</th>
                  <th>Pass</th>
                  <th>Distinctions</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.gradePerformance.map((row) => (
                  <tr key={row.grade}>
                    <td>{row.grade}</td>
                    <td>{formatPct(row.gradeAverage)}</td>
                    <td>{formatPct(row.passRate)}</td>
                    <td>{row.distinctions}</td>
                    <td><TrendBadge trend={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>No published data yet.</p>
          )}
        </div>
      </div>

      {data?.trends.historicalTrends.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Year-over-year trends</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Average</th>
                  <th>YoY change</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.trends.historicalTrends.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{formatPct(row.average)}</td>
                    <td>{row.yearOverYearChange != null ? `${row.yearOverYearChange}%` : "—"}</td>
                    <td><TrendBadge trend={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Executive reports</h3>
        <div className="sc-form-actions">
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={downloading != null}
            onClick={() => downloadReport("principal")}
          >
            {downloading === "principal" ? "Generating…" : "Principal report (PDF)"}
          </button>
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            disabled={downloading != null}
            onClick={() => downloadReport("governing-body")}
          >
            {downloading === "governing-body" ? "Generating…" : "Governing body report (PDF)"}
          </button>
          <Link to="/interventions" className="sc-btn sc-btn-ghost">
            Intervention tracker
          </Link>
          <Link to="/results" className="sc-btn sc-btn-ghost">
            Department results
          </Link>
        </div>
      </div>
    </div>
  );
}
