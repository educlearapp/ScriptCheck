import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PortalAssessmentDetail } from "../../types";
import { portalFetch } from "../../portal/api";
import "../../portal/PortalLayout.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

export default function PortalAssessmentDetailPage() {
  const { learnerId, assessmentId } = useParams<{
    learnerId: string;
    assessmentId: string;
  }>();
  const [data, setData] = useState<PortalAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!learnerId || !assessmentId) return;
    portalFetch<PortalAssessmentDetail>(
      `/portal/learners/${learnerId}/assessments/${assessmentId}`
    )
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [learnerId, assessmentId]);

  if (loading) return <p>Loading assessment…</p>;
  if (error) return <div className="portal-error">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <Link to="/portal" className="portal-link">
        ← Dashboard
      </Link>
      <h1 className="portal-page-title">{data.assessment.title}</h1>
      <p className="portal-page-subtitle">
        {data.assessment.subject} · {data.assessment.teacher}
        {data.assessment.date
          ? ` · ${new Date(data.assessment.date).toLocaleDateString()}`
          : ""}
      </p>

      <div className="portal-grid-4">
        <div className="portal-card portal-card-gold">
          <div className="portal-stat-value">
            {data.result.mark ?? "—"}/{data.assessment.totalMarks}
          </div>
          <div className="portal-stat-label">Your mark</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{formatPct(data.result.percentage)}</div>
          <div className="portal-stat-label">Percentage</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{formatPct(data.classStats.classAverage)}</div>
          <div className="portal-stat-label">Class average</div>
        </div>
        <div className="portal-card">
          <div className="portal-stat-value">{data.classStats.highestMark ?? "—"}</div>
          <div className="portal-stat-label">Highest mark</div>
        </div>
      </div>

      {data.rubricBreakdown ? (
        <div className="portal-section">
          <h2>Rubric breakdown — {data.rubricBreakdown.templateName}</h2>
          <div className="portal-card">
            {data.rubricBreakdown.criteria.map((c) => (
              <div key={c.name} className="portal-rubric-row">
                <span>{c.name}</span>
                <span>
                  {c.mark ?? "—"}/{c.maxMarks}
                </span>
              </div>
            ))}
            <div className="portal-rubric-row" style={{ fontWeight: 700, marginTop: "0.5rem" }}>
              <span>Total</span>
              <span>
                {data.rubricBreakdown.total ?? "—"}/{data.rubricBreakdown.maxTotal ?? "—"}
              </span>
            </div>
            <div className="portal-rubric-row">
              <span>Percentage</span>
              <span>{formatPct(data.rubricBreakdown.percentage)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {data.teacherComments ? (
        <div className="portal-section">
          <h2>Teacher comments</h2>
          <div className="portal-card">{data.teacherComments}</div>
        </div>
      ) : null}

      {data.moderatorComments ? (
        <div className="portal-section">
          <h2>Moderator comments</h2>
          <div className="portal-card">{data.moderatorComments}</div>
        </div>
      ) : null}
    </div>
  );
}
