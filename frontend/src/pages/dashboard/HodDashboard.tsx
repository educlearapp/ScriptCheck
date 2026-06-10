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
      apiFetch<HodDashboardData>("/dashboard/academic"),
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
          <div className="sc-stat-value">{stats?.importedAssessmentsCount ?? "—"}</div>
          <div>Imported assessments</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.importFailuresCount ?? "—"}</div>
          <div>Validation failures (30d)</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.portalAdoptionCount ?? "—"}</div>
          <div>Portal adoption (30d)</div>
        </div>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.portalReportDownloads ?? "—"}</div>
          <div>Report downloads</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{stats?.concessionLearnerCount ?? "—"}</div>
          <div>Concession learners</div>
        </div>
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

      {data?.recentImports?.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Recent mark imports</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.recentImports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.actor?.fullName ?? "—"}</td>
                    <td>{item.fileName ?? "Import"}</td>
                    <td>{item.rowsImported ?? "—"}</td>
                    <td>{item.action === "BULK_MARK_IMPORT_FAILED" ? "Failed" : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.portalActivity?.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Portal activity</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {data.portalActivity.map((item) => (
                  <tr key={item.id}>
                    <td>{item.action.replaceAll("_", " ")}</td>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
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
