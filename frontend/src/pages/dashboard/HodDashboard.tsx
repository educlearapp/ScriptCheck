import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { AtRiskLearner, HodDashboardData } from "../../types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function HodDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<HodDashboardData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskLearner[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<HodDashboardData>("/dashboard/hod"),
      apiFetch<AtRiskLearner[]>("/analysis/at-risk"),
    ])
      .then(([dash, risk]) => {
        setData(dash);
        setAtRisk(risk);
      })
      .catch(() => {
        setData(null);
        setAtRisk([]);
      });
  }, []);

  const stats = data?.stats;

  return (
    <div>
      <h1 className="sc-page-title">HOD Performance Centre</h1>
      <p className="sc-page-subtitle">
        Department oversight for {user?.fullName}. Support and management view.
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.departmentAverage)}</div>
          <div>Department average</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.moderationCompliance)}</div>
          <div>Moderation compliance</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.outstandingAssessments ?? "—"}</div>
          <div>Outstanding assessments</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.atRiskLearnerCount ?? "—"}</div>
          <div>At-risk learners</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{formatPct(stats?.examReadinessScore)}</div>
          <div>
            Exam readiness{" "}
            <span className="sc-badge sc-badge-muted" style={{ fontSize: "0.7rem" }}>
              {stats?.examReadinessStatus?.replaceAll("_", " ") ?? "—"}
            </span>
          </div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationQueueCount ?? "—"}</div>
          <div>Moderation queue</div>
        </div>
      </div>

      {data?.teacherOverview.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Teacher overview</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Created</th>
                  <th>Marked</th>
                  <th>Moderations</th>
                  <th>Outstanding</th>
                  <th>Learner avg</th>
                </tr>
              </thead>
              <tbody>
                {data.teacherOverview.map((teacher) => (
                  <tr key={teacher.teacherId}>
                    <td>{teacher.teacherName}</td>
                    <td>{teacher.assessmentsCreated}</td>
                    <td>{teacher.assessmentsMarked}</td>
                    <td>{teacher.moderationsCompleted}</td>
                    <td>{teacher.outstandingTasks}</td>
                    <td>{formatPct(teacher.learnerAverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.moderationQueue.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Moderation queue</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.moderationQueue.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.title}</td>
                    <td>{batch.assessment.subject.name}</td>
                    <td>{batch.createdBy?.fullName}</td>
                    <td>
                      <Link to={`/assessments/${batch.assessment.id}/scripts`} className="sc-btn sc-btn-primary">
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

      {atRisk.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>At-risk learners</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Class</th>
                  <th>Reasons</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {atRisk.slice(0, 8).map((l) => (
                  <tr key={l.learnerId}>
                    <td>{l.learnerName}</td>
                    <td>{l.className ?? "—"}</td>
                    <td>{l.reasons.join(", ").replaceAll("_", " ")}</td>
                    <td>
                      <Link to={`/learners/${l.learnerId}/history`} className="sc-btn sc-btn-ghost">
                        History
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
        <div className="sc-form-actions">
          <Link to="/moderation/queue" className="sc-btn sc-btn-primary">
            Moderation queue
          </Link>
          <Link to="/interventions" className="sc-btn sc-btn-ghost">
            Interventions
          </Link>
          <Link to="/results" className="sc-btn sc-btn-ghost">
            Department results
          </Link>
        </div>
      </div>
    </div>
  );
}
