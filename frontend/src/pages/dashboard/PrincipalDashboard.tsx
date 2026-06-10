import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../api";
import type { PrincipalDashboardData } from "../../types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<PrincipalDashboardData | null>(null);

  useEffect(() => {
    apiFetch<PrincipalDashboardData>("/dashboard/academic")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;

  return (
    <div>
      <h1 className="sc-page-title">Principal / Admin Dashboard</h1>
      <p className="sc-page-subtitle">
        School-wide academic overview for {user?.workspaceName}.
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.totalAssessments ?? "—"}</div>
          <div>Total assessments</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.publishedCount ?? "—"}</div>
          <div>Published assessments</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.averagePassRate)}</div>
          <div>Average pass rate</div>
        </div>
      </div>

      <div className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <div className="sc-detail-label">At-risk learners (published assessments)</div>
        <div className="sc-stat-value">{stats?.atRiskLearnerCount ?? "—"}</div>
      </div>

      <div className="sc-grid-2" style={{ gap: "1rem", marginTop: "1.5rem" }}>
        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Subject performance</h3>
          {data?.subjectPerformance.length ? (
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Pass rate</th>
                  <th>Assessments</th>
                </tr>
              </thead>
              <tbody>
                {data.subjectPerformance.map((row) => (
                  <tr key={row.subject}>
                    <td>{row.subject}</td>
                    <td>{formatPct(row.averagePassRate)}</td>
                    <td>{row.assessmentCount}</td>
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
                  <th>Pass rate</th>
                  <th>Assessments</th>
                </tr>
              </thead>
              <tbody>
                {data.gradePerformance.map((row) => (
                  <tr key={row.grade}>
                    <td>{row.grade}</td>
                    <td>{formatPct(row.averagePassRate)}</td>
                    <td>{row.assessmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>No published data yet.</p>
          )}
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Department results</h3>
          <Link to="/results" className="sc-btn sc-btn-ghost">
            View all results
          </Link>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Users & roles</h3>
          <Link to="/users" className="sc-btn sc-btn-ghost">
            Open users
          </Link>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Curriculum</h3>
          <Link to="/curriculum" className="sc-btn sc-btn-ghost">
            Open curriculum
          </Link>
        </div>
      </div>
    </div>
  );
}
