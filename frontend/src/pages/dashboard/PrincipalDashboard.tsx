import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTrialGate } from "../../trial/TrialGateContext";
import { apiDownload, apiFetch } from "../../api";
import DashboardHero from "../../components/dashboard/DashboardHero";
import IntelligencePanel from "../../components/dashboard/IntelligencePanel";
import KpiCard from "../../components/dashboard/KpiCard";
import PageLoader from "../../components/loading/PageLoader";
import TrendBadge from "../../components/dashboard/TrendBadge";
import {
  currentTerm,
  currentYear,
  firstName,
  greeting,
} from "../../components/dashboard/dashboardUtils";
import type { PrincipalDashboardData } from "../../types";
import "./Dashboard.css";
import "../../components/dashboard/DashboardHero.css";
import "../../components/dashboard/IntelligencePanel.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();
  const [data, setData] = useState<PrincipalDashboardData | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PrincipalDashboardData>("/dashboard/principal")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const snap = data?.academicSnapshot;
  const complianceScore = stats?.moderationCompliance ?? 0;
  const complianceOk = complianceScore >= 80;
  const readinessOk = stats?.examReadinessStatus === "READY";

  if (loading) {
    return <PageLoader message="Loading principal dashboard…" />;
  }

  async function downloadReport(type: "principal" | "governing-body") {
    if (!gateProductionAction()) return;
    setDownloading(type);
    try {
      const path =
        type === "principal"
          ? "/dashboard/reports/principal.pdf"
          : "/dashboard/reports/governing-body.pdf";
      await apiDownload(path, `${type}-report.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="sc-dash">
      <DashboardHero
        greeting={`${greeting()}, ${user ? firstName(user.fullName) : "there"}`}
        subtitle="ScriptCheck Principal Intelligence Dashboard"
        termLabel={`${currentTerm()} • ${currentYear()} · ${user?.workspaceName ?? ""}`}
        metrics={[
          {
            label: "School Compliance Score",
            value: formatPct(complianceScore),
            tone: complianceOk ? "success" : complianceScore >= 60 ? "warning" : "critical",
          },
          {
            label: "Assessment Readiness",
            value: formatPct(stats?.examReadinessScore),
            tone: readinessOk ? "success" : "warning",
          },
          {
            label: "School Average",
            value: formatPct(stats?.schoolAverage),
            tone: "gold",
          },
          {
            label: "At-risk Learners",
            value: stats?.atRiskLearnerCount ?? "—",
            tone: (stats?.atRiskLearnerCount ?? 0) > 0 ? "critical" : "success",
          },
        ]}
      />

      <div className="sc-dash-kpi-grid">
        <KpiCard
          value={formatPct(stats?.moderationCompliance)}
          label="School Compliance"
          hint="Moderation compliance rate"
          icon="◎"
          highlight={!complianceOk}
        />
        <KpiCard
          value={formatPct(stats?.examReadinessScore)}
          label="Assessment Readiness"
          hint={stats?.examReadinessStatus?.replaceAll("_", " ") ?? "—"}
          icon="◷"
          highlight={!readinessOk}
        />
        <KpiCard
          value={stats?.assessmentsOutstanding ?? "—"}
          label="Moderation Status"
          hint="Assessments outstanding"
          icon="⚖"
        />
        <KpiCard
          value={stats?.atRiskLearnerCount ?? "—"}
          label="Risk Indicators"
          hint="At-risk learners"
          icon="▲"
        />
      </div>

      <section className="sc-card sc-card-padded">
        <h2 className="sc-dash-section-title">School Assessment Health</h2>
        <p className="sc-muted">
          Compliance summary: {formatPct(stats?.moderationCompliance)} moderation compliance ·{" "}
          {stats?.assessmentsOutstanding ?? 0} assessments outstanding ·{" "}
          {stats?.publishedCount ?? 0} published.
        </p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost" style={{ marginTop: "0.5rem" }}>
          View all assessments with intelligence
        </Link>
      </section>

      <div className="sc-dash-two-col">
        <section>
        <h2 className="sc-dash-section-title">School Analytics</h2>
        <div className="sc-grid-2" style={{ gap: "1rem" }}>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Top subject</div>
            <div>{snap?.topSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>{formatPct(snap?.topSubject?.average)}</div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Lowest subject</div>
            <div>{snap?.lowestSubject?.subject ?? "—"}</div>
            <div style={{ color: "var(--sc-text-muted)" }}>{formatPct(snap?.lowestSubject?.average)}</div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Pass rate</div>
            <div className="sc-stat-value" style={{ fontSize: "1.5rem" }}>{formatPct(stats?.passRate)}</div>
          </div>
          <div className="sc-card" style={{ padding: "1rem" }}>
            <div className="sc-detail-label">Distinction rate</div>
            <div className="sc-stat-value" style={{ fontSize: "1.5rem" }}>{formatPct(stats?.distinctionRate)}</div>
          </div>
        </div>
        </section>

        <IntelligencePanel
          complianceScore={complianceScore}
          items={[
            {
              label: "Assessments Outstanding",
              value: stats?.assessmentsOutstanding ?? 0,
              status: (stats?.assessmentsOutstanding ?? 0) > 0 ? "warning" : "success",
            },
            {
              label: "Exam Readiness",
              value: formatPct(stats?.examReadinessScore),
              status: readinessOk ? "success" : "warning",
            },
            {
              label: "Pass Rate",
              value: formatPct(stats?.passRate),
              status: (stats?.passRate ?? 0) >= 70 ? "success" : "warning",
            },
            {
              label: "At-risk Learners",
              value: stats?.atRiskLearnerCount ?? 0,
              status: (stats?.atRiskLearnerCount ?? 0) > 0 ? "critical" : "success",
            },
          ]}
          recommendations={[
            !complianceOk
              ? "Focus on improving school-wide moderation compliance."
              : "School compliance is on track.",
            !readinessOk
              ? "Review exam readiness indicators before the next assessment cycle."
              : "Exam readiness status is healthy.",
          ]}
        />
      </div>

      <div className="sc-grid-2" style={{ gap: "1rem" }}>
        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 className="sc-dash-section-title">Subject performance</h3>
          {data?.subjectPerformance.length ? (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Average</th>
                    <th>Pass</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjectPerformance.map((row) => (
                    <tr key={row.subject}>
                      <td>{row.subject}</td>
                      <td>{formatPct(row.average)}</td>
                      <td>{formatPct(row.passRate)}</td>
                      <td><TrendBadge trend={row.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sc-dash-empty">No published data yet.</p>
          )}
        </div>

        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 className="sc-dash-section-title">Grade performance</h3>
          {data?.gradePerformance.length ? (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Average</th>
                    <th>Pass</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gradePerformance.map((row) => (
                    <tr key={row.grade}>
                      <td>{row.grade}</td>
                      <td>{formatPct(row.gradeAverage)}</td>
                      <td>{formatPct(row.passRate)}</td>
                      <td><TrendBadge trend={row.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sc-dash-empty">No published data yet.</p>
          )}
        </div>
      </div>

      <section>
        <h2 className="sc-dash-section-title">Quick Actions</h2>
        <div className="sc-dash-quick-actions">
          <button
            type="button"
            className="sc-dash-quick-btn is-primary"
            disabled={downloading != null}
            onClick={() => downloadReport("principal")}
          >
            {downloading === "principal" ? "Generating…" : "Principal Report (PDF)"}
          </button>
          <button
            type="button"
            className="sc-dash-quick-btn is-secondary"
            disabled={downloading != null}
            onClick={() => downloadReport("governing-body")}
          >
            {downloading === "governing-body" ? "Generating…" : "Governing Body Report"}
          </button>
          <Link to="/reports" className="sc-dash-quick-btn is-secondary">
            Reports & Analytics
          </Link>
          <Link to="/interventions" className="sc-dash-quick-btn is-secondary">
            Intervention Tracker
          </Link>
        </div>
      </section>
    </div>
  );
}
