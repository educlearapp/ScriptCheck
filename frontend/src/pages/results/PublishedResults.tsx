import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { PublishedResultsView } from "../../types";
import "./PublishedResults.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PublishedResultsPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [data, setData] = useState<PublishedResultsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError("");
    try {
      const view = await apiFetch<PublishedResultsView>(
        `/published-results/${assessmentId}`
      );
      setData(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load published results");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p>Loading published results…</p>;

  if (error || !data) {
    return (
      <div>
        <p className="sc-error">{error || "Published results not found"}</p>
        <Link to="/results" className="sc-btn sc-btn-ghost">Back to results</Link>
      </div>
    );
  }

  const { assessment, summary } = data;

  return (
    <div className="sc-published-view">
      <div className="sc-published-banner">
        <span className="sc-badge sc-badge-gold">Published Results</span>
        <span className="sc-published-portal-note">Portal-ready · read-only</span>
      </div>

      <h1 className="sc-page-title">{assessment.title}</h1>
      <p className="sc-page-subtitle">
        {data.workspace.name} · {assessment.subject.name} · {assessment.grade.name} ·{" "}
        Published {formatDate(data.publishedAt)}
      </p>

      <div className="sc-grid-3" style={{ marginTop: "1.25rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Class average</div>
          <div className="sc-stat-value">{formatPct(summary?.classAverage)}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Pass rate</div>
          <div className="sc-stat-value">{formatPct(summary?.passRate)}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Learners</div>
          <div className="sc-stat-value">{summary?.learnerCount ?? "—"}</div>
        </div>
      </div>

      <section className="sc-published-section">
        <h2>Assessment Summary</h2>
        <div className="sc-card" style={{ padding: "1rem" }}>
          <p style={{ margin: 0, color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
            {assessment.curriculum.name} · {assessment.phase.name} · Teacher:{" "}
            {assessment.teacher.fullName} · {assessment.totalMarks} marks
          </p>
          {summary ? (
            <p style={{ margin: "0.75rem 0 0" }}>
              Highest: {summary.highestMark ?? "—"} · Lowest: {summary.lowestMark ?? "—"} ·
              At risk: {summary.learnersAtRiskCount ?? "—"}
            </p>
          ) : null}
        </div>
      </section>

      <section className="sc-published-section">
        <h2>Learner Results</h2>
        <div className="sc-card" style={{ padding: 0 }}>
          <table className="sc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Learner</th>
                <th>Class</th>
                <th>Mark</th>
                <th>%</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((learner) => (
                <tr key={learner.scriptId}>
                  <td>{learner.learnerNumber}</td>
                  <td>{learner.learnerName}</td>
                  <td>{learner.className || "—"}</td>
                  <td>
                    {learner.finalTotal != null
                      ? `${learner.finalTotal} / ${assessment.totalMarks}`
                      : "—"}
                  </td>
                  <td>{formatPct(learner.percentage)}</td>
                  <td>
                    <span className="sc-badge sc-badge-muted">{learner.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.weakTopics.length > 0 ? (
        <section className="sc-published-section">
          <h2>Weak Topics</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Avg %</th>
                  <th>Questions</th>
                </tr>
              </thead>
              <tbody>
                {data.weakTopics.map((topic) => (
                  <tr key={topic.topic}>
                    <td>{topic.topic}</td>
                    <td>{formatPct(topic.averagePercentage)}</td>
                    <td>{topic.questionNumbers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="sc-form-actions" style={{ marginTop: "2rem" }}>
        <Link to={`/assessments/${assessment.id}/results`} className="sc-btn sc-btn-ghost">
          Full analytics
        </Link>
        <Link to="/results" className="sc-btn sc-btn-ghost">
          Department results
        </Link>
      </div>
    </div>
  );
}
