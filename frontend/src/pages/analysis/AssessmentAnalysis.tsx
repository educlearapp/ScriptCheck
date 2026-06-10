import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import DistributionChart from "../../components/analysis/DistributionChart";
import type { ClassAnalysis, GradeAnalysis, SubjectAnalysis } from "../../types";
import "./Analysis.css";

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

type Tab = "class" | "subject" | "grade";

export default function AssessmentAnalysis() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("class");
  const [classData, setClassData] = useState<ClassAnalysis | null>(null);
  const [subjectData, setSubjectData] = useState<SubjectAnalysis | null>(null);
  const [gradeData, setGradeData] = useState<GradeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const classAnalysis = await apiFetch<ClassAnalysis>(
        `/analysis/assessments/${id}/class`
      );
      setClassData(classAnalysis);

      const subject = await apiFetch<SubjectAnalysis>(
        `/analysis/subject?assessmentId=${id}&subjectId=${classAnalysis.assessment.subject.id}${
          classAnalysis.assessment.term ? `&term=${encodeURIComponent(classAnalysis.assessment.term)}` : ""
        }`
      );
      setSubjectData(subject);

      const grade = await apiFetch<GradeAnalysis>(
        `/analysis/grade/${classAnalysis.assessment.grade.id}`
      );
      setGradeData(grade);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p>Loading analysis…</p>;
  if (error) return <div className="sc-alert sc-alert-error">{error}</div>;
  if (!classData) return null;

  return (
    <div>
      <Link to={`/assessments/${id}/results`} className="sc-detail-back">
        ← Back to results
      </Link>
      <h1 className="sc-page-title">Assessment Analysis</h1>
      <p className="sc-page-subtitle">
        {classData.assessment.title} · {classData.assessment.subject.name} ·{" "}
        {classData.assessment.grade.name}
        <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
          {classData.source}
        </span>
      </p>

      <div className="sc-tab-bar">
        {(["class", "subject", "grade"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`sc-tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "class" ? "Class" : t === "subject" ? "Subject" : "Grade"}
          </button>
        ))}
      </div>

      {tab === "class" ? (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="sc-grid-3">
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Class average</div>
              <div className="sc-stat-value">{formatPct(classData.summary.classAverage)}</div>
            </div>
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Pass rate</div>
              <div className="sc-stat-value">{formatPct(classData.summary.passRate)}</div>
            </div>
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Distinctions / Failures</div>
              <div className="sc-stat-value">
                {classData.summary.distinctionCount} / {classData.summary.failureCount}
              </div>
            </div>
          </div>

          <div className="sc-grid-3" style={{ marginTop: "1rem" }}>
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Highest mark</div>
              <div className="sc-stat-value">{classData.summary.highestMark ?? "—"}</div>
            </div>
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Lowest mark</div>
              <div className="sc-stat-value">{classData.summary.lowestMark ?? "—"}</div>
            </div>
            <div className="sc-card" style={{ padding: "1.25rem" }}>
              <div className="sc-detail-label">Marked learners</div>
              <div className="sc-stat-value">
                {classData.summary.markedLearners}/{classData.summary.totalLearners}
              </div>
            </div>
          </div>

          <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.25rem" }}>
            <DistributionChart bands={classData.distribution} title="Mark distribution" />
          </div>

          {classData.classes.length > 1 ? (
            <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Average</th>
                    <th>Pass rate</th>
                    <th>Distinctions</th>
                    <th>Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {classData.classes.map((c) => (
                    <tr key={c.className}>
                      <td>{c.className}</td>
                      <td>{formatPct(c.classAverage)}</td>
                      <td>{formatPct(c.passRate)}</td>
                      <td>{c.distinctionCount}</td>
                      <td>{c.failureCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "subject" && subjectData ? (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-detail-label">Subject average</div>
            <div className="sc-stat-value">{formatPct(subjectData.subjectAverage)}</div>
            {subjectData.trend ? (
              <p style={{ marginTop: "0.5rem", color: "var(--sc-text-muted)" }}>
                Trend: {subjectData.trend.direction}
              </p>
            ) : null}
          </div>
          <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Term</th>
                  <th>Average</th>
                  <th>Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {subjectData.assessments.map((a) => (
                  <tr key={a.assessmentId}>
                    <td>
                      <Link to={`/assessments/${a.assessmentId}/analysis`}>{a.title}</Link>
                    </td>
                    <td>{a.term ?? "—"}</td>
                    <td>{formatPct(a.classAverage)}</td>
                    <td>{formatPct(a.passRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "grade" && gradeData ? (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="sc-card" style={{ padding: "1.25rem" }}>
            <div className="sc-detail-label">Grade average</div>
            <div className="sc-stat-value">{formatPct(gradeData.gradeAverage)}</div>
            {gradeData.topPerformingClass ? (
              <p style={{ marginTop: "0.5rem" }}>
                Top class: {gradeData.topPerformingClass.className} (
                {formatPct(gradeData.topPerformingClass.averagePercentage)})
              </p>
            ) : null}
          </div>
          <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Learners</th>
                  <th>Average</th>
                  <th>Pass rate</th>
                  <th>At risk</th>
                </tr>
              </thead>
              <tbody>
                {gradeData.classes.map((c) => (
                  <tr key={c.className}>
                    <td>{c.className}</td>
                    <td>{c.learnerCount}</td>
                    <td>{formatPct(c.averagePercentage)}</td>
                    <td>{formatPct(c.passRate)}</td>
                    <td>{c.atRisk ? "⚠ Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
