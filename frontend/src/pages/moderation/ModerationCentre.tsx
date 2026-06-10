import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import type { ModerationCentreData } from "../../types";

function formatPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function ModerationCentrePage() {
  const [data, setData] = useState<ModerationCentreData | null>(null);

  useEffect(() => {
    apiFetch<ModerationCentreData>("/moderation")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;

  return (
    <div>
      <h1 className="sc-page-title">Moderation Centre</h1>
      <p className="sc-page-subtitle">Moderation queue, variance reports and compliance tracking.</p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.awaitingModeration ?? "—"}</div>
          <div>Awaiting moderation</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationCompleted ?? "—"}</div>
          <div>Moderation completed</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationOverdue ?? "—"}</div>
          <div>Moderation overdue</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div>Compliance score</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.varianceFlagged ?? "—"}</div>
          <div>Variance flagged</div>
        </div>
      </div>

      {data?.varianceReports.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Variance reports</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr><th>Learner</th><th>Teacher</th><th>Moderator</th><th>Variance</th><th>Level</th></tr>
              </thead>
              <tbody>
                {data.varianceReports.map((v) => (
                  <tr key={v.scriptId}>
                    <td>{v.learnerName}</td>
                    <td>{v.teacherMark ?? "—"}</td>
                    <td>{v.moderatorMark ?? "—"}</td>
                    <td>{v.variancePercent != null ? `${v.variancePercent}%` : "—"}</td>
                    <td>{v.varianceLevel.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.awaitingModeration.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Awaiting moderation</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.awaitingModeration.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title}</td>
                    <td>{b.assessment.subject.name}</td>
                    <td>{b.assessment.creatorTeacher.fullName}</td>
                    <td>
                      <Link to={`/assessments/${b.assessment.id}/scripts`} className="sc-btn sc-btn-primary">
                        Moderate
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <Link to="/moderation/queue" className="sc-btn sc-btn-ghost">Open HOD moderation queue</Link>
      </div>
    </div>
  );
}
