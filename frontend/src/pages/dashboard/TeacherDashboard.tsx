import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import DashboardHero from "../../components/dashboard/DashboardHero";
import IntelligencePanel, {
  type IntelItem,
} from "../../components/dashboard/IntelligencePanel";
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
import AssessmentIntelligenceBadge from "../../components/intelligence/AssessmentIntelligenceBadge";
import { fetchIntelligenceReport } from "../../services/intelligenceApi";
import type { DepartmentResultItem, TeacherDashboardData } from "../../types";
import "../../components/intelligence/AssessmentHealthReport.css";
import "./Dashboard.css";
import "../../components/dashboard/DashboardHero.css";
import "../../components/dashboard/IntelligencePanel.css";

type AssessmentRow = DepartmentResultItem & {
  dueDate?: string | null;
  displayStatus: string;
};

function statusClass(displayStatus: string): string {
  if (displayStatus === "PUBLISHED" || displayStatus === "APPROVED") return "is-published";
  if (displayStatus === "OVERDUE") return "is-overdue";
  if (["SUBMITTED TO DH", "AWAITING MODERATION", "MARKING", "MARKED"].includes(displayStatus)) {
    return "is-pending";
  }
  return "is-draft";
}

function buildAssessmentRows(data: TeacherDashboardData | null): AssessmentRow[] {
  if (!data) return [];
  const map = new Map<string, AssessmentRow>();

  for (const item of data.awaitingMarking) {
    map.set(item.id, { ...item, displayStatus: "MARKING" });
  }
  for (const item of data.submittedToHod) {
    map.set(item.id, { ...item, displayStatus: item.status.replaceAll("_", " ") });
  }
  for (const item of data.overdueAssessments) {
    map.set(item.id, { ...item, displayStatus: "OVERDUE" });
  }
  for (const item of data.upcomingDeadlines) {
    const existing = map.get(item.id);
    map.set(item.id, {
      ...(existing ?? item),
      dueDate: item.dueDate,
      displayStatus: existing?.displayStatus ?? item.status.replaceAll("_", " "),
    });
  }
  for (const item of data.recentlyPublished) {
    if (!map.has(item.id)) {
      map.set(item.id, { ...item, displayStatus: item.status.replaceAll("_", " ") });
    }
  }

  return Array.from(map.values()).slice(0, 5);
}

type ActivityItem = { id: string; text: string; time: string };

function buildActivity(data: TeacherDashboardData | null): ActivityItem[] {
  if (!data) return [];
  const items: ActivityItem[] = [];

  for (const item of data.recentlyPublished.slice(0, 3)) {
    items.push({
      id: `pub-${item.id}`,
      text: `Results published — ${item.title}`,
      time: item.publishedAt ?? new Date().toISOString(),
    });
  }
  for (const item of data.submittedToHod.slice(0, 2)) {
    items.push({
      id: `hod-${item.id}`,
      text: `Assessment submitted for approval — ${item.title}`,
      time: new Date().toISOString(),
    });
  }
  for (const item of data.portalActivity.slice(0, 4)) {
    const action = item.action.replaceAll("_", " ");
    items.push({
      id: item.id,
      text: action.charAt(0).toUpperCase() + action.slice(1),
      time: item.createdAt,
    });
  }

  return items
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 3);
}

function assessmentAction(row: AssessmentRow): { to: string; label: string } {
  if (row.displayStatus === "MARKING" || row.displayStatus === "OVERDUE") {
    return { to: `/assessments/${row.id}/scripts`, label: "Mark" };
  }
  if (row.displayStatus === "PUBLISHED") {
    return { to: `/assessments/${row.id}/results`, label: "Results" };
  }
  return { to: `/assessments/${row.id}`, label: "View" };
}

function computeComplianceScore(stats: TeacherDashboardData["stats"] | undefined): number {
  if (!stats) return 0;
  const total =
    (stats.publishedCount ?? 0) +
    (stats.awaitingMarkingCount ?? 0) +
    (stats.moderationPendingCount ?? 0) +
    (stats.overdueAssessmentsCount ?? 0);
  if (total === 0) return 100;
  const issues =
    (stats.overdueAssessmentsCount ?? 0) +
    (stats.moderationPendingCount ?? 0) +
    (stats.marksNotCapturedCount ?? 0);
  return Math.max(0, Math.min(100, Math.round(((total - issues) / total) * 100)));
}

function buildRecommendations(
  stats: TeacherDashboardData["stats"] | undefined,
  capsIssues: number,
  missingRubrics: number
): string[] {
  const recs: string[] = [];
  if ((stats?.awaitingMarkingCount ?? 0) > 0) {
    recs.push("Prioritise scripts awaiting marking to stay on schedule.");
  }
  if ((stats?.moderationPendingCount ?? 0) > 0) {
    recs.push("Submit pending assessments for moderation review.");
  }
  if (capsIssues > 0) {
    recs.push("Review CAPS alignment on overdue assessments.");
  }
  if (missingRubrics > 0) {
    recs.push("Attach rubrics to assessments before final submission.");
  }
  if ((stats?.marksNotCapturedCount ?? 0) > 0) {
    recs.push("Capture outstanding marks to improve compliance score.");
  }
  if (recs.length === 0) {
    recs.push("All assessments are on track. Great work!");
  }
  return recs.slice(0, 4);
}

function collectAssessmentIds(data: TeacherDashboardData): string[] {
  const ids = new Set<string>();
  for (const item of [
    ...data.awaitingMarking,
    ...data.submittedToHod,
    ...data.overdueAssessments,
    ...data.upcomingDeadlines,
    ...data.recentlyPublished,
  ]) {
    ids.add(item.id);
  }
  return [...ids];
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [missingMemorandumCount, setMissingMemorandumCount] = useState(0);

  const loadDashboard = () => {
    setLoading(true);
    setLoadError("");
    apiFetch<TeacherDashboardData>("/dashboard/teacher")
      .then(setData)
      .catch((err) => {
        setData(null);
        setLoadError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!data) {
      setMissingMemorandumCount(0);
      return;
    }
    const ids = collectAssessmentIds(data);
    if (ids.length === 0) {
      setMissingMemorandumCount(0);
      return;
    }
    let cancelled = false;
    Promise.all(ids.map((id) => fetchIntelligenceReport(id).catch(() => null))).then((reports) => {
      if (cancelled) return;
      setMissingMemorandumCount(reports.filter((r) => r?.missingMemorandums).length);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const stats = data?.stats;
  const assessments = useMemo(() => buildAssessmentRows(data), [data]);
  const activity = useMemo(() => buildActivity(data), [data]);

  if (loading) {
    return <PageLoader message="Loading your dashboard…" />;
  }

  if (loadError && !data) {
    return (
      <div className="sc-dash sc-dash-compact">
        <BetaBanner />
        <div className="sc-card sc-card-padded" style={{ marginTop: "1.5rem" }}>
          <h2 className="sc-dash-section-title">Dashboard unavailable</h2>
          <p className="sc-error">{loadError}</p>
          <button type="button" className="sc-btn sc-btn-primary" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const capsIssues = stats?.overdueAssessmentsCount ?? 0;
  const missingRubrics = Math.max(
    0,
    (stats?.awaitingMarkingCount ?? 0) - (data?.awaitingMarking.length ?? 0)
  );
  const complianceScore = computeComplianceScore(stats);
  const actionCount =
    (stats?.awaitingMarkingCount ?? 0) +
    (stats?.moderationPendingCount ?? 0) +
    (stats?.overdueAssessmentsCount ?? 0);

  const intelItems: IntelItem[] = [
    {
      label: "Awaiting Moderation",
      value: stats?.moderationPendingCount ?? 0,
      status: (stats?.moderationPendingCount ?? 0) > 0 ? "warning" : "success",
    },
    {
      label: "CAPS Issues",
      value: capsIssues,
      status: capsIssues > 0 ? "critical" : "success",
    },
    {
      label: "Missing Rubrics",
      value: missingRubrics,
      status: missingRubrics > 0 ? "warning" : "success",
    },
    {
      label: "Missing Memorandums",
      value: missingMemorandumCount,
      status: missingMemorandumCount > 0 ? "warning" : "success",
    },
  ];

  return (
    <div className="sc-dash sc-dash-compact">
      <BetaBanner />
      <DashboardHero
        greeting={`${greeting()}, ${user ? firstName(user.fullName) : "there"}`}
        subtitle="ScriptCheck Teacher Intelligence Dashboard"
        termLabel={`${currentTerm()} • ${currentYear()}`}
        metrics={[
          {
            label: "Assessment Compliance Score",
            value: `${complianceScore}%`,
            tone: complianceScore >= 80 ? "success" : complianceScore >= 60 ? "warning" : "critical",
          },
          {
            label: "Published Assessments",
            value: stats?.publishedCount ?? "—",
            tone: "gold",
          },
          {
            label: "Moderation Queue",
            value: stats?.moderationPendingCount ?? "—",
            tone: (stats?.moderationPendingCount ?? 0) > 0 ? "warning" : "default",
          },
          {
            label: "Assessments Requiring Action",
            value: actionCount,
            tone: actionCount > 0 ? "critical" : "success",
          },
        ]}
      />

      <div className="sc-dash-kpi-grid">
        <KpiCard
          to="/marking"
          value={stats?.awaitingMarkingCount ?? "—"}
          label="Awaiting Marking"
          hint="Scripts need your attention"
          icon="✎"
          highlight
        />
        <KpiCard
          to="/moderation"
          value={stats?.moderationPendingCount ?? "—"}
          label="Moderation Requests"
          hint="Pending review"
          icon="⚖"
        />
        <KpiCard
          to="/schedule"
          value={stats?.upcomingDeadlinesCount ?? "—"}
          label="Upcoming Deadlines"
          hint="Due soon"
          icon="◷"
        />
        <KpiCard
          to="/marking"
          value={stats?.marksNotCapturedCount ?? "—"}
          label="Outstanding Marks"
          hint="Marks not yet captured"
          icon="◎"
        />
      </div>

      <div className="sc-dash-two-col">
        <section>
          <h2 className="sc-dash-section-title">My Assessments</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            {assessments.length ? (
              <div className="sc-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>Assessment</th>
                      <th>Grade</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Intelligence</th>
                      <th>Due Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((row) => {
                      const action = assessmentAction(row);
                      return (
                        <tr key={row.id}>
                          <td>{row.title}</td>
                          <td>{row.grade.name}</td>
                          <td>{row.subject.name}</td>
                          <td>
                            <span className={`sc-dash-status ${statusClass(row.displayStatus)}`}>
                              {row.displayStatus}
                            </span>
                          </td>
                          <td>
                            <AssessmentIntelligenceBadge assessmentId={row.id} compact />
                          </td>
                          <td>
                            {row.dueDate
                              ? new Date(row.dueDate).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>
                            <Link
                              to={action.to}
                              className="sc-btn sc-btn-ghost"
                              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                            >
                              {action.label}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sc-dash-empty">
                No assessments yet. Create your first assessment to get started.
              </p>
            )}
          </div>
        </section>

        <IntelligencePanel
          complianceScore={complianceScore}
          items={intelItems}
          recommendations={buildRecommendations(stats, capsIssues, missingRubrics)}
        />
      </div>

      <div className="sc-dash-bottom-row">
        <DashboardIntelligenceAlerts
          compact
          title="Warnings"
          items={assessments.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: row.displayStatus,
          }))}
        />

        <section className="sc-card sc-card-padded sc-dash-strip">
          <h2 className="sc-dash-section-title">Recent Activity</h2>
          {activity.length ? (
            <ul className="sc-dash-activity-compact">
              {activity.map((item) => (
                <li key={item.id}>
                  <span className="sc-dash-activity-dot" />
                  <span className="sc-dash-activity-text">{item.text}</span>
                  <span className="sc-dash-activity-time">
                    {new Date(item.time).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sc-muted" style={{ margin: 0, fontSize: "0.72rem" }}>
              No recent activity.
            </p>
          )}
        </section>
      </div>

      <section>
        <h2 className="sc-dash-section-title">Quick Actions</h2>
        <div className="sc-dash-quick-actions">
          <Link to="/assessments/new" className="sc-dash-quick-btn is-primary">
            Create Assessment
          </Link>
          <Link to="/ai-assessment-builder" className="sc-dash-quick-btn is-secondary">
            AI Assessment Builder
          </Link>
          <Link to="/assessments/generate" className="sc-dash-quick-btn is-secondary">
            AI Paper Generator
          </Link>
          <Link to="/assessments" className="sc-dash-quick-btn is-secondary">
            View Assessments
          </Link>
          <Link to="/results" className="sc-dash-quick-btn is-secondary">
            Results &amp; Analytics
          </Link>
        </div>
      </section>
    </div>
  );
}
