import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import DashboardHero from "../../components/dashboard/DashboardHero";
import IntelligencePanel from "../../components/dashboard/IntelligencePanel";
import KpiCard from "../../components/dashboard/KpiCard";
import PageLoader from "../../components/loading/PageLoader";
import {
  currentTerm,
  currentYear,
  firstName,
  greeting,
} from "../../components/dashboard/dashboardUtils";
import DashboardIntelligenceAlerts from "../../components/dashboard/DashboardIntelligenceAlerts";
import BetaBanner from "../../components/beta/BetaBanner";
import type { AtRiskLearner, HodDashboardData } from "../../types";
import "./Dashboard.css";
import "../../components/dashboard/DashboardHero.css";
import "../../components/dashboard/IntelligencePanel.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function HodDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<HodDashboardData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskLearner[]>([]);
  const [loading, setLoading] = useState(true);

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
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const activeTeachers = data?.teacherOverview.length ?? 0;
  const complianceScore = stats?.moderationCompliance ?? 0;

  if (loading) {
    return <PageLoader message="Loading DH dashboard…" />;
  }

  return (
    <div className="sc-dash">
      <BetaBanner />
      <DashboardHero
        greeting={`${greeting()}, ${user ? firstName(user.fullName) : "there"}`}
        subtitle="ScriptCheck DH Intelligence Dashboard"
        termLabel={`${currentTerm()} • ${currentYear()}`}
        metrics={[
          {
            label: "Department Compliance",
            value: formatPct(complianceScore),
            tone: complianceScore >= 80 ? "success" : complianceScore >= 60 ? "warning" : "critical",
          },
          {
            label: "Awaiting Approval",
            value: stats?.assessmentsAwaitingHodReview ?? "—",
            tone: (stats?.assessmentsAwaitingHodReview ?? 0) > 0 ? "warning" : "default",
          },
          {
            label: "Moderation Queue",
            value: stats?.moderationQueueCount ?? "—",
            tone: "gold",
          },
          {
            label: "Department Average",
            value: formatPct(stats?.departmentAverage),
            tone: "default",
          },
        ]}
      />

      <div className="sc-dash-kpi-grid">
        <KpiCard
          to="/moderation/queue"
          value={stats?.assessmentsAwaitingHodReview ?? "—"}
          label="Assessments Awaiting Approval"
          hint="Require your sign-off"
          icon="✓"
          highlight
        />
        <KpiCard
          to="/moderation/queue"
          value={stats?.moderationQueueCount ?? "—"}
          label="Moderation Queue"
          hint="Batches pending review"
          icon="⚖"
        />
        <KpiCard
          value={formatPct(stats?.moderationCompliance)}
          label="Subject Compliance"
          hint="Moderation compliance rate"
          icon="◎"
        />
        <KpiCard
          value={activeTeachers}
          label="Teacher Activity"
          hint="Active teachers in department"
          icon="◆"
        />
      </div>

      <div className="sc-dash-two-col">
        <section>
          <h2 className="sc-dash-section-title">Teacher Activity</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            {data?.teacherOverview.length ? (
              <div className="sc-table-wrap">
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
            ) : (
              <p className="sc-dash-empty">No teacher activity data available.</p>
            )}
          </div>
        </section>

        <IntelligencePanel
          complianceScore={complianceScore}
          items={[
            {
              label: "Awaiting Moderation",
              value: stats?.moderationQueueCount ?? 0,
              status: (stats?.moderationQueueCount ?? 0) > 0 ? "warning" : "success",
            },
            {
              label: "DH Review Pending",
              value: stats?.assessmentsAwaitingHodReview ?? 0,
              status: (stats?.assessmentsAwaitingHodReview ?? 0) > 0 ? "warning" : "success",
            },
            {
              label: "At-risk Learners",
              value: atRisk.length,
              status: atRisk.length > 0 ? "critical" : "success",
            },
            {
              label: "Active Teachers",
              value: activeTeachers,
              status: "success",
            },
          ]}
          recommendations={[
            (stats?.assessmentsAwaitingHodReview ?? 0) > 0
              ? "Review assessments awaiting DH approval promptly."
              : "Department approvals are up to date.",
            (stats?.moderationQueueCount ?? 0) > 0
              ? "Clear the moderation queue to improve compliance."
              : "Moderation queue is clear.",
          ]}
        />
      </div>

      <DashboardIntelligenceAlerts
        title="Compliance Issues — Assessments Awaiting Approval"
        items={
          data?.moderationQueue.map((batch) => ({
            id: batch.assessment.id,
            title: batch.assessment.title,
            subtitle: batch.assessment.subject.name,
          })) ?? []
        }
        emptyMessage="No assessments awaiting department approval."
      />

      {data?.moderationQueue.length ? (
        <section>
          <h2 className="sc-dash-section-title">Moderation Queue</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <div className="sc-table-wrap">
              <table className="sc-table">
                <tbody>
                  {data.moderationQueue.map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.title}</td>
                      <td>{batch.assessment.subject.name}</td>
                      <td>{batch.createdBy?.fullName}</td>
                      <td>
                        <Link
                          to={`/assessments/${batch.assessment.id}/scripts`}
                          className="sc-btn sc-btn-primary"
                          style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                        >
                          Moderate
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {atRisk.length ? (
        <section>
          <h2 className="sc-dash-section-title">At-risk learners</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <div className="sc-table-wrap">
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
                        <Link to={`/learners/${l.learnerId}/history`} className="sc-btn sc-btn-ghost" style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}>
                          History
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="sc-dash-section-title">Quick Actions</h2>
        <div className="sc-dash-quick-actions">
          <Link to="/moderation/queue" className="sc-dash-quick-btn is-primary">
            Moderation Queue
          </Link>
          <Link to="/interventions" className="sc-dash-quick-btn is-secondary">
            Interventions
          </Link>
          <Link to="/results" className="sc-dash-quick-btn is-secondary">
            Department Results
          </Link>
          <Link to="/reports" className="sc-dash-quick-btn is-secondary">
            Reports & Analytics
          </Link>
        </div>
      </section>
    </div>
  );
}
