import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDownload, apiFetch } from "../../api";
import { useTrialGate } from "../../trial/TrialGateContext";
import type { ExaminationDashboardData, GradeReadiness } from "../../types";

function formatPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function ExaminationDashboard() {
  const { gateProductionAction } = useTrialGate();
  const [data, setData] = useState<ExaminationDashboardData | null>(null);
  const [gradeReadiness, setGradeReadiness] = useState<GradeReadiness[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<ExaminationDashboardData>("/examinations/dashboard"),
      apiFetch<GradeReadiness[]>("/examinations/readiness/by-grade"),
    ])
      .then(([dash, grades]) => {
        setData(dash);
        setGradeReadiness(grades);
      })
      .catch(() => {
        setData(null);
        setGradeReadiness([]);
      });
  }, []);

  const stats = data?.stats;

  async function downloadReport(type: "principal" | "board") {
    if (!gateProductionAction()) return;
    setDownloading(true);
    try {
      await apiDownload(
        type === "principal" ? "/examinations/reports/principal.pdf" : "/examinations/reports/board.pdf",
        `${type}-examination-report.pdf`
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <h1 className="sc-page-title">Examination Operations Dashboard</h1>
      <p className="sc-page-subtitle">Examination planning, administration and compliance overview.</p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.examsScheduled ?? "—"}</div>
          <div>Exams scheduled</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.examsCompleted ?? "—"}</div>
          <div>Exams completed</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.examsOutstanding ?? "—"}</div>
          <div>Exams outstanding</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.readinessScore)}</div>
          <div>Readiness score · {stats?.readinessStatus?.replaceAll("_", " ") ?? "—"}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.invigilatorsAssigned ?? "—"}/{stats?.invigilatorsRequired ?? "—"}</div>
          <div>Invigilators assigned</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div>Moderation compliance</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.incidentsLogged ?? "—"}</div>
          <div>Incidents logged</div>
        </div>
      </div>

      {gradeReadiness.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Readiness by grade</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr><th>Grade</th><th>Readiness</th><th>Status</th></tr>
              </thead>
              <tbody>
                {gradeReadiness.map((g) => (
                  <tr key={g.gradeId}>
                    <td>{g.grade}</td>
                    <td>{formatPct(g.readinessPercentage)}</td>
                    <td>{g.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.upcomingSessions.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Upcoming sessions</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.upcomingSessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{new Date(s.scheduledStart).toLocaleString()}</td>
                    <td>{s.venue}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <div className="sc-form-actions">
          <Link to="/examinations/timetable" className="sc-btn sc-btn-primary">Timetable</Link>
          <Link to="/examinations/sessions" className="sc-btn sc-btn-ghost">Sessions</Link>
          <Link to="/examinations/invigilators" className="sc-btn sc-btn-ghost">Invigilators</Link>
          <Link to="/moderation" className="sc-btn sc-btn-ghost">Moderation centre</Link>
          <button type="button" className="sc-btn sc-btn-ghost" disabled={downloading} onClick={() => downloadReport("principal")}>
            Principal report
          </button>
          <button type="button" className="sc-btn sc-btn-ghost" disabled={downloading} onClick={() => downloadReport("board")}>
            Board report
          </button>
        </div>
      </div>
    </div>
  );
}
