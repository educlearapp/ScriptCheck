import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { CurriculumTree, DepartmentResultItem } from "../../types";
import "./DepartmentResults.css";

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export default function DepartmentResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<DepartmentResultItem[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div>
      <h1 className="sc-page-title">Department Results</h1>
      <p className="sc-page-subtitle">
        Published and in-progress assessment results across your workspace.
      </p>

      <div className="sc-card sc-dept-filters" style={{ padding: "1rem", marginTop: "1rem" }}>
        <div className="sc-dept-filters-grid">
          <label>
            Curriculum
            <select
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
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              <option value="">All results</option>
              <option value="MARKING">MARKING</option>
              <option value="MARKED">MARKED</option>
              <option value="HOD_REVIEW">HOD_REVIEW</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PUBLISHED">PUBLISHED</option>
            </select>
          </label>
          <label>
            Teacher
            <select
              value={filters.teacherId}
              onChange={(e) => updateFilter("teacherId", e.target.value)}
            >
              <option value="">All</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <p style={{ marginTop: "1rem" }}>Loading…</p> : null}
      {error ? <p className="sc-error" style={{ marginTop: "1rem" }}>{error}</p> : null}

      {!loading && !error ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
          {items.length === 0 ? (
            <p className="sc-dept-empty">No results match your filters.</p>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Teacher</th>
                    <th>Grade</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Avg %</th>
                    <th>Pass rate</th>
                    <th>Learners</th>
                    <th>At risk</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{item.creatorTeacher.fullName}</td>
                      <td>{item.grade.name}</td>
                      <td>{item.subject.name}</td>
                      <td>
                        <span className={`sc-badge ${item.status === "PUBLISHED" ? "sc-badge-gold" : "sc-badge-muted"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>{formatPct(item.classAverage)}</td>
                      <td>{formatPct(item.passRate)}</td>
                      <td>{item.learnerCount ?? "—"}</td>
                      <td>{item.learnersAtRiskCount ?? "—"}</td>
                      <td>
                        {item.status === "PUBLISHED" ? (
                          <Link to={`/published-results/${item.id}`} className="sc-btn sc-btn-ghost">
                            Published
                          </Link>
                        ) : null}
                        <Link to={`/assessments/${item.id}/results`} className="sc-btn sc-btn-ghost">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
