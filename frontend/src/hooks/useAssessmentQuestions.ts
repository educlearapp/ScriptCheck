import { useCallback, useState } from "react";
import { apiFetch } from "../api";
import { hasPermission } from "../auth/permissions";
import type { AuthUser, AssessmentDetail, AssessmentQuestion, MarksSummary, QuestionsResponse } from "../types";
import {
  EMPTY_QUESTION_FORM,
  questionToFormValues,
  type QuestionFormValues,
} from "../pages/assessments/QuestionForm";

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

export function useAssessmentQuestions(
  assessmentId: string | undefined,
  assessment: AssessmentDetail | null,
  user: AuthUser | null,
  readOnly: boolean
) {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [marksSummary, setMarksSummary] = useState<MarksSummary | null>(null);
  const [actionError, setActionError] = useState("");
  const [formMode, setFormMode] = useState<"none" | "add" | "edit">("none");
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null);
  const [formValues, setFormValues] = useState<QuestionFormValues>(EMPTY_QUESTION_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [savedToBank, setSavedToBank] = useState<Record<string, string>>({});
  const [bankSaving, setBankSaving] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const setFromResponse = useCallback((data: QuestionsResponse) => {
    setQuestions(data.questions);
    setMarksSummary(data.marksSummary);
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!assessmentId) return;
    const data = await apiFetch<QuestionsResponse>(`/assessments/${assessmentId}/questions`);
    setFromResponse(data);
    if (hasPermission(user, "questionBank.view")) {
      const saved = await apiFetch<Record<string, string>>(
        `/question-bank/saved-from-assessment/${assessmentId}`
      );
      setSavedToBank(saved);
    }
  }, [assessmentId, setFromResponse, user]);

  const openAddForm = () => {
    setFormMode("add");
    setEditingQuestion(null);
    setFormValues({ ...EMPTY_QUESTION_FORM, questionNumber: String(questions.length + 1) });
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
    if (!assessmentId) return;
    setFormLoading(true);
    setActionError("");
    try {
      const payload = buildQuestionPayload(formValues);
      if (formMode === "add") {
        const result = await apiFetch<QuestionsResponse & { question: AssessmentQuestion }>(
          `/assessments/${assessmentId}/questions`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        setQuestions((prev) => [...prev, result.question]);
        setMarksSummary(result.marksSummary);
      } else if (formMode === "edit" && editingQuestion) {
        const result = await apiFetch<QuestionsResponse & { question: AssessmentQuestion }>(
          `/assessments/${assessmentId}/questions/${editingQuestion.id}`,
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
    if (!assessmentId) return;
    if (!window.confirm(`Delete question ${question.questionNumber}?`)) return;
    setActionError("");
    try {
      const result = await apiFetch<{ marksSummary: MarksSummary }>(
        `/assessments/${assessmentId}/questions/${question.id}`,
        { method: "DELETE" }
      );
      setQuestions((prev) => prev.filter((q) => q.id !== question.id));
      setMarksSummary(result.marksSummary);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete question");
    }
  };

  const handleSaveQuestionToBank = async (questionId: string) => {
    if (!assessmentId) return;
    setBankSaving(questionId);
    try {
      await apiFetch(`/question-bank/from-assessment/${assessmentId}/questions/${questionId}`, {
        method: "POST",
      });
      const saved = await apiFetch<Record<string, string>>(
        `/question-bank/saved-from-assessment/${assessmentId}`
      );
      setSavedToBank(saved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save to bank failed");
    } finally {
      setBankSaving(null);
    }
  };

  const handleSaveAllToBank = async () => {
    if (!assessmentId) return;
    setBankSaving("all");
    try {
      await apiFetch(`/question-bank/from-assessment/${assessmentId}`, { method: "POST" });
      const saved = await apiFetch<Record<string, string>>(
        `/question-bank/saved-from-assessment/${assessmentId}`
      );
      setSavedToBank(saved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save to bank failed");
    } finally {
      setBankSaving(null);
    }
  };

  return {
    questions,
    marksSummary,
    actionError,
    setActionError,
    formMode,
    editingQuestion,
    formValues,
    setFormValues,
    formLoading,
    savedToBank,
    bankSaving,
    pickerOpen,
    setPickerOpen,
    setFromResponse,
    loadQuestions,
    openAddForm,
    openEditForm,
    closeForm,
    handleSaveQuestion,
    handleDeleteQuestion,
    handleSaveQuestionToBank,
    handleSaveAllToBank,
    readOnly,
    canSaveToBank: hasPermission(user, "questionBank.create"),
    canUseBank: hasPermission(user, "questionBank.view"),
    assessment,
  };
}
