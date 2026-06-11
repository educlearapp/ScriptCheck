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
import type { ExaminationBodyDashboardData } from "../../types/phase2";
import "./Dashboard.css";
import "../../components/dashboard/DashboardHero.css";
import "../../components/dashboard/IntelligencePanel.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function ExamBodyDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ExaminationBodyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ExaminationBodyDashboardData>("/dashboard/examination-body")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const complianceScore = stats?.averageComplianceScore ?? 0;
  const complianceIssues = Math.max(0, 100 - complianceScore);

  if (loading) {
    return <PageLoader message="Loading examination body dashboard…" />;
  }

  return (
    <div className="sc-dash">
      <DashboardHero
        greeting={`${greeting()}, ${user ? firstName(user.fullName) : "there"}`}
        subtitle="ScriptCheck Examination Body Intelligence Dashboard"
        termLabel={`${currentTerm()} • ${currentYear()} · ${user?.workspaceName ?? ""}`}
        metrics={[
          {
            label: "Compliance Score",
            value: formatPct(complianceScore),
            tone: complianceScore >= 80 ? "success" : complianceScore >= 60 ? "warning" : "critical",
          },
          {
            label: "Awaiting Approval",
            value: stats?.awaitingApproval ?? "—",
            tone: (stats?.awaitingApproval ?? 0) > 0 ? "warning" : "success",
          },
          {
            label: "Published",
            value: stats?.publishedCount ?? "—",
            tone: "success",
          },
          {
            label: "Archived",
            value: stats?.archivedCount ?? "—",
            tone: "default",
          },
        ]}
      />

      <div className="sc-dash-kpi-grid">
        <KpiCard
          value={stats?.awaitingApproval ?? "—"}
          label="Awaiting Approval"
          hint="Assessments pending sign-off"
          icon="▣"
          highlight
        />
        <KpiCard
          value={Math.round(complianceIssues)}
          label="Compliance Gap"
          hint="Below 100% compliance"
          icon="▲"
        />
        <KpiCard
          to="/moderation"
          value={stats?.moderatedBatches ?? "—"}
          label="Moderated Batches"
          hint="Approved script batches"
          icon="⚖"
        />
        <KpiCard
          value={stats?.publishedCount ?? "—"}
          label="Published"
          hint="Live assessments"
          icon="◎"
        />
      </div>

      <div className="sc-dash-two-col">
        <section>
          <h2 className="sc-dash-section-title">Approval Workflow</h2>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <p style={{ margin: "0 0 1rem", color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
              Track school submissions and approval status across your examination body network.
            </p>
          </div>
        </section>

        <IntelligencePanel
          complianceScore={complianceScore}
          items={[
            {
              label: "Awaiting Approval",
              value: stats?.awaitingApproval ?? 0,
              status: (stats?.awaitingApproval ?? 0) > 0 ? "warning" : "success",
            },
            {
              label: "Avg Compliance",
              value: formatPct(complianceScore),
              status: complianceIssues > 20 ? "critical" : complianceIssues > 0 ? "warning" : "success",
            },
            {
              label: "Published",
              value: stats?.publishedCount ?? 0,
              status: "success",
            },
            {
              label: "Archived",
              value: stats?.archivedCount ?? 0,
              status: "success",
            },
          ]}
          recommendations={[
            (stats?.awaitingApproval ?? 0) > 0
              ? "Prioritise assessments in the approval pipeline."
              : "All assessments are current in the approval workflow.",
            complianceIssues > 0
              ? "Review low-compliance assessments before publication."
              : "Compliance scores are healthy across the network.",
          ]}
        />
      </div>

      <DashboardIntelligenceAlerts
        title="Schools Awaiting Approval — Compliance Issues"
        items={
          data?.approvalPipeline.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: `${row.subject} · ${row.grade}`,
          })) ?? []
        }
      />

      <section>
        <h2 className="sc-dash-section-title">Approval Pipeline</h2>
        <div className="sc-card" style={{ padding: 0 }}>
          {data?.approvalPipeline.length ? (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Subject</th>
                    <th>Grade</th>
                    <th>Compliance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.approvalPipeline.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.subject}</td>
                      <td>{row.grade}</td>
                      <td>{row.complianceScore != null ? `${row.complianceScore}%` : "—"}</td>
                      <td>
                        <Link to={`/assessments/${row.id}`} className="sc-link">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sc-dash-empty">No assessments in the approval pipeline.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="sc-dash-section-title">Quick Actions</h2>
        <div className="sc-dash-quick-actions">
          <Link to="/moderation" className="sc-dash-quick-btn is-primary">
            Moderation Centre
          </Link>
          <Link to="/reports" className="sc-dash-quick-btn is-secondary">
            CAPS Analytics
          </Link>
          <Link to="/results" className="sc-dash-quick-btn is-secondary">
            Department Results
          </Link>
          <Link to="/dashboard/examinations" className="sc-dash-quick-btn is-secondary">
            Examination Operations
          </Link>
        </div>
      </section>
    </div>
  );
}
