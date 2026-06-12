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
import { getModerationReviewPath } from "../moderation/shared/moderationReviewLink";
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
    <div className="sc-dash sc-dash-compact">
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
                    {data.teacherOverview.slice(0, 4).map((teacher) => (
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

      <div className="sc-dash-bottom-row sc-dash-bottom-row-3">
        <DashboardIntelligenceAlerts
          compact
          title="Awaiting Approval"
          items={
            data?.moderationQueue.map((batch) => ({
              id: batch.assessment.id,
              title: batch.assessment.title,
              subtitle: batch.assessment.subject.name,
            })) ?? []
          }
          emptyMessage="No assessments awaiting department approval."
        />

        <section className="sc-card sc-card-padded sc-dash-strip">
          <h2 className="sc-dash-section-title">Moderation Queue</h2>
          {data?.moderationQueue.length ? (
            <ul className="sc-dash-activity-compact">
              {data.moderationQueue.slice(0, 3).map((batch) => (
                <li key={batch.id}>
                  <span className="sc-dash-activity-dot" />
                  <span className="sc-dash-activity-text">{batch.title}</span>
                  <Link
                    to={getModerationReviewPath({
                      assessmentId: batch.assessment.id,
                      batchId: batch.id,
                      type: "script_batch",
                    })}
                    className="sc-btn sc-btn-ghost"
                    style={{ padding: "0.2rem 0.45rem", fontSize: "0.68rem", marginLeft: "auto", flexShrink: 0 }}
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sc-muted" style={{ margin: 0, fontSize: "0.72rem" }}>
              No batches pending moderation.
            </p>
          )}
        </section>

        <section className="sc-card sc-card-padded sc-dash-strip">
          <h2 className="sc-dash-section-title">At-risk Learners</h2>
          {atRisk.length ? (
            <ul className="sc-dash-activity-compact">
              {atRisk.slice(0, 3).map((l) => (
                <li key={l.learnerId}>
                  <span className="sc-dash-activity-dot" />
                  <span className="sc-dash-activity-text">{l.learnerName}</span>
                  <Link
                    to={`/learners/${l.learnerId}/history`}
                    className="sc-btn sc-btn-ghost"
                    style={{ padding: "0.2rem 0.45rem", fontSize: "0.68rem", marginLeft: "auto", flexShrink: 0 }}
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sc-muted" style={{ margin: 0, fontSize: "0.72rem" }}>
              No at-risk learners flagged.
            </p>
          )}
        </section>
      </div>

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
            Results &amp; Analytics
          </Link>
          <Link to="/reports" className="sc-dash-quick-btn is-secondary">
            Operational Reports
          </Link>
        </div>
      </section>
    </div>
  );
}
