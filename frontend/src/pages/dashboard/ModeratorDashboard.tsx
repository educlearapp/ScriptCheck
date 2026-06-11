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
import type { ModeratorDashboardData } from "../../types/phase2";
import "./Dashboard.css";
import "../../components/dashboard/DashboardHero.css";
import "../../components/dashboard/IntelligencePanel.css";

export default function ModeratorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ModeratorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ModeratorDashboardData>("/dashboard/moderator")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <PageLoader message="Loading moderator dashboard…" />;
  }

  const stats = data?.stats;
  const compliance = stats?.moderationCompliance ?? 0;

  return (
    <div className="sc-dash">
      <DashboardHero
        greeting={`${greeting()}, ${user ? firstName(user.fullName) : "there"}`}
        subtitle="ScriptCheck Moderator Dashboard"
        termLabel={`${currentTerm()} • ${currentYear()}`}
        metrics={[
          { label: "Moderation Queue", value: stats?.awaitingModeration ?? "—", tone: "gold" },
          { label: "Pending Approvals", value: stats?.pendingApprovals ?? "—", tone: "warning" },
          { label: "Variance Flagged", value: stats?.varianceFlagged ?? "—", tone: "critical" },
          { label: "Compliance", value: `${compliance}%`, tone: compliance >= 80 ? "success" : "warning" },
        ]}
      />

      <div className="sc-dash-grid sc-dash-grid-2">
        <IntelligencePanel
          complianceScore={compliance}
          items={[
            { label: "Assessments in Moderation", value: data?.moderationQueue.length ?? 0, status: "warning" },
            { label: "Low Compliance", value: stats?.lowComplianceCount ?? 0, status: "critical" },
            { label: "Overdue", value: stats?.moderationOverdue ?? 0, status: "critical" },
          ]}
          recommendations={[
            "Review assessments with compliance scores below 60%",
            "Resolve pending approval requests promptly",
            "Check variance-flagged scripts before final approval",
          ]}
        />

        <section className="sc-card sc-card-padded">
          <h2 className="sc-dash-section-title">Moderation Queue</h2>
          <div className="sc-dash-table-wrap">
            <table className="sc-dash-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Subject</th>
                  <th>Compliance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.moderationQueue ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.subject}</td>
                    <td>{item.complianceScore != null ? `${item.complianceScore}%` : "—"}</td>
                    <td>
                      <Link to={`/assessments/${item.id}`} className="sc-link">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="sc-dash-kpi-grid">
        <KpiCard label="Completed" value={stats?.moderationCompleted ?? 0} hint="Moderation done" icon="✓" />
        <KpiCard label="Awaiting DH" value={stats?.assessmentsAwaitingHod ?? 0} hint="DH review queue" icon="◎" />
        <KpiCard label="Risk Items" value={stats?.lowComplianceCount ?? 0} hint="Low compliance" icon="▲" />
      </div>

      <section className="sc-card sc-card-padded">
        <h2 className="sc-dash-section-title">Pending Approval Requests</h2>
        {(data?.pendingApprovals ?? []).length === 0 ? (
          <p className="sc-muted">No pending approval requests.</p>
        ) : (
          <ul className="sc-dash-list">
            {data?.pendingApprovals.map((req) => (
              <li key={req.id}>
                <Link to={`/assessments/${req.assessment.id}`}>
                  {req.assessment.title}
                </Link>
                {" — "}
                {req.requestedBy.fullName} → {req.assignedRole.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
