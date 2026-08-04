import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { isHodDashboard } from "../../auth/permissions";
import TrendBadge from "../../components/dashboard/TrendBadge";
import type {
  AcademicTrendsData,
  AssessmentResults,
  CurriculumTree,
  DepartmentResultItem,
} from "../../types";
import { formatStatusLabel } from "../../utils/statusLabels";
import {
  formatResultsCount as formatCount,
  formatResultsPct as formatPct,
  formatResultsPublishStatus,
  markedProgressLabel,
} from "../../utils/resultsSummaryDisplay";
import "./DepartmentResults.css";

function averageOf(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function pctClass(value: number | null | undefined, threshold = 50): string {
  if (value == null) return "";
  return value < threshold ? "sc-dept-pct-low" : "sc-dept-pct-high";
}

function formatPublishStatus(item: DepartmentResultItem): string {
  return formatResultsPublishStatus(item);
}

export default function DepartmentResults() {
  const { user } = useAuth();
  const isDepartmentView = isHodDashboard(user);

  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<DepartmentResultItem[]>([]);
  const [trends, setTrends] = useState<AcademicTrendsData | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showMoreAnalytics, setShowMoreAnalytics] = useState(false);

  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [questionAnalysis, setQuestionAnalysis] = useState<AssessmentResults["questionAnalysis"]>([]);
  const [analysisTitle, setAnalysisTitle] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const filters = useMemo(
    () => ({
      curriculumId: searchParams.get("curriculumId") || "",
      phaseId: searchParams.get("phaseId") || "",
      gradeId: searchParams.get("gradeId") || "",
      subjectId: searchParams.get("subjectId") || "",
      status: searchParams.get("status") || "",
      teacherId: searchParams.get("teacherId") || "",
    }),
    [searchParams]
  );

  const selectedCurriculum = curriculum.find((c) => c.id === filters.curriculumId);
  const phases = selectedCurriculum?.phases ?? [];
  const selectedPhase = phases.find((p) => p.id === filters.phaseId);
  const grades = selectedPhase?.grades ?? [];
  const subjects = selectedPhase?.subjects ?? [];

  const teachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.creatorTeacher.id, item.creatorTeacher.fullName);
    }
    return Array.from(map.entries()).map(([id, fullName]) => ({ id, fullName }));
  }, [items]);

  const summary = useMemo(() => {
    const classAvgs = items.map((i) => i.classAverage).filter((v): v is number => v != null);
    const passRates = items.map((i) => i.passRate).filter((v): v is number => v != null);
    const failRates = passRates.map((p) => Math.round((100 - p) * 10) / 10);
    const atRisk = items
      .map((i) => i.learnersAtRiskCount)
      .filter((v): v is number => v != null)
      .reduce((acc, v) => acc + v, 0);
    const learners = items
      .map((i) => i.learnerCount)
      .filter((v): v is number => v != null)
      .reduce((acc, v) => acc + v, 0);
    const withResults = items.filter(
      (i) => i.learnerCount != null && i.learnerCount > 0 && i.classAverage != null
    );

    return {
      assessmentCount: items.length,
      avgClassAverage: averageOf(classAvgs),
      avgPassRate: averageOf(passRates),
      avgFailRate: averageOf(failRates),
      totalAtRisk: atRisk,
      totalLearners: learners,
      withResultsCount: withResults.length,
      assessmentsWithResults: withResults,
    };
  }, [items]);

  const loadResults = useCallback(() => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (filters.curriculumId) query.set("curriculumId", filters.curriculumId);
    if (filters.phaseId) query.set("phaseId", filters.phaseId);
    if (filters.gradeId) query.set("gradeId", filters.gradeId);
    if (filters.subjectId) query.set("subjectId", filters.subjectId);
    if (filters.status) query.set("status", filters.status);
    if (filters.teacherId) query.set("teacherId", filters.teacherId);

    const suffix = query.toString() ? `?${query.toString()}` : "";
    apiFetch<DepartmentResultItem[]>(`/results${suffix}`)
      .then(setItems)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load results")
      )
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    apiFetch<CurriculumTree[]>("/curriculum/tree")
      .then(setCurriculum)
      .catch(() => setCurriculum([]));
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    setTrendsLoading(true);
    apiFetch<AcademicTrendsData>("/dashboard/trends")
      .then(setTrends)
      .catch(() => setTrends(null))
      .finally(() => setTrendsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAnalysisId) {
      setQuestionAnalysis([]);
      setAnalysisTitle("");
      setAnalysisError("");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");
    apiFetch<AssessmentResults>(`/assessments/${selectedAnalysisId}/results`)
      .then((data) => {
        setQuestionAnalysis(data.questionAnalysis);
        setAnalysisTitle(data.assessment.title);
      })
      .catch((err) => {
        setQuestionAnalysis([]);
        setAnalysisTitle("");
        setAnalysisError(err instanceof Error ? err.message : "Failed to load question analysis");
      })
      .finally(() => setAnalysisLoading(false));
  }, [selectedAnalysisId]);

  useEffect(() => {
    if (summary.assessmentsWithResults.length === 0) {
      setSelectedAnalysisId("");
      return;
    }
    if (!summary.assessmentsWithResults.some((a) => a.id === selectedAnalysisId)) {
      setSelectedAnalysisId(summary.assessmentsWithResults[0].id);
    }
  }, [summary.assessmentsWithResults, selectedAnalysisId]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);

    if (key === "curriculumId") {
      next.delete("phaseId");
      next.delete("gradeId");
      next.delete("subjectId");
    }
    if (key === "phaseId") {
      next.delete("gradeId");
      next.delete("subjectId");
    }

    setSearchParams(next);
  };

  const hasTrendData =
    (trends?.subjectTrends.some((t) => t.currentAverage != null) ?? false) ||
    (trends?.gradeTrends.some((t) => t.overallAverage != null) ?? false) ||
    (trends?.historicalTrends.some((t) => t.average != null) ?? false);

  const showEmptyWorkspace = !loading && !error && items.length === 0 && !filters.status && !filters.teacherId && !filters.gradeId && !filters.subjectId && !filters.curriculumId && !filters.phaseId;

  return (
    <div className="sc-dept-results">
      <header className="sc-dept-header">
        <h1 className="sc-page-title">
          {isDepartmentView ? "Department Results" : "My Results"}
        </h1>
        <p className="sc-page-subtitle">
          {isDepartmentView
            ? "See how assessments are doing across your department."
            : "See your assessments, class averages, and publish status."}
        </p>
        <span className="sc-badge sc-badge-gold sc-dept-scope-badge">
          {isDepartmentView ? "Department view" : "Teacher view"}
        </span>
      </header>

      <div className="sc-card sc-dept-filters" style={{ padding: "1rem" }}>
        <button
          type="button"
          className="sc-btn sc-btn-ghost"
          onClick={() => setShowMoreFilters((v) => !v)}
          aria-expanded={showMoreFilters}
        >
          {showMoreFilters ? "Hide More Options" : "More Options"}
        </button>
        {showMoreFilters ? (
        <div className="sc-dept-filters-grid" style={{ marginTop: "0.85rem" }}>
          <label>
            Curriculum
            <select
              className="sc-input"
              value={filters.curriculumId}
              onChange={(e) => updateFilter("curriculumId", e.target.value)}
            >
              <option value="">All</option>
              {curriculum.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Phase
            <select
              className="sc-input"
              value={filters.phaseId}
              onChange={(e) => updateFilter("phaseId", e.target.value)}
              disabled={!filters.curriculumId}
            >
              <option value="">All</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Grade
            <select
              className="sc-input"
              value={filters.gradeId}
              onChange={(e) => updateFilter("gradeId", e.target.value)}
              disabled={!filters.phaseId}
            >
              <option value="">All</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select
              className="sc-input"
              value={filters.subjectId}
              onChange={(e) => updateFilter("subjectId", e.target.value)}
              disabled={!filters.phaseId}
            >
              <option value="">All</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              className="sc-input"
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              <option value="">All results</option>
              <option value="MARKING">Marking</option>
              <option value="MARKED">Marked</option>
              <option value="HOD_REVIEW">Department Review</option>
              <option value="APPROVED">Approved</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
          {isDepartmentView ? (
            <label>
              Teacher
              <select
                className="sc-input"
                value={filters.teacherId}
                onChange={(e) => updateFilter("teacherId", e.target.value)}
              >
                <option value="">All</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        ) : null}
      </div>

      {loading ? <p>Loading results…</p> : null}
      {error ? <p className="sc-error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="sc-dept-section">
            <h2 className="sc-dept-section-title">Assessment Results</h2>
            <div className="sc-card sc-dept-table-wrap">
              {items.length === 0 ? (
                <div className="sc-dept-empty">
                  {showEmptyWorkspace ? (
                    <>
                      <div className="sc-dept-empty-icon" aria-hidden>📊</div>
                      <h3>No results yet</h3>
                      <p>
                        {isDepartmentView
                          ? "When teachers mark and publish assessments, department results will appear here."
                          : "Mark learner scripts and ask to publish results to see class averages here."}
                      </p>
                      <div className="sc-dept-empty-actions">
                        <Link to="/marking" className="sc-btn sc-btn-primary">Start Marking</Link>
                        <Link to="/assessments/new" className="sc-btn sc-btn-ghost">Create Assessment</Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="sc-dept-empty-icon" aria-hidden>🔍</div>
                      <h3>No results match your filters</h3>
                      <p>Try clearing filters or selecting a different grade, subject or status.</p>
                      <div className="sc-dept-empty-actions">
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost"
                          onClick={() => setSearchParams(new URLSearchParams())}
                        >
                          Clear filters
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                <div className="sc-results-card-list" aria-label="Assessment results cards">
                  {items.map((item) => {
                    const papers = item.learnerPaperCount ?? item.learnerCount;
                    const marked = item.markedCount;
                    return (
                      <article key={item.id} className="sc-card sc-results-mobile-card">
                        <h3>{item.title}</h3>
                        <p className="sc-results-mobile-meta">
                          {item.grade.name} · {item.subject.name}
                        </p>
                        <p>
                          {marked != null && papers != null
                            ? markedProgressLabel(marked, papers)
                            : papers != null
                              ? `${papers} learner papers`
                              : "No learner papers yet"}
                        </p>
                        <p>Class average: {formatPct(item.classAverage)}</p>
                        <p>
                          Highest: {formatPct(item.highestMark ?? null)} · Lowest:{" "}
                          {formatPct(item.lowestMark ?? null)}
                        </p>
                        <p>
                          {formatStatusLabel(item.resultStatus ?? item.status)} ·{" "}
                          {formatPublishStatus(item)}
                        </p>
                        <Link
                          to={`/assessments/${item.id}/results`}
                          className="sc-btn sc-btn-primary sc-results-open-btn"
                        >
                          Open Results
                        </Link>
                      </article>
                    );
                  })}
                </div>
                <div className="sc-table-wrap sc-results-desktop-table">
                  <table className="sc-table">
                    <thead>
                      <tr>
                        <th>Assessment</th>
                        <th>Grade</th>
                        <th>Subject</th>
                        <th>Learner papers</th>
                        <th>Marked</th>
                        <th>Waiting for review</th>
                        <th>Class average</th>
                        <th>Highest</th>
                        <th>Lowest</th>
                        <th>Status</th>
                        <th>Publish status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{item.grade.name}</td>
                          <td>{item.subject.name}</td>
                          <td>{formatCount(item.learnerPaperCount ?? item.learnerCount)}</td>
                          <td>{formatCount(item.markedCount)}</td>
                          <td>{formatCount(item.awaitingReviewCount)}</td>
                          <td className={pctClass(item.classAverage)}>{formatPct(item.classAverage)}</td>
                          <td>{formatPct(item.highestMark ?? null)}</td>
                          <td>{formatPct(item.lowestMark ?? null)}</td>
                          <td>{formatStatusLabel(item.resultStatus ?? item.status)}</td>
                          <td>{formatPublishStatus(item)}</td>
                          <td>
                            <Link
                              to={`/assessments/${item.id}/results`}
                              className="sc-btn sc-btn-ghost sc-dept-table-btn"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </section>

          <div style={{ margin: "1rem 0" }}>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setShowMoreAnalytics((v) => !v)}
              aria-expanded={showMoreAnalytics}
            >
              {showMoreAnalytics ? "Hide detailed analytics" : "More Options — detailed analytics"}
            </button>
          </div>

          {showMoreAnalytics ? (
            <>
          <section className="sc-dept-summary" aria-label="Summary statistics">
            <div className="sc-card sc-card-gold sc-dept-stat-card">
              <div className="sc-dept-stat-label">Class average</div>
              <div
                className={`sc-dept-stat-value${
                  summary.avgClassAverage != null && summary.avgClassAverage < 50
                    ? " is-warning"
                    : summary.avgClassAverage != null && summary.avgClassAverage >= 60
                      ? " is-success"
                      : ""
                }`}
              >
                {formatPct(summary.avgClassAverage)}
              </div>
              <div className="sc-dept-stat-hint">
                {summary.withResultsCount} assessment{summary.withResultsCount === 1 ? "" : "s"} with marks
              </div>
            </div>
            <div className="sc-card sc-dept-stat-card">
              <div className="sc-dept-stat-label">Pass rate</div>
              <div className={`sc-dept-stat-value ${summary.avgPassRate != null && summary.avgPassRate >= 50 ? "is-success" : ""}`}>
                {formatPct(summary.avgPassRate)}
              </div>
              <div className="sc-dept-stat-hint">Across filtered assessments</div>
            </div>
            <div className="sc-card sc-dept-stat-card">
              <div className="sc-dept-stat-label">Fail rate</div>
              <div className={`sc-dept-stat-value ${summary.avgFailRate != null && summary.avgFailRate > 30 ? "is-warning" : ""}`}>
                {formatPct(summary.avgFailRate)}
              </div>
              <div className="sc-dept-stat-hint">Derived from pass rate</div>
            </div>
            <div className="sc-card sc-dept-stat-card">
              <div className="sc-dept-stat-label">Learners at risk</div>
              <div className={`sc-dept-stat-value ${summary.totalAtRisk > 0 ? "is-warning" : ""}`}>
                {summary.totalAtRisk || "—"}
              </div>
              <div className="sc-dept-stat-hint">
                {summary.totalLearners > 0
                  ? `${summary.totalLearners} learners in scope`
                  : "No learner data yet"}
              </div>
            </div>
          </section>

          <section className="sc-dept-section">
            <h2 className="sc-dept-section-title">Department Trends</h2>
            {trendsLoading ? (
              <p className="sc-dept-empty" style={{ padding: "1rem" }}>Loading trends…</p>
            ) : !hasTrendData ? (
              <div className="sc-card sc-dept-empty">
                <div className="sc-dept-empty-icon" aria-hidden>📈</div>
                <h3>No trend data yet</h3>
                <p>
                  Trends appear once published assessments have analytics snapshots across terms.
                </p>
              </div>
            ) : (
              <div className="sc-dept-trends-grid">
                <div className="sc-card sc-dept-trend-panel">
                  <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem" }}>Subject performance</h3>
                  {trends?.subjectTrends.length ? (
                    <ul className="sc-dept-trend-list">
                      {trends.subjectTrends.slice(0, 6).map((row) => (
                        <li key={row.subjectId} className="sc-dept-trend-row">
                          <strong>{row.subject}</strong>
                          <span className="sc-dept-trend-metrics">
                            <span className={pctClass(row.currentAverage)}>{formatPct(row.currentAverage)}</span>
                            <TrendBadge trend={row.trend} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sc-dept-empty" style={{ padding: "0.5rem 0" }}>No subject trends available.</p>
                  )}
                </div>
                <div className="sc-card sc-dept-trend-panel">
                  <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem" }}>Grade performance</h3>
                  {trends?.gradeTrends.length ? (
                    <ul className="sc-dept-trend-list">
                      {trends.gradeTrends.slice(0, 6).map((row) => (
                        <li key={row.gradeId} className="sc-dept-trend-row">
                          <strong>{row.grade}</strong>
                          <span className="sc-dept-trend-metrics">
                            <span className={pctClass(row.overallAverage)}>{formatPct(row.overallAverage)}</span>
                            <TrendBadge trend={row.trend} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sc-dept-empty" style={{ padding: "0.5rem 0" }}>No grade trends available.</p>
                  )}
                </div>
              </div>
            )}
            {trends?.historicalTrends.length ? (
              <div className="sc-dept-historical">
                {trends.historicalTrends.map((year) => (
                  <div key={year.year} className="sc-dept-historical-item">
                    <div className="sc-dept-historical-year">{year.year}</div>
                    <div className="sc-dept-historical-avg">{formatPct(year.average)}</div>
                    <TrendBadge trend={year.trend} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="sc-dept-section">
            <h2 className="sc-dept-section-title">Question Analysis</h2>
            {summary.assessmentsWithResults.length === 0 ? (
              <div className="sc-card sc-dept-empty">
                <div className="sc-dept-empty-icon" aria-hidden>❓</div>
                <h3>No question analysis available</h3>
                <p>
                  Question-level insights require marked learner scripts. Complete marking on an
                  assessment to see per-question averages and weak areas.
                </p>
                <div className="sc-dept-empty-actions">
                  <Link to="/marking" className="sc-btn sc-btn-primary">Go to Marking</Link>
                  <Link to="/assessments" className="sc-btn sc-btn-ghost">View Assessments</Link>
                </div>
              </div>
            ) : (
              <div className="sc-card" style={{ padding: "1rem" }}>
                <div className="sc-dept-question-toolbar">
                  <label>
                    Assessment
                    <select
                      className="sc-input"
                      value={selectedAnalysisId}
                      onChange={(e) => setSelectedAnalysisId(e.target.value)}
                    >
                      {summary.assessmentsWithResults.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.grade.name} · {formatPct(a.classAverage)})
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedAnalysisId ? (
                    <Link
                      to={`/assessments/${selectedAnalysisId}/results`}
                      className="sc-btn sc-btn-ghost sc-dept-table-btn"
                    >
                      Full results
                    </Link>
                  ) : null}
                </div>
                {analysisLoading ? (
                  <p className="sc-dept-empty" style={{ padding: "1rem 0" }}>Loading question analysis…</p>
                ) : analysisError ? (
                  <p className="sc-error">{analysisError}</p>
                ) : questionAnalysis.length === 0 ? (
                  <p className="sc-dept-empty" style={{ padding: "1rem 0" }}>
                    No questions defined for {analysisTitle || "this assessment"}.
                  </p>
                ) : (
                  <div className="sc-dept-table-wrap">
                    <div className="sc-table-wrap">
                      <table className="sc-table">
                        <thead>
                          <tr>
                            <th>Q</th>
                            <th>Max</th>
                            <th>Avg %</th>
                            <th>Full marks</th>
                            <th>Below 50%</th>
                            <th>Topic</th>
                            <th>Difficulty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questionAnalysis.map((q) => (
                            <tr key={q.questionId}>
                              <td>{q.questionNumber}</td>
                              <td>{q.maxMarks}</td>
                              <td className={pctClass(q.averagePercentage)}>{formatPct(q.averagePercentage)}</td>
                              <td>{q.fullMarksCount}</td>
                              <td>{q.belowFiftyCount}</td>
                              <td>{q.topic || "—"}</td>
                              <td>{q.difficulty || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="sc-dept-section">
            <h2 className="sc-dept-section-title">Detailed Assessment Table</h2>
            <div className="sc-card sc-dept-table-wrap">
              {items.length === 0 ? (
                <div className="sc-dept-empty">
                  <p>No assessments in this detailed view.</p>
                </div>
              ) : (
                <div className="sc-table-wrap">
                  <table className="sc-table">
                    <thead>
                      <tr>
                        <th>Assessment</th>
                        {isDepartmentView ? <th>Teacher</th> : null}
                        <th>Grade</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Avg %</th>
                        <th>Pass</th>
                        <th>Fail</th>
                        <th>Learners</th>
                        <th>At risk</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const failRate =
                          item.passRate != null
                            ? Math.round((100 - item.passRate) * 10) / 10
                            : null;
                        return (
                          <tr key={item.id}>
                            <td>{item.title}</td>
                            {isDepartmentView ? <td>{item.creatorTeacher.fullName}</td> : null}
                            <td>{item.grade.name}</td>
                            <td>{item.subject.name}</td>
                            <td>
                              <span className={`sc-badge ${item.status === "PUBLISHED" ? "sc-badge-gold" : "sc-badge-muted"}`}>
                                {formatStatusLabel(item.status)}
                              </span>
                            </td>
                            <td className={pctClass(item.classAverage)}>{formatPct(item.classAverage)}</td>
                            <td className={pctClass(item.passRate)}>{formatPct(item.passRate)}</td>
                            <td
                              className={
                                failRate != null && failRate > 30
                                  ? "sc-dept-pct-low"
                                  : failRate != null && failRate < 15
                                    ? "sc-dept-pct-high"
                                    : ""
                              }
                            >
                              {formatPct(failRate)}
                            </td>
                            <td>{item.learnerCount ?? "—"}</td>
                            <td>{item.learnersAtRiskCount ?? "—"}</td>
                            <td>
                              <div className="sc-dept-table-actions">
                                {item.status === "PUBLISHED" ? (
                                  <Link
                                    to={`/published-results/${item.id}`}
                                    className="sc-btn sc-btn-ghost sc-dept-table-btn"
                                  >
                                    Published
                                  </Link>
                                ) : null}
                                <Link
                                  to={`/assessments/${item.id}/results`}
                                  className="sc-btn sc-btn-ghost sc-dept-table-btn"
                                >
                                  Results
                                </Link>
                                <Link
                                  to={`/assessments/${item.id}/analysis`}
                                  className="sc-btn sc-btn-ghost sc-dept-table-btn"
                                >
                                  Analysis
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
