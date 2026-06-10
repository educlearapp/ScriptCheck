import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import type {
  AssessmentTemplate,
  AssessmentType,
  QuestionBankItem,
  QuestionBankStatus,
  TemplatePreview,
} from "../../types";
import CurriculumSelector, { curriculumContextReady } from "./CurriculumSelector";
import TemplatePreviewPanel from "../templates/TemplatePreviewPanel";
import "./CreateAssessment.css";
import "./QuestionBankPicker.css";

const ASSESSMENT_TYPES: AssessmentType[] = [
  "TEST", "EXAM", "ASSIGNMENT", "SBA_TASK", "PROJECT", "PRACTICAL", "ORAL", "OTHER",
];

type CreatePath = "pick" | "blank" | "template" | "bank";

const PATHS: { id: CreatePath | "ai"; icon: string; title: string; desc: string }[] = [
  { id: "blank", icon: "📄", title: "Blank Assessment", desc: "Start from scratch with curriculum context and metadata." },
  { id: "template", icon: "▤", title: "Start From Template", desc: "Reuse a saved template with pre-built questions." },
  { id: "bank", icon: "📚", title: "Build From Question Bank", desc: "Pick approved questions and create a draft assessment." },
  { id: "ai", icon: "✦", title: "Generate With AI", desc: "Use the AI Paper Generator to create questions." },
];

export default function CreateAssessment() {
  const navigate = useNavigate();
  const [path, setPath] = useState<CreatePath>("pick");

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Blank form
  const [title, setTitle] = useState("");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("TEST");
  const [totalMarks, setTotalMarks] = useState("50");

  // Template flow
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);

  // Bank flow
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [selectedBank, setSelectedBank] = useState<Set<string>>(new Set());
  const [topicFilter, setTopicFilter] = useState("");
  const [subtopicFilter, setSubtopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [marksFilter, setMarksFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuestionBankStatus | "">("APPROVED");
  const [bankTitle, setBankTitle] = useState("");

  const contextReady = curriculumContextReady(curriculumId, phaseId, gradeId, subjectId);

  const resetContext = () => {
    setCurriculumId("");
    setPhaseId("");
    setGradeId("");
    setSubjectId("");
  };

  const loadTemplates = useCallback(() => {
    if (!contextReady) return;
    const params = new URLSearchParams({
      curriculumId, phaseId, gradeId, subjectId,
    });
    apiFetch<AssessmentTemplate[]>(`/assessment-templates?${params}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [curriculumId, phaseId, gradeId, subjectId, contextReady]);

  const loadBankItems = useCallback(() => {
    if (!contextReady) return;
    const params = new URLSearchParams({
      forPicker: "true",
      curriculumId, phaseId, gradeId, subjectId,
    });
    if (topicFilter) params.set("topic", topicFilter);
    if (subtopicFilter) params.set("subtopic", subtopicFilter);
    if (difficultyFilter) params.set("difficulty", difficultyFilter);
    if (marksFilter) params.set("marks", marksFilter);
    if (statusFilter) params.set("status", statusFilter);

    apiFetch<QuestionBankItem[]>(`/question-bank?${params}`)
      .then(setBankItems)
      .catch(() => setBankItems([]));
  }, [curriculumId, phaseId, gradeId, subjectId, contextReady, topicFilter, subtopicFilter, difficultyFilter, marksFilter, statusFilter]);

  useEffect(() => {
    if (path === "template") loadTemplates();
  }, [path, loadTemplates]);

  useEffect(() => {
    if (path === "bank") loadBankItems();
  }, [path, loadBankItems]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplatePreview(null);
      return;
    }
    apiFetch<TemplatePreview>(`/assessment-templates/${selectedTemplateId}/preview`)
      .then(setTemplatePreview)
      .catch(() => setTemplatePreview(null));
  }, [selectedTemplateId]);

  const handleBlankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextReady) return;
    setLoading(true);
    setError("");
    try {
      const created = await apiFetch<{ id: string }>("/assessments", {
        method: "POST",
        body: JSON.stringify({
          title, curriculumId, phaseId, gradeId, subjectId,
          assessmentType,
          totalMarks: Number(totalMarks),
        }),
      });
      navigate(`/assessments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assessment");
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async () => {
    if (!selectedTemplateId) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ assessmentId: string }>(
        `/assessment-templates/${selectedTemplateId}/use`,
        { method: "POST", body: JSON.stringify({ title: templatePreview?.name }) }
      );
      navigate(`/assessments/${result.assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to use template");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromBank = async () => {
    if (!contextReady || selectedBank.size === 0 || !bankTitle.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ assessmentId: string }>("/assessments/from-question-bank", {
        method: "POST",
        body: JSON.stringify({
          title: bankTitle.trim(),
          curriculumId, phaseId, gradeId, subjectId,
          assessmentType: "TEST",
          itemIds: Array.from(selectedBank),
        }),
      });
      navigate(`/assessments/${result.assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assessment");
    } finally {
      setLoading(false);
    }
  };

  const toggleBank = (id: string) => {
    setSelectedBank((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (path === "pick") {
    return (
      <div>
        <h1 className="sc-page-title">Create Assessment</h1>
        <p className="sc-page-subtitle">Choose how you want to build your assessment.</p>
        <div className="sc-create-paths">
          {PATHS.map((p) =>
            p.id === "ai" ? (
              <Link key={p.id} to="/assessments/generate" className="sc-create-path" style={{ textDecoration: "none" }}>
                <div className="sc-create-path-icon">{p.icon}</div>
                <div className="sc-create-path-title">{p.title}</div>
                <p className="sc-create-path-desc">{p.desc}</p>
              </Link>
            ) : (
              <button
                key={p.id}
                type="button"
                className="sc-create-path"
                onClick={() => setPath(p.id as CreatePath)}
              >
                <div className="sc-create-path-icon">{p.icon}</div>
                <div className="sc-create-path-title">{p.title}</div>
                <p className="sc-create-path-desc">{p.desc}</p>
              </button>
            )
          )}
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={() => navigate("/assessments")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="sc-detail-back"
        onClick={() => { setPath("pick"); setError(""); resetContext(); setSelectedTemplateId(null); setSelectedBank(new Set()); }}
      >
        ← Choose creation path
      </button>
      <h1 className="sc-page-title">
        {path === "blank" ? "Blank Assessment" : path === "template" ? "Start From Template" : "Build From Question Bank"}
      </h1>

      {error ? <p className="sc-error">{error}</p> : null}

      {path === "blank" ? (
        <form className="sc-card sc-card-gold sc-form-grid" style={{ marginTop: "1rem", padding: "1.5rem", maxWidth: 760 }} onSubmit={handleBlankSubmit}>
          <CurriculumSelector
            curriculumId={curriculumId} phaseId={phaseId} gradeId={gradeId} subjectId={subjectId}
            onCurriculumIdChange={(id) => { setCurriculumId(id); setPhaseId(""); setGradeId(""); setSubjectId(""); }}
            onPhaseIdChange={(id) => { setPhaseId(id); setGradeId(""); setSubjectId(""); }}
            onGradeIdChange={setGradeId}
            onSubjectIdChange={setSubjectId}
          />
          <div>
            <label className="sc-label">Title</label>
            <input className="sc-input" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!contextReady} />
          </div>
          <div className="sc-form-grid sc-form-grid-2">
            <div>
              <label className="sc-label">Assessment type</label>
              <select className="sc-select" value={assessmentType} onChange={(e) => setAssessmentType(e.target.value as AssessmentType)} disabled={!contextReady}>
                {ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="sc-label">Total marks</label>
              <input className="sc-input" type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} required disabled={!contextReady} />
            </div>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={loading || !contextReady}>Save as draft</button>
          </div>
        </form>
      ) : null}

      {path === "template" ? (
        <div className="sc-card sc-card-gold" style={{ marginTop: "1rem", padding: "1.5rem", maxWidth: 900 }}>
          <CurriculumSelector
            curriculumId={curriculumId} phaseId={phaseId} gradeId={gradeId} subjectId={subjectId}
            onCurriculumIdChange={(id) => { setCurriculumId(id); setPhaseId(""); setGradeId(""); setSubjectId(""); setSelectedTemplateId(null); }}
            onPhaseIdChange={(id) => { setPhaseId(id); setGradeId(""); setSubjectId(""); setSelectedTemplateId(null); }}
            onGradeIdChange={(id) => { setGradeId(id); setSelectedTemplateId(null); }}
            onSubjectIdChange={(id) => { setSubjectId(id); setSelectedTemplateId(null); }}
          />
          {contextReady ? (
            templates.length === 0 ? (
              <p style={{ color: "var(--sc-text-muted)" }}>No templates for this curriculum context.</p>
            ) : (
              <>
                <label className="sc-label">Matching templates</label>
                <select className="sc-select" value={selectedTemplateId ?? ""} onChange={(e) => setSelectedTemplateId(e.target.value || null)}>
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.questionCount} questions · {t.totalMarks} marks
                    </option>
                  ))}
                </select>
                {templatePreview ? (
                  <div style={{ marginTop: "1rem" }}>
                    <h3 style={{ margin: "0 0 0.75rem", color: "var(--sc-gold-light)" }}>Template Preview</h3>
                    <TemplatePreviewPanel preview={templatePreview} />
                    <div className="sc-form-actions">
                      <button type="button" className="sc-btn sc-btn-primary" disabled={loading} onClick={handleUseTemplate}>
                        {loading ? "Creating…" : "Use Template"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )
          ) : null}
        </div>
      ) : null}

      {path === "bank" ? (
        <div className="sc-card sc-card-gold" style={{ marginTop: "1rem", padding: "1.5rem" }}>
          <CurriculumSelector
            curriculumId={curriculumId} phaseId={phaseId} gradeId={gradeId} subjectId={subjectId}
            onCurriculumIdChange={(id) => { setCurriculumId(id); setPhaseId(""); setGradeId(""); setSubjectId(""); setSelectedBank(new Set()); }}
            onPhaseIdChange={(id) => { setPhaseId(id); setGradeId(""); setSubjectId(""); setSelectedBank(new Set()); }}
            onGradeIdChange={(id) => { setGradeId(id); setSelectedBank(new Set()); }}
            onSubjectIdChange={(id) => { setSubjectId(id); setSelectedBank(new Set()); }}
          />
          {contextReady ? (
            <>
              <div className="sc-qb-picker-filters" style={{ marginTop: "1rem" }}>
                <div>
                  <label className="sc-label">Topic</label>
                  <input className="sc-input" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} />
                </div>
                <div>
                  <label className="sc-label">Subtopic</label>
                  <input className="sc-input" value={subtopicFilter} onChange={(e) => setSubtopicFilter(e.target.value)} />
                </div>
                <div>
                  <label className="sc-label">Difficulty</label>
                  <input className="sc-input" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} />
                </div>
                <div>
                  <label className="sc-label">Marks</label>
                  <input className="sc-input" type="number" min={1} value={marksFilter} onChange={(e) => setMarksFilter(e.target.value)} />
                </div>
                <div>
                  <label className="sc-label">Status</label>
                  <select className="sc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as QuestionBankStatus | "")}>
                    <option value="">All active</option>
                    <option value="APPROVED">Approved</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
              </div>
              <div className="sc-table-wrap" style={{ marginTop: "1rem" }}>
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Question</th>
                      <th>Topic</th>
                      <th>Marks</th>
                      <th>Difficulty</th>
                      <th>Status</th>
                      <th>Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankItems.map((item) => (
                      <tr key={item.id}>
                        <td><input type="checkbox" checked={selectedBank.has(item.id)} onChange={() => toggleBank(item.id)} /></td>
                        <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.questionText}>{item.questionText}</td>
                        <td>{item.topic || "—"}</td>
                        <td>{item.marks}</td>
                        <td>{item.difficulty || "—"}</td>
                        <td>{item.status === "APPROVED" ? <span className="sc-hod-badge">✓ HOD Approved</span> : item.status}</td>
                        <td>{item.usageCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <label className="sc-label">Assessment title</label>
                <input className="sc-input" value={bankTitle} onChange={(e) => setBankTitle(e.target.value)} placeholder="e.g. Term 2 Algebra Test" />
              </div>
              <div className="sc-form-actions">
                <button type="button" className="sc-btn sc-btn-primary" disabled={loading || selectedBank.size === 0 || !bankTitle.trim()} onClick={handleCreateFromBank}>
                  {loading ? "Creating…" : `Create Assessment (${selectedBank.size} questions)`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
