import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDownload, apiFetch, apiOpenPdf } from "../../api";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { AssessmentResults } from "../../types";
import "./AssessmentResults.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatMark(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function pctClass(value: number | null | undefined, threshold = 50): string {
  if (value == null) return "";
  return value < threshold ? "sc-results-pct-low" : "sc-results-pct-high";
}

function scopeLabel(scope: AssessmentResults["viewerScope"]): string {
  switch (scope) {
    case "admin":
      return "Admin view — all workspace results";
    case "hod":
      return "Department view — full assessment analytics";
    default:
      return "Teacher view — your assessment results";
  }
}

export default function AssessmentResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [results, setResults] = useState<AssessmentResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");

  const canGenerateReports = hasPermission(user, "reports.generate");

  const loadResults = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<AssessmentResults>(`/assessments/${id}/results`);
      setResults(data);
      if (data.learners[0]) {
        setSelectedScriptId((prev) => prev || data.learners[0].scriptId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handleExportCsv = async () => {
    if (!id || !results) return;
    setExporting(true);
    setExportMessage("");
    try {
      const safeTitle = results.assessment.title
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .slice(0, 80);
      await apiDownload(`/assessments/${id}/results.csv`, `${safeTitle}-results.csv`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "CSV export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadAssessmentPdf = async () => {
    if (!id) return;
    setExporting(true);
    setExportMessage("");
    try {
      const safeTitle = results?.assessment.title
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .slice(0, 80) ?? "assessment";
      await apiDownload(`/assessments/${id}/reports/assessment.pdf`, `${safeTitle}-summary.pdf`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "PDF download failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePrintAssessmentPdf = async () => {
    if (!id) return;
    setExportMessage("");
    try {
      await apiOpenPdf(`/assessments/${id}/reports/assessment.pdf`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to open assessment PDF");
    }
  };

  const handleDownloadLearnerPdf = async () => {
    if (!selectedScriptId) {
      setExportMessage("Select a learner first");
      return;
    }
    setExporting(true);
    setExportMessage("");
    try {
      await apiDownload(
        `/scripts/${selectedScriptId}/reports/learner.pdf`,
        `learner-report.pdf`
      );
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Learner PDF failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePrintLearnerPdf = async () => {
    if (!selectedScriptId) {
      setExportMessage("Select a learner first");
      return;
    }
    setExportMessage("");
    try {
      await apiOpenPdf(`/scripts/${selectedScriptId}/reports/learner.pdf`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Failed to open learner PDF");
    }
  };

  const handleRequestPublish = async () => {
    if (!id) return;
    setPublishing(true);
    setActionMessage("");
    try {
      await apiFetch(`/assessments/${id}/request-publish`, { method: "POST" });
      setActionMessage("Publish request sent to HOD.");
      await loadResults();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPublishing(false);
    }
  };

  const handlePublish = async () => {
    if (!id) return;
    setPublishing(true);
    setActionMessage("");
    try {
      await apiFetch(`/assessments/${id}/publish-results`, { method: "POST" });
      setActionMessage("Results published successfully.");
      await loadResults();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleReopen = async () => {
    if (!id) return;
    setPublishing(true);
    setActionMessage("");
    try {
      await apiFetch(`/assessments/${id}/reopen-results`, { method: "POST" });
      setActionMessage("Results reopened for editing.");
      await loadResults();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Reopen failed");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <p>Loading results…</p>;

  if (error || !results) {
    return (
      <div>
        <p className="sc-error">{error || "Results not found"}</p>
        <Link to={id ? `/assessments/${id}` : "/assessments"} className="sc-btn sc-btn-ghost">
          Back
        </Link>
      </div>
    );
  }

  const { assessment, summary, learners, questionAnalysis } = results;
  const showHodSections = results.viewerScope === "hod" || results.viewerScope === "admin";

  return (
    <div>
      <div className="sc-results-header">
        <div>
          <Link to={`/assessments/${id}`} className="sc-detail-back">
            ← Assessment
          </Link>
          <h1 className="sc-page-title">Assessment Results</h1>
          <p className="sc-page-subtitle">
            {assessment.title} · {assessment.subject.name} · {assessment.grade.name} ·{" "}
            {assessment.totalMarks} marks
          </p>
          <span className="sc-badge sc-badge-gold sc-results-scope-badge">
            {scopeLabel(results.viewerScope)}
          </span>
          {results.publishing.isPublished ? (
            <span className="sc-badge sc-badge-gold" style={{ marginLeft: "0.5rem" }}>
              PUBLISHED
            </span>
          ) : results.publishing.resultsPublishRequestedAt ? (
            <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
              Publish requested
            </span>
          ) : null}
        </div>
        <div className="sc-results-actions">
          {results.publishing.canRequestPublish ? (
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={publishing}
              onClick={handleRequestPublish}
            >
              Request publish
            </button>
          ) : null}
          {results.publishing.canPublish ? (
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={publishing}
              onClick={handlePublish}
            >
              {publishing ? "Publishing…" : "Publish results"}
            </button>
          ) : null}
          {results.publishing.canReopen ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={publishing}
              onClick={handleReopen}
            >
              Reopen results
            </button>
          ) : null}
          {results.canExport ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={exporting}
              onClick={handleExportCsv}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          ) : null}
          {results.publishing.isPublished ? (
            <Link to={`/published-results/${id}`} className="sc-btn sc-btn-ghost">
              Published view
            </Link>
          ) : null}
          <Link to={`/assessments/${id}/scripts`} className="sc-btn sc-btn-ghost">
            Learner Scripts
          </Link>
        </div>
      </div>

      {canGenerateReports ? (
        <div className="sc-card sc-reports-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>
            Reports
          </h2>
          <div className="sc-reports-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={exporting}
              onClick={handleDownloadAssessmentPdf}
            >
              Download Assessment PDF
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={handlePrintAssessmentPdf}>
              Print Assessment Report
            </button>
          </div>
          <div className="sc-reports-learner-row" style={{ marginTop: "1rem" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
              Learner for report
              <select
                className="sc-input"
                style={{ display: "block", marginTop: "0.35rem", minWidth: 220 }}
                value={selectedScriptId}
                onChange={(e) => setSelectedScriptId(e.target.value)}
              >
                {learners.map((l) => (
                  <option key={l.scriptId} value={l.scriptId}>
                    {l.learnerNumber} — {l.learnerName}
                  </option>
                ))}
              </select>
            </label>
            <div className="sc-reports-actions">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={exporting || !selectedScriptId}
                onClick={handleDownloadLearnerPdf}
              >
                Download Learner PDF
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                disabled={!selectedScriptId}
                onClick={handlePrintLearnerPdf}
              >
                Print Learner Report
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionMessage ? (
        <p className={actionMessage.includes("success") || actionMessage.includes("sent") ? "sc-page-subtitle" : "sc-error"}>
          {actionMessage}
        </p>
      ) : null}
      {exportMessage ? <p className="sc-page-subtitle">{exportMessage}</p> : null}
      {results.publishing.isReadOnly ? (
        <p className="sc-page-subtitle" style={{ color: "var(--sc-gold-light)" }}>
          Published results are read-only. HOD or admin can reopen if changes are needed.
        </p>
      ) : null}

      <div className="sc-grid-3">
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Class average</div>
          <div className="sc-stat-value">{formatPct(summary.classAverage)}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
            {summary.markedLearners} of {summary.totalLearners} marked
          </div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Pass rate</div>
          <div className="sc-stat-value">{formatPct(summary.passRate)}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
            ≥ {summary.passThresholdPercent}% threshold
          </div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Highest / Lowest</div>
          <div className="sc-stat-value" style={{ fontSize: "1.35rem" }}>
            {formatMark(summary.highestMark)} / {formatMark(summary.lowestMark)}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
            Out of {assessment.totalMarks}
          </div>
        </div>
      </div>

      <section className="sc-results-section">
        <h2>Learner Results</h2>
        {learners.length === 0 ? (
          <p className="sc-results-empty">No learner scripts have been captured for this assessment yet.</p>
        ) : (
          <div className="sc-card sc-results-table-wrap" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Learner</th>
                  <th>Class</th>
                  <th>Final mark</th>
                  <th>%</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {learners.map((learner) => (
                  <tr key={learner.scriptId}>
                    <td>{learner.learnerNumber}</td>
                    <td>
                      <Link to={`/scripts/${learner.scriptId}`}>{learner.learnerName}</Link>
                    </td>
                    <td>{learner.className || "—"}</td>
                    <td>
                      {learner.finalTotal != null
                        ? `${learner.finalTotal} / ${assessment.totalMarks}`
                        : "—"}
                    </td>
                    <td className={pctClass(learner.percentage)}>{formatPct(learner.percentage)}</td>
                    <td>
                      <span className="sc-badge sc-badge-muted">{learner.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sc-results-section">
        <h2>Question Analysis</h2>
        {questionAnalysis.length === 0 ? (
          <p className="sc-results-empty">No questions defined for this assessment.</p>
        ) : (
          <div className="sc-card sc-results-table-wrap" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Q</th>
                  <th>Max</th>
                  <th>Avg mark</th>
                  <th>Avg %</th>
                  <th>Full marks</th>
                  <th>Below 50%</th>
                  <th>Topic</th>
                  <th>Cognitive</th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {questionAnalysis.map((q) => (
                  <tr key={q.questionId}>
                    <td>{q.questionNumber}</td>
                    <td>{q.maxMarks}</td>
                    <td>{formatMark(q.averageMark)}</td>
                    <td className={pctClass(q.averagePercentage)}>{formatPct(q.averagePercentage)}</td>
                    <td>{q.fullMarksCount}</td>
                    <td>{q.belowFiftyCount}</td>
                    <td>{q.topic || "—"}</td>
                    <td>{q.cognitiveLevel || "—"}</td>
                    <td>{q.difficulty || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sc-results-section">
        <h2>Weak Topic Analysis</h2>
        {results.weakTopics.length === 0 ? (
          <p className="sc-results-empty">No topic data available yet.</p>
        ) : (
          <div className="sc-card sc-results-table-wrap" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Avg %</th>
                  <th>Learners struggling</th>
                  <th>Questions</th>
                </tr>
              </thead>
              <tbody>
                {results.weakTopics.map((topic) => (
                  <tr key={topic.topic}>
                    <td>{topic.topic}</td>
                    <td className={pctClass(topic.averagePercentage)}>{formatPct(topic.averagePercentage)}</td>
                    <td>{topic.learnersStruggling}</td>
                    <td>{topic.questionNumbers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="sc-grid-2" style={{ gap: "1rem", marginTop: "1.5rem" }}>
        <section className="sc-card" style={{ padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Cognitive Level Analysis</h2>
          {results.cognitiveLevelAnalysis.groups.length === 0 ? (
            <p className="sc-results-empty">No cognitive level data.</p>
          ) : (
            <>
              <p style={{ fontSize: "0.9rem", color: "var(--sc-text-muted)" }}>
                Weakest: <strong>{results.cognitiveLevelAnalysis.weakestCognitiveLevel ?? "—"}</strong>
                {" · "}
                Strongest: <strong>{results.cognitiveLevelAnalysis.strongestCognitiveLevel ?? "—"}</strong>
              </p>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Avg %</th>
                    <th>Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.cognitiveLevelAnalysis.groups.map((group) => (
                    <tr key={group.cognitiveLevel}>
                      <td>{group.cognitiveLevel}</td>
                      <td className={pctClass(group.averagePercentage)}>{formatPct(group.averagePercentage)}</td>
                      <td>{group.questionNumbers.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="sc-card" style={{ padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Difficulty Analysis</h2>
          {results.difficultyAnalysis.groups.length === 0 ? (
            <p className="sc-results-empty">No difficulty data.</p>
          ) : (
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Difficulty</th>
                  <th>Avg %</th>
                  <th>Questions</th>
                </tr>
              </thead>
              <tbody>
                {results.difficultyAnalysis.groups.map((group) => (
                  <tr key={group.difficulty}>
                    <td>{group.difficulty}</td>
                    <td className={pctClass(group.averagePercentage)}>{formatPct(group.averagePercentage)}</td>
                    <td>{group.questionNumbers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {showHodSections ? (
        <section className="sc-results-section">
          <h2>Learners at Risk</h2>
          <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
            Learners scoring below {summary.passThresholdPercent}% on final marks.
          </p>
          {results.learnersAtRisk.length === 0 ? (
            <p className="sc-results-empty">No learners currently below the pass threshold.</p>
          ) : (
            <div className="sc-card sc-results-table-wrap sc-results-risk" style={{ padding: 0 }}>
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
                  {results.learnersAtRisk.map((learner) => (
                    <tr key={learner.scriptId}>
                      <td>{learner.learnerNumber}</td>
                      <td>
                        <Link to={`/scripts/${learner.scriptId}`}>{learner.learnerName}</Link>
                      </td>
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
          )}
        </section>
      ) : null}

      <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
        Teacher: {assessment.creatorTeacher.fullName} · Assessment status: {assessment.status}
      </p>
    </div>
  );
}
