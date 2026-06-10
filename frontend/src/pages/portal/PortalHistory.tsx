import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PortalLearnerHistory } from "../../types";
import { portalFetch } from "../../portal/api";
import "../../portal/PortalLayout.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

export default function PortalHistoryPage() {
  const { learnerId } = useParams<{ learnerId: string }>();
  const [data, setData] = useState<PortalLearnerHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!learnerId) return;
    portalFetch<PortalLearnerHistory>(`/portal/learners/${learnerId}/history`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [learnerId]);

  if (loading) return <p>Loading history…</p>;
  if (!data) return <p>Unable to load history.</p>;

  return (
    <div>
      <Link to="/portal" className="portal-link">
        ← Dashboard
      </Link>
      <h1 className="portal-page-title">Performance History</h1>
      <p className="portal-page-subtitle">
        {data.learner.firstName} {data.learner.lastName} · Overall:{" "}
        {formatPct(data.overallAverage)}
      </p>

      {data.terms.map((term) => (
        <div key={term.term} className="portal-section">
          <h2>
            {term.term}
            {term.trend ? (
              <span style={{ fontSize: "0.85rem", marginLeft: "0.5rem", color: "#999" }}>
                {term.trend === "up" ? "↑" : term.trend === "down" ? "↓" : "→"}
              </span>
            ) : null}
          </h2>
          <div className="portal-card">
            <div className="portal-stat-value" style={{ fontSize: "1.5rem" }}>
              {formatPct(term.assessmentAverage)}
            </div>
            <div className="portal-stat-label">
              Term average · {term.assessmentCount} assessments
            </div>
            {term.subjectAverages.length > 0 ? (
              <table className="portal-table" style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Average</th>
                  </tr>
                </thead>
                <tbody>
                  {term.subjectAverages.map((s) => (
                    <tr key={s.subject}>
                      <td>{s.subject}</td>
                      <td>{formatPct(s.average)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ))}

      <div className="portal-section">
        <h2>Full timeline</h2>
        <div className="portal-card" style={{ padding: 0 }}>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Subject</th>
                <th>Term</th>
                <th>Mark</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {data.timeline.map((t) => (
                <tr key={`${t.assessmentId}-${t.date}`}>
                  <td>
                    <Link
                      to={`/portal/learners/${learnerId}/assessments/${t.assessmentId}`}
                      className="portal-link"
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td>{t.subject}</td>
                  <td>{t.term}</td>
                  <td>
                    {t.mark ?? "—"}/{t.totalMarks}
                  </td>
                  <td>{formatPct(t.percentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
