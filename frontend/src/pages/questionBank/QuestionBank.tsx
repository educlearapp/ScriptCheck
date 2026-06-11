import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type {
  CurriculumRef,
  GradeRef,
  PhaseRef,
  QuestionBankItem,
  QuestionBankStatus,
  SubjectRef,
} from "../../types";
import "./QuestionBank.css";
import "../assessments/QuestionBankPicker.css";

const STATUSES: QuestionBankStatus[] = ["DRAFT", "APPROVED", "ARCHIVED"];

const EMPTY_FORM = {
  questionText: "",
  topic: "",
  subtopic: "",
  marks: "5",
  difficulty: "",
  cognitiveLevel: "",
  expectedAnswer: "",
  memoNotes: "",
};

export default function QuestionBank() {
  const { user } = useAuth();

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuestionBankStatus | "">("");

  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<CurriculumRef[]>("/curriculum").then(setCurriculums).catch(() => {});
  }, []);

  useEffect(() => {
    if (!curriculumId) return;
    apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`).then(setPhases);
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) return;
    Promise.all([
      apiFetch<GradeRef[]>(`/curriculum/phases/${phaseId}/grades`),
      apiFetch<SubjectRef[]>(`/curriculum/phases/${phaseId}/subjects`),
    ]).then(([g, s]) => {
      setGrades(g);
      setSubjects(s);
    });
  }, [phaseId]);

  const loadItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (curriculumId) params.set("curriculumId", curriculumId);
    if (phaseId) params.set("phaseId", phaseId);
    if (gradeId) params.set("gradeId", gradeId);
    if (subjectId) params.set("subjectId", subjectId);
    if (topicFilter) params.set("topic", topicFilter);
    if (statusFilter) params.set("status", statusFilter);

    apiFetch<QuestionBankItem[]>(`/question-bank?${params}`)
      .then(setItems)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load question bank")
      )
      .finally(() => setLoading(false));
  }, [curriculumId, phaseId, gradeId, subjectId, topicFilter, statusFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: QuestionBankItem) => {
    setEditingId(item.id);
    setForm({
      questionText: item.questionText,
      topic: item.topic ?? "",
      subtopic: item.subtopic ?? "",
      marks: String(item.marks),
      difficulty: item.difficulty ?? "",
      cognitiveLevel: item.cognitiveLevel ?? "",
      expectedAnswer: item.expectedAnswer ?? "",
      memoNotes: item.memoNotes ?? "",
    });
    setCurriculumId(item.curriculumId);
    setPhaseId(item.phaseId);
    setGradeId(item.gradeId);
    setSubjectId(item.subjectId);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!curriculumId || !phaseId || !gradeId || !subjectId) {
      setError("Select curriculum context before saving.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        curriculumId,
        phaseId,
        gradeId,
        subjectId,
        ...form,
        marks: Number(form.marks),
      };

      if (editingId) {
        await apiFetch(`/question-bank/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/question-bank", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setShowForm(false);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiFetch(`/question-bank/${id}/approve`, { method: "POST" });
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await apiFetch(`/question-bank/${id}/archive`, { method: "POST" });
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  };

  const canEditItem = (item: QuestionBankItem) =>
    hasPermission(user, "questionBank.edit") ||
    (item.status === "DRAFT" &&
      item.createdBy.id === user?.id &&
      hasPermission(user, "questionBank.create"));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="sc-page-title">Question Bank</h1>
          <p className="sc-page-subtitle">
            Reusable questions from teacher work, AI generation, and DH-approved assessments.
          </p>
        </div>
        {hasPermission(user, "questionBank.create") ? (
          <button type="button" className="sc-btn sc-btn-primary" onClick={openCreate}>
            Add question
          </button>
        ) : null}
      </div>

      <div className="sc-card sc-card-gold sc-qb-filters" style={{ padding: "1rem", marginTop: "1rem" }}>
        <div>
          <label className="sc-label">Curriculum</label>
          <select className="sc-select" value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
            <option value="">All</option>
            {curriculums.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sc-label">Phase</label>
          <select className="sc-select" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!curriculumId}>
            <option value="">All</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sc-label">Grade</label>
          <select className="sc-select" value={gradeId} onChange={(e) => setGradeId(e.target.value)} disabled={!phaseId}>
            <option value="">All</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sc-label">Subject</label>
          <select className="sc-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!phaseId}>
            <option value="">All</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sc-label">Topic</label>
          <input className="sc-input" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} placeholder="Filter topic" />
        </div>
        <div>
          <label className="sc-label">Status</label>
          <select className="sc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as QuestionBankStatus | "")}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {showForm ? (
        <div className="sc-card sc-card-gold sc-form-grid" style={{ padding: "1.25rem", marginTop: "1rem" }}>
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            {editingId ? "Edit question" : "New question"}
          </h3>
          <div className="sc-form-grid sc-form-grid-2">
            <div>
              <label className="sc-label">Curriculum</label>
              <select className="sc-select" value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
                <option value="">Select…</option>
                {curriculums.map((c) => (
                  <option key={c.id} value={c.id}>{c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sc-label">Phase</label>
              <select className="sc-select" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={!curriculumId}>
                <option value="">Select…</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sc-label">Grade</label>
              <select className="sc-select" value={gradeId} onChange={(e) => setGradeId(e.target.value)} disabled={!phaseId}>
                <option value="">Select…</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sc-label">Subject</label>
              <select className="sc-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!phaseId}>
                <option value="">Select…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="sc-label">Question text</label>
            <textarea className="sc-input" rows={3} value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} />
          </div>
          <div className="sc-form-grid sc-form-grid-2">
            <div>
              <label className="sc-label">Topic</label>
              <input className="sc-input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
            <div>
              <label className="sc-label">Subtopic</label>
              <input className="sc-input" value={form.subtopic} onChange={(e) => setForm({ ...form, subtopic: e.target.value })} />
            </div>
            <div>
              <label className="sc-label">Marks</label>
              <input className="sc-input" type="number" min={1} value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
            </div>
            <div>
              <label className="sc-label">Difficulty</label>
              <input className="sc-input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} />
            </div>
            <div>
              <label className="sc-label">Cognitive level</label>
              <input className="sc-input" value={form.cognitiveLevel} onChange={(e) => setForm({ ...form, cognitiveLevel: e.target.value })} />
            </div>
          </div>
          <div className="sc-form-actions">
            <button type="button" className="sc-btn sc-btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {error ? <p className="sc-error" style={{ marginTop: "1rem" }}>{error}</p> : null}

      <div className="sc-card" style={{ marginTop: "1rem", padding: "0.5rem 0" }}>
        {loading ? (
          <p style={{ padding: "1rem" }}>Loading…</p>
        ) : items.length === 0 ? (
          <div className="sc-placeholder-panel">
            <h3>No questions yet</h3>
            <p>Save questions from assessments or add them manually.</p>
          </div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Topic</th>
                  <th>Marks</th>
                  <th>Difficulty</th>
                  <th>Cognitive</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="sc-qb-question-preview" title={item.questionText}>{item.questionText}</td>
                    <td>{item.topic || "—"}</td>
                    <td>{item.marks}</td>
                    <td>{item.difficulty || "—"}</td>
                    <td>{item.cognitiveLevel || "—"}</td>
                    <td><span className="sc-badge sc-badge-muted">{item.source.replaceAll("_", " ")}</span></td>
                    <td>
                      {item.status === "APPROVED" ? (
                        <span className="sc-hod-badge">✓ DH Approved</span>
                      ) : (
                        <span className="sc-badge sc-badge-gold">{item.status}</span>
                      )}
                    </td>
                    <td>{item.usageCount}</td>
                    <td>
                      <div className="sc-form-actions" style={{ marginTop: 0 }}>
                        {canEditItem(item) ? (
                          <button type="button" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }} onClick={() => openEdit(item)}>Edit</button>
                        ) : null}
                        {hasPermission(user, "questionBank.approve") && item.status === "DRAFT" ? (
                          <button type="button" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }} onClick={() => handleApprove(item.id)}>Approve</button>
                        ) : null}
                        {hasPermission(user, "questionBank.archive") && item.status !== "ARCHIVED" ? (
                          <button type="button" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }} onClick={() => handleArchive(item.id)}>Archive</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
