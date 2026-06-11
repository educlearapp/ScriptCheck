import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PortalLearnerDashboard } from "../../types";
import { portalFetch, portalOpenPdf } from "../../portal/api";
import { usePortalAuth } from "../../portal/PortalAuthContext";
import PageLoader from "../../components/loading/PageLoader";
import "../../portal/PortalLayout.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

export default function PortalDashboardRouter() {
  const { session, activeLearnerId } = usePortalAuth();

  if (session?.portalType === "PARENT") {
    return <PortalParentDashboard />;
  }

  return <PortalLearnerDashboardView learnerId={activeLearnerId} />;
}

function PortalParentDashboard() {
  const { session, activeLearnerId, setActiveLearnerId } = usePortalAuth();
  const [data, setData] = useState<{ learners: Array<{
    learner: PortalLearnerDashboard["learner"];
    currentAverage: number | null;
    assessmentsCompleted: number;
    distinctions: number;
    subjectsAtRisk: number;
    recentResults: PortalLearnerDashboard["recentAssessments"];
    upcomingAssessments: PortalLearnerDashboard["upcomingAssessments"];
    atRisk: PortalLearnerDashboard["atRisk"];
  }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalFetch<typeof data>("/portal/dashboard")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader message="Loading portal…" />;
  if (!data) return <p>Unable to load dashboard.</p>;

  return (
    <div>
      <h1 className="portal-page-title">Parent Dashboard</h1>
      <p className="portal-page-subtitle">
        Overview for {session?.learners.length ?? 0} linked learner(s)
      </p>

      <div className="portal-parent-cards">
        {data.learners.map((item) => (
          <div
            key={item.learner.id}
            className={`portal-card portal-parent-card${activeLearnerId === item.learner.id ? " is-selected" : ""}`}
            onClick={() => setActiveLearnerId(item.learner.id)}
          >
            <h3 style={{ margin: "0 0 0.5rem" }}>{item.learner.fullName}</h3>
            <div className="portal-stat-value">{formatPct(item.currentAverage)}</div>
            <div className="portal-stat-label">Current average</div>
            <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#999" }}>
              {item.assessmentsCompleted} assessments · {item.distinctions} distinctions
              {item.subjectsAtRisk > 0 ? ` · ${item.subjectsAtRisk} subjects at risk` : ""}
            </div>
            {item.atRisk.active ? (
              <div className="portal-alert portal-alert-warn" style={{ marginTop: "0.75rem", padding: "0.5rem" }}>
                {item.atRisk.alerts.map((a) => a.label).join(", ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {activeLearnerId ? (
        <PortalLearnerDashboardView learnerId={activeLearnerId} embedded />
      ) : null}
    </div>
  );
}

function PortalLearnerDashboardView({
  learnerId,
  embedded,
}: {
  learnerId: string | null;
  embedded?: boolean;
}) {
  const [data, setData] = useState<PortalLearnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!learnerId) return;
    setLoading(true);
    portalFetch<PortalLearnerDashboard>(`/portal/learners/${learnerId}/dashboard`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [learnerId]);

  if (!learnerId) return <p>No learner selected.</p>;
  if (loading) return <PageLoader message="Loading dashboard…" />;
  if (!data) return <p>Unable to load dashboard.</p>;

  return (
    <div className={embedded ? "portal-section" : ""}>
      {!embedded ? (
        <>
          <h1 className="portal-page-title">{data.learner.fullName}</h1>
          <p className="portal-page-subtitle">
            {data.learner.learnerNumber} · {data.learner.grade.name}
            {data.learner.className ? ` · ${data.learner.className}` : ""}
          </p>
        </>
      ) : null}

      {data.atRisk.active ? (
        <div className="portal-alert portal-alert-warn">
          <strong>Academic alert:</strong>{" "}
          {data.atRisk.alerts.map((a) => a.label).join(" · ")}
          {data.atRisk.guidance ? <div style={{ marginTop: "0.5rem" }}>{data.atRisk.guidance}</div> : null}
        </div>
      ) : null}

      <div className="portal-grid-4">
        <div className="portal-card portal-card-gold">
          <div className="portal-stat-value">{formatPct(data.cards.academicAverage)}</div>
          <div className="portal-stat-label">Academic Average</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{data.cards.assessmentsCompleted}</div>
          <div className="portal-stat-label">Assessments Completed</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{data.cards.distinctions}</div>
          <div className="portal-stat-label">Distinctions</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{data.cards.subjectsAtRisk}</div>
          <div className="portal-stat-label">Subjects At Risk</div>
        </div>
      </div>

      {data.performanceTrend ? (
        <div className="portal-section">
          <h2>Performance trend</h2>
          <div className="portal-card">
            {data.performanceTrend.direction} ({data.performanceTrend.change > 0 ? "+" : ""}
            {data.performanceTrend.change}%)
          </div>
        </div>
      ) : null}

      {data.subjectAverages.length > 0 ? (
        <div className="portal-section">
          <h2>Subject averages</h2>
          <div className="portal-card" style={{ padding: 0 }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Average</th>
                  <th>Assessments</th>
                </tr>
              </thead>
              <tbody>
                {data.subjectAverages.map((s) => (
                  <tr key={s.subject}>
                    <td>{s.subject}</td>
                    <td>{formatPct(s.average)}</td>
                    <td>{s.assessmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.recentAssessments.length > 0 ? (
        <div className="portal-section">
          <h2>Recent assessments</h2>
          <div className="portal-card" style={{ padding: 0 }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Subject</th>
                  <th>Mark</th>
                  <th>%</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.recentAssessments.map((a) => (
                  <tr key={a.assessmentId}>
                    <td>{a.title}</td>
                    <td>{a.subject}</td>
                    <td>{a.mark ?? "—"}</td>
                    <td>{formatPct(a.percentage)}</td>
                    <td>
                      <Link
                        to={`/portal/learners/${learnerId}/assessments/${a.assessmentId}`}
                        className="portal-link"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.upcomingAssessments.length > 0 ? (
        <div className="portal-section">
          <h2>Upcoming assessments</h2>
          <div className="portal-card" style={{ padding: 0 }}>
            <table className="portal-table">
              <tbody>
                {data.upcomingAssessments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{a.subject}</td>
                    <td>{a.date ? new Date(a.date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="portal-section">
        <button
          type="button"
          className="portal-btn portal-btn-primary"
          onClick={() => portalOpenPdf(`/portal/learners/${learnerId}/reports/progress.pdf`)}
        >
          Download Progress Report (PDF)
        </button>
      </div>
    </div>
  );
}
