import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { TeacherDashboardData } from "../../types";
import "../dashboard/Dashboard.css";

export default function ReportsAnalytics() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);

  useEffect(() => {
    apiFetch<TeacherDashboardData>("/dashboard/teacher")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;
  const timeSaved = data?.timeSaved;

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Reports & Analytics</h1>
          <p className="sc-page-subtitle">
            Operational metrics and time-saving insights across your assessments.
          </p>
        </div>
      </header>

      <section>
        <h2 className="sc-dash-section-title">Import & Portal Activity</h2>
        <div className="sc-grid-4">
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{stats?.recentImportsCount ?? "—"}</div>
            <div>Recent Imports</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{stats?.importFailuresCount ?? "—"}</div>
            <div>Import Failures (30d)</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{stats?.portalLogins30d ?? "—"}</div>
            <div>Portal Logins (30d)</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{stats?.portalReportDownloads30d ?? "—"}</div>
            <div>Report Downloads (30d)</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="sc-dash-section-title">Processing & Productivity</h2>
        <div className="sc-grid-4">
          <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{timeSaved?.scriptsProcessed ?? "—"}</div>
            <div>Scripts Processed</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{timeSaved?.reportsGenerated ?? "—"}</div>
            <div>Reports Generated</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{timeSaved?.moderationsCompleted ?? "—"}</div>
            <div>Moderations Completed</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-stat-value">{timeSaved?.estimatedHoursSaved ?? "—"}h</div>
            <div>Estimated Hours Saved</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="sc-dash-section-title">Performance Summary</h2>
        <div className="sc-grid-3">
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-detail-label">Published results</div>
            <div className="sc-stat-value">{stats?.publishedCount ?? "—"}</div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-detail-label">Average performance</div>
            <div className="sc-stat-value">
              {stats?.averagePerformance != null ? `${stats.averagePerformance}%` : "—"}
            </div>
          </div>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-detail-label">Overdue assessments</div>
            <div className="sc-stat-value">{stats?.overdueAssessmentsCount ?? "—"}</div>
          </div>
        </div>
      </section>

      {data?.recentImports?.length ? (
        <section>
          <h2 className="sc-dash-section-title">Recent Imports</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Rows</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentImports.map((item) => (
                    <tr key={item.id}>
                      <td>{item.fileName ?? "Import"}</td>
                      <td>{item.rowsImported ?? "—"}</td>
                      <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
