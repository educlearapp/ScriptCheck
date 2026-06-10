import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { AtRiskLearner, LearnerHistory } from "../../types";
import "../analysis/Analysis.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

export default function LearnerHistoryPage() {
  const { learnerId } = useParams<{ learnerId: string }>();
  const [history, setHistory] = useState<LearnerHistory | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskLearner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!learnerId) return;
    setLoading(true);
    Promise.all([
      apiFetch<LearnerHistory>(`/analysis/learners/${learnerId}/history`),
      apiFetch<AtRiskLearner[]>(`/analysis/at-risk`).then((list) =>
        list.find((l) => l.learnerId === learnerId) ?? null
      ),
    ])
      .then(([h, risk]) => {
        setHistory(h);
        setAtRisk(risk);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load learner history")
      )
      .finally(() => setLoading(false));
  }, [learnerId]);

  if (loading) return <p>Loading learner history…</p>;
  if (error) return <div className="sc-alert sc-alert-error">{error}</div>;
  if (!history) return null;

  const { learner } = history;

  return (
    <div>
      <Link to="/results" className="sc-detail-back">
        ← Department results
      </Link>
      <h1 className="sc-page-title">
        {learner.firstName} {learner.lastName}
      </h1>
      <p className="sc-page-subtitle">
        {learner.learnerNumber} · {learner.grade.name}
        {learner.className ? ` · ${learner.className}` : ""}
      </p>

      {atRisk ? (
        <div className="sc-alert sc-alert-error" style={{ marginTop: "1rem" }}>
          At-risk learner: {atRisk.reasons.join(", ").replaceAll("_", " ")}
        </div>
      ) : null}

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Overall average</div>
          <div className="sc-stat-value">{formatPct(history.overallAverage)}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Assessments</div>
          <div className="sc-stat-value">{history.assessmentCount}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Trend</div>
          <div className="sc-stat-value">
            {history.trend
              ? `${history.trend.direction} (${history.trend.change > 0 ? "+" : ""}${history.trend.change}%)`
              : "—"}
          </div>
        </div>
      </div>

      {history.averageByTerm.length ? (
        <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
          <table className="sc-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Average</th>
                <th>Assessments</th>
              </tr>
            </thead>
            <tbody>
              {history.averageByTerm.map((t) => (
                <tr key={t.term}>
                  <td>{t.term}</td>
                  <td>{formatPct(t.average)}</td>
                  <td>{t.assessmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {history.averageBySubject.length ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
          <table className="sc-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Average</th>
                <th>Assessments</th>
              </tr>
            </thead>
            <tbody>
              {history.averageBySubject.map((s) => (
                <tr key={s.subject}>
                  <td>{s.subject}</td>
                  <td>{formatPct(s.average)}</td>
                  <td>{s.assessmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2 style={{ marginTop: "2rem", color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>
        Assessment timeline
      </h2>
      <div className="sc-learner-timeline">
        {history.timeline.map((entry) => (
          <div key={entry.id} className="sc-timeline-entry">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <strong>{entry.title}</strong>
                <div style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
                  {entry.subject.name}
                  {entry.term ? ` · ${entry.term}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>
                  {entry.finalMark ?? "—"}/{entry.totalMarks}
                </div>
                <div className={entry.passed === false ? "sc-results-pct-low" : ""}>
                  {formatPct(entry.finalPercentage)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
              {entry.assessmentDate
                ? new Date(entry.assessmentDate).toLocaleDateString()
                : new Date(entry.capturedAt).toLocaleDateString()}
              {" · "}
              <Link to={`/assessments/${entry.assessmentId}/results`}>View results</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
