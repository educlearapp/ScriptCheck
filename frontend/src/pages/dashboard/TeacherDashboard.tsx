import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { TeacherDashboardData } from "../../types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<TeacherDashboardData | null>(null);

  useEffect(() => {
    apiFetch<TeacherDashboardData>("/dashboard/academic")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;

  return (
    <div>
      <h1 className="sc-page-title">Teacher Dashboard</h1>
      <p className="sc-page-subtitle">
        Welcome back, {user?.fullName}. Track marking, moderation and published results.
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.awaitingMarkingCount ?? "—"}</div>
          <div>Assessments awaiting marking</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationPendingCount ?? "—"}</div>
          <div>Moderation pending</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.marksNotCapturedCount ?? "—"}</div>
          <div>Marks outstanding</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.recentImportsCount ?? "—"}</div>
          <div>Recent imports</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.importFailuresCount ?? "—"}</div>
          <div>Import failures (30d)</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.overdueAssessmentsCount ?? "—"}</div>
          <div>Assessments overdue</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.upcomingDeadlinesCount ?? "—"}</div>
          <div>Upcoming deadlines</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.publishedCount ?? "—"}</div>
          <div>Published results</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationPendingCount ?? "—"}</div>
          <div>Moderation pending</div>
        </div>
      </div>

      <div className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <div className="sc-detail-label">Average performance (published)</div>
        <div className="sc-stat-value" style={{ fontSize: "1.5rem" }}>
          {formatPct(stats?.averagePerformance)}
        </div>
      </div>

      {data?.awaitingMarking.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Assessments awaiting marking</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.awaitingMarking.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.subject.name}</td>
                    <td>
                      <Link to={`/assessments/${item.id}/scripts`} className="sc-btn sc-btn-ghost">
                        Scripts
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.submittedToHod.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Submitted to HOD</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.submittedToHod.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className="sc-badge sc-badge-muted">{item.status}</span>
                    </td>
                    <td>
                      <Link to={`/assessments/${item.id}`} className="sc-btn sc-btn-ghost">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.overdueAssessments.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Overdue assessments</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.overdueAssessments.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.subject.name}</td>
                    <td>
                      <Link to={`/assessments/${item.id}`} className="sc-btn sc-btn-ghost">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.upcomingDeadlines.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Upcoming deadlines</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.upcomingDeadlines.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}</td>
                    <td>
                      <Link to={`/assessments/${item.id}`} className="sc-btn sc-btn-ghost">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.recentImports?.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Recent imports</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.recentImports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fileName ?? "Import"}</td>
                    <td>{item.rowsImported ?? "—"} rows</td>
                    <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td>
                      {item.assessmentId ? (
                        <Link
                          to={`/assessments/${item.assessmentId}/results`}
                          className="sc-btn sc-btn-ghost"
                        >
                          Results
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.recentlyPublished.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Recently published</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.recentlyPublished.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{formatPct(item.classAverage)}</td>
                    <td>
                      <Link to={`/assessments/${item.id}/results`} className="sc-btn sc-btn-ghost">
                        Results
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="sc-card sc-card-gold" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Quick actions</h3>
        <div className="sc-form-actions">
          <Link to="/assessments/new" className="sc-btn sc-btn-primary">
            Create assessment
          </Link>
          <Link to="/results" className="sc-btn sc-btn-ghost">
            View results
          </Link>
          <Link to="/schedule" className="sc-btn sc-btn-ghost">
            Assessment schedule
          </Link>
          <Link to="/assessments" className="sc-btn sc-btn-ghost">
            All assessments
          </Link>
        </div>
      </div>
    </div>
  );
}
