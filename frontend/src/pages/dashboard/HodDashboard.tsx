import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import type { HodDashboardData } from "../../types";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function HodDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<HodDashboardData | null>(null);

  useEffect(() => {
    apiFetch<HodDashboardData>("/dashboard/academic")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const stats = data?.stats;

  return (
    <div>
      <h1 className="sc-page-title">HOD Dashboard</h1>
      <p className="sc-page-subtitle">
        Department oversight for {user?.fullName}. Moderate scripts and publish results.
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.scriptBatchesAwaitingModeration ?? "—"}</div>
          <div>Script batches awaiting moderation</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.assessmentsAwaitingHodReview ?? "—"}</div>
          <div>Assessments awaiting HOD review</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.resultsAwaitingPublishCount ?? "—"}</div>
          <div>Results awaiting publish</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.moderationQueueCount ?? "—"}</div>
          <div>Moderation queue</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.overdueModerationCount ?? "—"}</div>
          <div>Overdue moderation</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.publishedSubjectCount ?? "—"}</div>
          <div>Department subjects tracked</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Department average</div>
          <div className="sc-stat-value">{formatPct(stats?.departmentAverage)}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">At-risk learners</div>
          <div className="sc-stat-value">{stats?.atRiskLearnerCount ?? "—"}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Weak topics tracked</div>
          <div className="sc-stat-value">{data?.weakTopics.length ?? "—"}</div>
        </div>
      </div>

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

      {data?.resultsAwaitingPublish.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Results awaiting publish approval</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.resultsAwaitingPublish.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.creatorTeacher.fullName}</td>
                    <td>
                      <Link to={`/assessments/${item.id}/results`} className="sc-btn sc-btn-primary">
                        Review & publish
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.weakTopics.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Weak topics across department</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Avg %</th>
                  <th>Assessments</th>
                </tr>
              </thead>
              <tbody>
                {data.weakTopics.map((topic) => (
                  <tr key={topic.topic}>
                    <td>{topic.topic}</td>
                    <td>{formatPct(topic.averagePercentage)}</td>
                    <td>{topic.assessmentCount}</td>
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
          <Link to="/results" className="sc-btn sc-btn-ghost">
            Department results
          </Link>
          <Link to="/assessments" className="sc-btn sc-btn-ghost">
            Browse assessments
          </Link>
        </div>
      </div>
    </div>
  );
}
