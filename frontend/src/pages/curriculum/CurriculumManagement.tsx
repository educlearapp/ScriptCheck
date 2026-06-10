import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type {
  CurriculumRef,
  CurriculumTopic,
  CurriculumTree,
  GradeRef,
  PhaseRef,
  SubjectRef,
} from "../../types";
import "./CurriculumManagement.css";

export default function CurriculumManagement() {
  const { user } = useAuth();
  const canManageTopics = hasPermission(user, "curriculumTopics.manage");

  const [tree, setTree] = useState<CurriculumTree[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [topicCurriculumId, setTopicCurriculumId] = useState("");
  const [topicPhaseId, setTopicPhaseId] = useState("");
  const [topicGradeId, setTopicGradeId] = useState("");
  const [topicSubjectId, setTopicSubjectId] = useState("");
  const [topics, setTopics] = useState<CurriculumTopic[]>([]);
  const [topicForm, setTopicForm] = useState({ topic: "", subtopic: "" });
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicError, setTopicError] = useState("");

  useEffect(() => {
    apiFetch<CurriculumTree[]>("/curriculum/tree")
      .then((data) => {
        setTree(data);
        const initial: Record<string, boolean> = {};
        for (const c of data) initial[c.id] = true;
        setExpanded(initial);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load curriculum tree")
      )
      .finally(() => setLoading(false));

    apiFetch<CurriculumRef[]>("/curriculum").then(setCurriculums).catch(() => {});
  }, []);

  useEffect(() => {
    if (!topicCurriculumId) return;
    apiFetch<PhaseRef[]>(`/curriculum/${topicCurriculumId}/phases`).then(setPhases);
  }, [topicCurriculumId]);

  useEffect(() => {
    if (!topicPhaseId) return;
    Promise.all([
      apiFetch<GradeRef[]>(`/curriculum/phases/${topicPhaseId}/grades`),
      apiFetch<SubjectRef[]>(`/curriculum/phases/${topicPhaseId}/subjects`),
    ]).then(([g, s]) => {
      setGrades(g);
      setSubjects(s);
    });
  }, [topicPhaseId]);

  const loadTopics = useCallback(() => {
    const params = new URLSearchParams();
    if (topicCurriculumId) params.set("curriculumId", topicCurriculumId);
    if (topicPhaseId) params.set("phaseId", topicPhaseId);
    if (topicGradeId) params.set("gradeId", topicGradeId);
    if (topicSubjectId) params.set("subjectId", topicSubjectId);

    apiFetch<CurriculumTopic[]>(`/curriculum/topics?${params}`)
      .then(setTopics)
      .catch((err) =>
        setTopicError(err instanceof Error ? err.message : "Failed to load topics")
      );
  }, [topicCurriculumId, topicPhaseId, topicGradeId, topicSubjectId]);

  useEffect(() => {
    if (topicCurriculumId && topicPhaseId && topicGradeId && topicSubjectId) {
      loadTopics();
    } else {
      setTopics([]);
    }
  }, [loadTopics, topicCurriculumId, topicPhaseId, topicGradeId, topicSubjectId]);

  const handleCreateTopic = async () => {
    if (!topicCurriculumId || !topicPhaseId || !topicGradeId || !topicSubjectId || !topicForm.topic) {
      setTopicError("Select curriculum context and enter a topic name.");
      return;
    }

    setTopicSaving(true);
    setTopicError("");
    try {
      await apiFetch("/curriculum/topics", {
        method: "POST",
        body: JSON.stringify({
          curriculumId: topicCurriculumId,
          phaseId: topicPhaseId,
          gradeId: topicGradeId,
          subjectId: topicSubjectId,
          topic: topicForm.topic,
          subtopic: topicForm.subtopic || undefined,
        }),
      });
      setTopicForm({ topic: "", subtopic: "" });
      loadTopics();
    } catch (err) {
      setTopicError(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setTopicSaving(false);
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return <p className="sc-page-subtitle">Loading curriculum structure…</p>;
  }

  return (
    <div>
      <h1 className="sc-page-title">Curriculum Management</h1>
      <p className="sc-page-subtitle">
        CAPS, IEB and Cambridge — structured phases, grades and subjects.
      </p>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-curriculum-tree">
        {tree.map((curriculum) => (
          <div key={curriculum.id} className="sc-curriculum-node sc-card">
            <button
              type="button"
              className="sc-curriculum-node-header"
              style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
              onClick={() => toggle(curriculum.id)}
            >
              <div>
                <div className="sc-curriculum-node-title">
                  {expanded[curriculum.id] ? "▾" : "▸"} {curriculum.name}
                </div>
                <div className="sc-curriculum-node-meta">
                  Code: {curriculum.code} · {curriculum.phases.length} phases
                </div>
              </div>
              <span className="sc-badge sc-badge-gold">{curriculum.code}</span>
            </button>

            {expanded[curriculum.id] ? (
              <div className="sc-curriculum-children">
                {curriculum.phases.map((phase) => (
                  <div key={phase.id} className="sc-phase-block">
                    <div className="sc-curriculum-node-title" style={{ fontSize: "0.95rem" }}>
                      {phase.name}
                    </div>
                    <div className="sc-curriculum-node-meta">
                      {phase.code} · {phase.grades.length} grades · {phase.subjects.length} subjects
                    </div>

                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--sc-text-muted)" }}>
                      Grades
                    </div>
                    <div className="sc-grade-list">
                      {phase.grades.map((grade) => (
                        <span key={grade.id} className="sc-badge sc-badge-muted">
                          {grade.name}
                        </span>
                      ))}
                    </div>

                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--sc-text-muted)" }}>
                      Subjects
                    </div>
                    <div className="sc-subject-list">
                      {phase.subjects.map((subject) => (
                        <span
                          key={subject.id}
                          className={`sc-subject-chip${
                            subject.category === "COMPULSORY"
                              ? " is-compulsory"
                              : subject.category === "ELECTIVE"
                                ? " is-elective"
                                : ""
                          }`}
                        >
                          {subject.name}
                          {subject.category ? ` (${subject.category.toLowerCase()})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="sc-card sc-card-gold" style={{ marginTop: "2rem", padding: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>
          Curriculum Topics
        </h2>
        <p className="sc-page-subtitle" style={{ marginBottom: "1rem" }}>
          Define topics and subtopics for AI generation and analytics.
        </p>

        <div className="sc-form-grid sc-form-grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <label className="sc-label">Curriculum</label>
            <select
              className="sc-select"
              value={topicCurriculumId}
              onChange={(e) => {
                setTopicCurriculumId(e.target.value);
                setTopicPhaseId("");
                setTopicGradeId("");
                setTopicSubjectId("");
              }}
            >
              <option value="">Select…</option>
              {curriculums.map((c) => (
                <option key={c.id} value={c.id}>{c.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sc-label">Phase</label>
            <select
              className="sc-select"
              value={topicPhaseId}
              onChange={(e) => {
                setTopicPhaseId(e.target.value);
                setTopicGradeId("");
                setTopicSubjectId("");
              }}
              disabled={!topicCurriculumId}
            >
              <option value="">Select…</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sc-label">Grade</label>
            <select
              className="sc-select"
              value={topicGradeId}
              onChange={(e) => setTopicGradeId(e.target.value)}
              disabled={!topicPhaseId}
            >
              <option value="">Select…</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sc-label">Subject</label>
            <select
              className="sc-select"
              value={topicSubjectId}
              onChange={(e) => setTopicSubjectId(e.target.value)}
              disabled={!topicPhaseId}
            >
              <option value="">Select…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {canManageTopics ? (
          <div className="sc-form-grid sc-form-grid-2" style={{ marginBottom: "1rem" }}>
            <div>
              <label className="sc-label">Topic</label>
              <input
                className="sc-input"
                value={topicForm.topic}
                onChange={(e) => setTopicForm({ ...topicForm, topic: e.target.value })}
                placeholder="e.g. Algebra"
              />
            </div>
            <div>
              <label className="sc-label">Subtopic (optional)</label>
              <input
                className="sc-input"
                value={topicForm.subtopic}
                onChange={(e) => setTopicForm({ ...topicForm, subtopic: e.target.value })}
                placeholder="e.g. Linear equations"
              />
            </div>
            <div className="sc-form-actions" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={topicSaving}
                onClick={handleCreateTopic}
              >
                {topicSaving ? "Adding…" : "Add topic"}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)", marginBottom: "1rem" }}>
            Select curriculum context to view active topics. Contact an admin to add new topics.
          </p>
        )}

        {topicError ? <p className="sc-error">{topicError}</p> : null}

        {topicSubjectId ? (
          topics.length === 0 ? (
            <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>No topics defined yet.</p>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Subtopic</th>
                    <th>Order</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((t) => (
                    <tr key={t.id}>
                      <td>{t.topic}</td>
                      <td>{t.subtopic || "—"}</td>
                      <td>{t.orderIndex}</td>
                      <td>
                        <span className={`sc-badge ${t.active ? "sc-badge-gold" : "sc-badge-muted"}`}>
                          {t.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
