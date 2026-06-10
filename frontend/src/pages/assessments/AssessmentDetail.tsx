import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import {
  canSubmitAssessment,
  canViewResults,
  hasPermission,
  isAssessmentReadOnly,
} from "../../auth/permissions";
import type {
  AssessmentDetail,
  AssessmentQuestion,
  MarksSummary,
  QuestionsResponse,
} from "../../types";
import QuestionForm, {
  EMPTY_QUESTION_FORM,
  questionToFormValues,
  type QuestionFormValues,
} from "./QuestionForm";
import QuestionBankPicker from "./QuestionBankPicker";
import "./QuestionBankPicker.css";

function buildQuestionPayload(values: QuestionFormValues) {
  return {
    questionNumber: values.questionNumber || undefined,
    section: values.section || null,
    questionText: values.questionText,
    topic: values.topic || null,
    marks: Number(values.marks),
    cognitiveLevel: values.cognitiveLevel || null,
    difficulty: values.difficulty || null,
    expectedAnswer: values.expectedAnswer || null,
    memoNotes: values.memoNotes || null,
    rubricNotes: values.rubricNotes || null,
  };
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [marksSummary, setMarksSummary] = useState<MarksSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [formMode, setFormMode] = useState<"none" | "add" | "edit">("none");
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null);
  const [formValues, setFormValues] = useState<QuestionFormValues>(EMPTY_QUESTION_FORM);
  const [formLoading, setFormLoading] = useState(false);

  const [savedToBank, setSavedToBank] = useState<Record<string, string>>({});
  const [bankSaving, setBankSaving] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");

    try {
      const [detail, questionsData] = await Promise.all([
        apiFetch<AssessmentDetail>(`/assessments/${id}`),
        apiFetch<QuestionsResponse>(`/assessments/${id}/questions`),
      ]);
      setAssessment(detail);
      setQuestions(questionsData.questions);
      setMarksSummary(questionsData.marksSummary);

      if (hasPermission(user, "questionBank.view")) {
        const saved = await apiFetch<Record<string, string>>(
          `/question-bank/saved-from-assessment/${id}`
        );
        setSavedToBank(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assessment");
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canSaveToBank = hasPermission(user, "questionBank.create");
  const canUseBank = hasPermission(user, "questionBank.view");
  const canSaveTemplate =
    hasPermission(user, "assessmentTemplates.create") && questions.length > 0;

  const handleSaveTemplate = async () => {
    if (!id || !templateName.trim()) return;
    setTemplateSaving(true);
    setActionError("");
    try {
      await apiFetch(`/assessment-templates/from-assessment/${id}`, {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || null,
        }),
      });
      setTemplateOpen(false);
      setTemplateName("");
      setTemplateDesc("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save template failed");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSaveAllToBank = async () => {
    if (!id) return;
    setBankSaving("all");
    setActionError("");
    try {
      const result = await apiFetch<{ saved: number; skipped: number }>(
        `/question-bank/from-assessment/${id}`,
        { method: "POST" }
      );
      const saved = await apiFetch<Record<string, string>>(
        `/question-bank/saved-from-assessment/${id}`
      );
      setSavedToBank(saved);
      if (result.saved === 0 && result.skipped > 0) {
        setActionError("All questions were already saved to the bank.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save to bank failed");
    } finally {
      setBankSaving(null);
    }
  };

  const handleSaveQuestionToBank = async (questionId: string) => {
    if (!id) return;
    setBankSaving(questionId);
    setActionError("");
    try {
      await apiFetch(`/question-bank/from-assessment/${id}/questions/${questionId}`, {
        method: "POST",
      });
      const saved = await apiFetch<Record<string, string>>(
        `/question-bank/saved-from-assessment/${id}`
      );
      setSavedToBank(saved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save to bank failed");
    } finally {
      setBankSaving(null);
    }
  };

  const isReadOnly = () => {
    if (!assessment || !user) return true;
    return isAssessmentReadOnly(
      user,
      assessment.creatorTeacher.id,
      assessment.status
    );
  };

  const canSubmitToHod = () => {
    if (!assessment || !user) return false;
    return canSubmitAssessment(
      user,
      assessment.creatorTeacher.id,
      assessment.status
    );
  };

  const readOnly = isReadOnly();

  const openAddForm = () => {
    setFormMode("add");
    setEditingQuestion(null);
    setFormValues({
      ...EMPTY_QUESTION_FORM,
      questionNumber: String(questions.length + 1),
    });
    setActionError("");
  };

  const openEditForm = (question: AssessmentQuestion) => {
    setFormMode("edit");
    setEditingQuestion(question);
    setFormValues(questionToFormValues(question));
    setActionError("");
  };

  const closeForm = () => {
    setFormMode("none");
    setEditingQuestion(null);
    setFormValues(EMPTY_QUESTION_FORM);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setFormLoading(true);
    setActionError("");

    try {
      const payload = buildQuestionPayload(formValues);

      if (formMode === "add") {
        const result = await apiFetch<QuestionsResponse & { question: AssessmentQuestion }>(
          `/assessments/${id}/questions`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        setQuestions((prev) => [...prev, result.question]);
        setMarksSummary(result.marksSummary);
      } else if (formMode === "edit" && editingQuestion) {
        const result = await apiFetch<QuestionsResponse & { question: AssessmentQuestion }>(
          `/assessments/${id}/questions/${editingQuestion.id}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
        setQuestions((prev) =>
          prev.map((q) => (q.id === result.question.id ? result.question : q))
        );
        setMarksSummary(result.marksSummary);
      }

      closeForm();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteQuestion = async (question: AssessmentQuestion) => {
    if (!id) return;
    if (!window.confirm(`Delete question ${question.questionNumber}?`)) return;

    setActionError("");

    try {
      const result = await apiFetch<{ marksSummary: MarksSummary }>(
        `/assessments/${id}/questions/${question.id}`,
        { method: "DELETE" }
      );
      setQuestions((prev) => prev.filter((q) => q.id !== question.id));
      setMarksSummary(result.marksSummary);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete question");
    }
  };

  const handleSubmitToHod = async () => {
    if (!id) return;
    setSubmitting(true);
    setActionError("");

    try {
      await apiFetch(`/assessments/${id}/submit-to-hod`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p>Loading assessment…</p>;
  }

  if (error || !assessment) {
    return (
      <div>
        <p className="sc-error">{error || "Assessment not found"}</p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost">
          Back to assessments
        </Link>
      </div>
    );
  }

  const summary = marksSummary || assessment.marksSummary;

  return (
    <div className="sc-assessment-detail">
      <div className="sc-detail-header">
        <div>
          <Link to="/assessments" className="sc-detail-back">
            ← Assessments
          </Link>
          <h1 className="sc-page-title">{assessment.title}</h1>
          <p className="sc-page-subtitle">
            {assessment.subject.name} · {assessment.grade.name} · {assessment.curriculum.code} · {assessment.phase.name}
          </p>
        </div>
        <div className="sc-detail-actions">
          {hasPermission(user, "scripts.view") ? (
            <Link to={`/assessments/${id}/scripts`} className="sc-btn sc-btn-ghost">
              Learner Scripts
            </Link>
          ) : null}
          {assessment && canViewResults(user, assessment.creatorTeacher.id) ? (
            <Link to={`/assessments/${id}/results`} className="sc-btn sc-btn-ghost">
              View Results
            </Link>
          ) : null}
          {canSaveTemplate && !readOnly ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => {
                setTemplateName(assessment.title);
                setTemplateOpen(true);
              }}
            >
              Save As Template
            </button>
          ) : null}
          {canSaveToBank && questions.length > 0 ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={bankSaving === "all"}
              onClick={handleSaveAllToBank}
            >
              {bankSaving === "all" ? "Saving…" : "Save All Questions to Bank"}
            </button>
          ) : null}
          {canSubmitToHod() ? (
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={submitting}
              onClick={handleSubmitToHod}
            >
              {submitting ? "Submitting…" : "Submit to HOD"}
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <div className="sc-grid-3 sc-detail-info-grid">
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Status</div>
          <span
            className={`sc-badge ${
              assessment.status === "RETURNED_TO_TEACHER"
                ? "sc-badge-gold"
                : "sc-badge-muted"
            }`}
          >
            {assessment.status}
          </span>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Declared total marks</div>
          <div className="sc-stat-value" style={{ fontSize: "1.4rem" }}>
            {assessment.totalMarks}
          </div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">From questions</div>
          <div
            className="sc-stat-value"
            style={{
              fontSize: "1.4rem",
              color: summary?.mismatch ? "var(--sc-warning)" : "var(--sc-gold-light)",
            }}
          >
            {summary?.calculatedFromQuestions ?? 0}
          </div>
          {summary?.mismatch ? (
            <p className="sc-marks-mismatch">
              Mismatch — question marks ({summary.calculatedFromQuestions}) differ from
              declared total ({summary.declaredTotalMarks})
            </p>
          ) : summary && summary.questionCount > 0 ? (
            <p className="sc-detail-hint">Totals match</p>
          ) : (
            <p className="sc-detail-hint">Add questions to calculate total</p>
          )}
        </div>
      </div>

      <div className="sc-card sc-detail-meta" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <div className="sc-detail-meta-grid">
          <div>
            <span className="sc-detail-label">Type</span>
            <div>{assessment.assessmentType.replaceAll("_", " ")}</div>
          </div>
          <div>
            <span className="sc-detail-label">Term / Session</span>
            <div>
              {[assessment.term, assessment.session].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div>
            <span className="sc-detail-label">Duration</span>
            <div>
              {assessment.durationMinutes ? `${assessment.durationMinutes} min` : "—"}
            </div>
          </div>
          <div>
            <span className="sc-detail-label">Teacher</span>
            <div>{assessment.creatorTeacher.fullName}</div>
          </div>
        </div>
        {assessment.description ? (
          <p className="sc-detail-description">{assessment.description}</p>
        ) : null}
      </div>

      <div className="sc-detail-questions-header">
        <div>
          <h2>Questions</h2>
          <p className="sc-page-subtitle">
            {readOnly
              ? "Review question breakdown for moderation and future analytics."
              : "Build your assessment paper question by question."}
          </p>
        </div>
        {!readOnly && formMode === "none" ? (
          <div className="sc-detail-action-bar">
            <button type="button" className="sc-btn sc-btn-primary" onClick={openAddForm}>
              + Add Question
            </button>
            {canUseBank ? (
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                onClick={() => setPickerOpen(true)}
              >
                Question Bank
              </button>
            ) : null}
            {hasPermission(user, "assessments.create") ? (
              <Link to="/assessments/generate" className="sc-btn sc-btn-ghost">
                Generate With AI
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {assessment && pickerOpen ? (
        <QuestionBankPicker
          assessment={assessment}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onAdded={loadData}
        />
      ) : null}

      {templateOpen ? (
        <div className="sc-qb-picker-overlay" onClick={() => setTemplateOpen(false)}>
          <div
            className="sc-qb-picker-modal"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sc-qb-picker-header">
              <h2 style={{ margin: 0, color: "var(--sc-gold-light)" }}>Save As Template</h2>
            </div>
            <div className="sc-qb-picker-body">
              <div className="sc-form-grid">
                <div>
                  <label className="sc-label">Template name</label>
                  <input
                    className="sc-input"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="sc-label">Description (optional)</label>
                  <textarea
                    className="sc-input"
                    rows={3}
                    value={templateDesc}
                    onChange={(e) => setTemplateDesc(e.target.value)}
                  />
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                  {questions.length} questions will be saved including topic, difficulty, and marks.
                </p>
              </div>
            </div>
            <div className="sc-qb-picker-footer">
              <div />
              <div className="sc-form-actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="sc-btn sc-btn-primary"
                  disabled={templateSaving || !templateName.trim()}
                  onClick={handleSaveTemplate}
                >
                  {templateSaving ? "Saving…" : "Create Template"}
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn-ghost"
                  onClick={() => setTemplateOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {formMode !== "none" ? (
        <div
          className="sc-card sc-card-gold sc-form-grid"
          style={{ marginBottom: "1rem", padding: "1.5rem" }}
        >
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            {formMode === "add" ? "Add question" : `Edit question ${editingQuestion?.questionNumber}`}
          </h3>
          <QuestionForm
            values={formValues}
            onChange={setFormValues}
            onSubmit={handleSaveQuestion}
            onCancel={closeForm}
            submitLabel={formMode === "add" ? "Add question" : "Save changes"}
            loading={formLoading}
          />
        </div>
      ) : null}

      <div className="sc-card" style={{ padding: "0.5rem 0" }}>
        {questions.length === 0 ? (
          <div className="sc-placeholder-panel">
            <h3>No questions yet</h3>
            <p>
              {readOnly
                ? "This assessment has no questions defined."
                : "Add your first question to start building the paper."}
            </p>
          </div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Section</th>
                  <th>Question</th>
                  <th>Topic</th>
                  <th>Marks</th>
                  <th>Cognitive</th>
                  <th>Difficulty</th>
                  {canSaveToBank ? <th>Question Bank</th> : null}
                  {!readOnly ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>{q.questionNumber}</td>
                    <td>{q.section || "—"}</td>
                    <td className="sc-question-text-cell">{q.questionText}</td>
                    <td>{q.topic || "—"}</td>
                    <td>{q.marks}</td>
                    <td>{q.cognitiveLevel || "—"}</td>
                    <td>{q.difficulty || "—"}</td>
                    {canSaveToBank ? (
                      <td>
                        {savedToBank[q.id] ? (
                          <span className="sc-badge sc-badge-gold">Saved to Bank</span>
                        ) : (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={bankSaving === q.id}
                            onClick={() => handleSaveQuestionToBank(q.id)}
                          >
                            {bankSaving === q.id ? "Saving…" : "Save to Question Bank"}
                          </button>
                        )}
                      </td>
                    ) : null}
                    {!readOnly ? (
                      <td>
                        <div className="sc-form-actions" style={{ marginTop: 0 }}>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            onClick={() => openEditForm(q)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            onClick={() => handleDeleteQuestion(q)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {readOnly && questions.length > 0 ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Memo preview</h3>
          <div className="sc-memo-preview">
            {questions.map((q) => (
              <div key={q.id} className="sc-memo-item">
                <div className="sc-memo-item-header">
                  <strong>Q{q.questionNumber}</strong>
                  <span>{q.marks} marks</span>
                  {q.topic ? <span className="sc-badge sc-badge-muted">{q.topic}</span> : null}
                </div>
                <p>{q.questionText}</p>
                {q.expectedAnswer ? (
                  <p className="sc-memo-answer">
                    <span>Expected:</span> {q.expectedAnswer}
                  </p>
                ) : null}
                {q.memoNotes ? (
                  <p className="sc-memo-notes">
                    <span>Memo:</span> {q.memoNotes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Analytics preparation</h3>
        <p style={{ margin: 0, color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
          Each question stores topic, cognitive level and difficulty for future analytics:
          average per question, weak topics, cognitive-level performance, and difficulty
          performance. Data fields are ready — calculations come in a later phase.
        </p>
      </div>
    </div>
  );
}
