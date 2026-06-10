import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiDownloadPath, apiFetch, API_URL } from "../../api";
import { getAuthToken } from "../../auth/session";
import type {
  AiBloomLevel,
  AiBuilderDifficulty,
  AiBuilderRequest,
  AiGeneratedDraft,
  AiGeneratedQuestion,
  AiQuestionType,
  AiUploadPurpose,
  AssessmentType,
  CurriculumRef,
  ExtractedPaperQuestion,
  GradeRef,
  PaperBlueprint,
  PhaseRef,
  QuestionBankItem,
  SubjectRef,
} from "../../types";
import "./GenerateAssessment.css";
import "./AiAssessmentBuilder.css";
import {
  loadGradesAndSubjectsForPhase,
  phaseCodeFromPhases,
} from "../../utils/curriculumSubjects";

const STEPS = [
  "Upload Material",
  "Extract Content",
  "Settings",
  "Generate",
  "Review & Edit",
  "Approve",
] as const;

const ASSESSMENT_TYPES: AssessmentType[] = [
  "TEST", "EXAM", "ASSIGNMENT", "SBA_TASK", "PROJECT", "PRACTICAL", "ORAL", "OTHER",
];

const DIFFICULTIES: { value: AiBuilderDifficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MODERATE", label: "Moderate" },
  { value: "DIFFICULT", label: "Difficult" },
  { value: "MIXED", label: "Mixed" },
];

const QUESTION_TYPES: { value: AiQuestionType; label: string }[] = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True/False" },
  { value: "MATCH_COLUMNS", label: "Match Columns" },
  { value: "SHORT", label: "Short Questions" },
  { value: "PARAGRAPH", label: "Paragraph Questions" },
  { value: "CASE_STUDY", label: "Case Study Questions" },
];

const BLOOM_LEVELS: { value: AiBloomLevel; label: string }[] = [
  { value: "KNOWLEDGE", label: "Knowledge" },
  { value: "UNDERSTANDING", label: "Understanding" },
  { value: "APPLICATION", label: "Application" },
  { value: "ANALYSIS", label: "Analysis" },
  { value: "EVALUATION", label: "Evaluation" },
  { value: "CREATION", label: "Creation" },
];

function statusToStep(status: string): number {
  switch (status) {
    case "UPLOADING":
      return 0;
    case "EXTRACTING":
      return 1;
    case "SETTINGS":
      return 2;
    case "GENERATING":
      return 3;
    case "REVIEW":
      return 4;
    case "APPROVED":
      return 5;
    case "FAILED":
      return 3;
    default:
      return 0;
  }
}

export default function AiAssessmentBuilder() {
  const navigate = useNavigate();
  const { requestId: routeRequestId } = useParams<{ requestId?: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [request, setRequest] = useState<AiBuilderRequest | null>(null);
  const [draft, setDraft] = useState<AiGeneratedDraft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("TEST");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [totalMarks, setTotalMarks] = useState("50");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [difficulty, setDifficulty] = useState<AiBuilderDifficulty>("MODERATE");
  const [questionTypes, setQuestionTypes] = useState<AiQuestionType[]>([
    "SHORT", "MULTIPLE_CHOICE", "TRUE_FALSE",
  ]);
  const [bloomLevels, setBloomLevels] = useState<AiBloomLevel[]>([
    "KNOWLEDGE", "UNDERSTANDING", "APPLICATION",
  ]);
  const [instructions, setInstructions] = useState("");

  const [textEdits, setTextEdits] = useState<Record<string, string>>({});
  const [uploadPurpose, setUploadPurpose] = useState<AiUploadPurpose>("STUDY_MATERIAL");
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [questionDecisions, setQuestionDecisions] = useState<
    Record<string, { action: "save" | "skip" | "merge"; mergedText?: string }>
  >({});
  const [blueprint, setBlueprint] = useState<PaperBlueprint | null>(null);

  const loadRequest = useCallback(async (id: string) => {
    const data = await apiFetch<AiBuilderRequest>(`/ai-assessment-builder/${id}`);
    setRequest(data);
    setDraft(data.draft);
    setStep(statusToStep(data.status));

    if (data.curriculumId) setCurriculumId(data.curriculumId);
    if (data.phaseId) setPhaseId(data.phaseId);
    if (data.gradeId) setGradeId(data.gradeId);
    if (data.subjectId) setSubjectId(data.subjectId);
    if (data.assessmentType) setAssessmentType(data.assessmentType);
    if (data.title) setTitle(data.title);
    if (data.term) setTerm(data.term);
    if (data.totalMarks) setTotalMarks(String(data.totalMarks));
    if (data.durationMinutes) setDurationMinutes(String(data.durationMinutes));
    if (data.difficulty) setDifficulty(data.difficulty);
    if (data.questionTypes?.length) setQuestionTypes(data.questionTypes);
    if (data.bloomLevels?.length) setBloomLevels(data.bloomLevels);
    if (data.instructions) setInstructions(data.instructions);
    if (data.selectedQuestionBankIds?.length) {
      setSelectedBankIds(data.selectedQuestionBankIds);
    }

    const edits: Record<string, string> = {};
    for (const m of data.materials) {
      edits[m.id] = m.manualText ?? m.extractedText ?? "";
    }
    setTextEdits(edits);

    return data;
  }, []);

  useEffect(() => {
    setLoading(true);
    const init = async () => {
      try {
        if (routeRequestId) {
          await loadRequest(routeRequestId);
        } else {
          const created = await apiFetch<AiBuilderRequest>("/ai-assessment-builder", {
            method: "POST",
          });
          setRequest(created);
          navigate(`/ai-assessment-builder/${created.id}`, { replace: true });
        }
        const list = await apiFetch<CurriculumRef[]>("/curriculum");
        setCurriculums(list);
        if (list[0] && !curriculumId) setCurriculumId(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialise builder");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [routeRequestId, loadRequest, navigate, curriculumId]);

  useEffect(() => {
    if (!curriculumId) return;
    apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`)
      .then(setPhases)
      .catch(() => setPhases([]));
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) {
      setGrades([]);
      setSubjects([]);
      return;
    }
    const phaseCode = phaseCodeFromPhases(phases, phaseId);
    loadGradesAndSubjectsForPhase(phaseId, { gradeId: gradeId || undefined, phaseCode })
      .then(({ grades: g, subjects: s }) => {
        setGrades(g);
        setSubjects(s);
      })
      .catch(() => {
        setGrades([]);
        setSubjects([]);
      });
  }, [phaseId, phases, gradeId]);

  const requestId = request?.id ?? routeRequestId;

  async function handleUpload(files: FileList | null) {
    if (!files?.length || !requestId) return;
    setUploading(true);
    setError("");

    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("uploadPurpose", uploadPurpose);
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/ai-assessment-builder/${requestId}/materials/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Upload failed");
        }
      }
      await loadRequest(requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteMaterial(materialId: string) {
    if (!requestId) return;
    setLoading(true);
    try {
      await apiFetch(`/ai-assessment-builder/${requestId}/materials/${materialId}`, {
        method: "DELETE",
      });
      await loadRequest(requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleExtract() {
    if (!requestId) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/ai-assessment-builder/${requestId}/extract`, { method: "POST" });
      await loadRequest(requestId);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveText(materialId: string) {
    if (!requestId) return;
    try {
      await apiFetch(`/ai-assessment-builder/${requestId}/materials/${materialId}/text`, {
        method: "PATCH",
        body: JSON.stringify({ manualText: textEdits[materialId] ?? "" }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save text");
    }
  }

  useEffect(() => {
    if (!requestId) return;
    const hasFramework =
      request?.frameworkText ||
      request?.materials.some((m) => m.uploadPurpose === "ASSESSMENT_FRAMEWORK");
    if (!hasFramework) {
      setBlueprint(null);
      return;
    }
    apiFetch<PaperBlueprint>(`/ai-assessment-builder/${requestId}/blueprint`)
      .then(setBlueprint)
      .catch(() => setBlueprint(null));
  }, [requestId, request?.frameworkText, request?.materials]);

  useEffect(() => {
    const params = new URLSearchParams({ subjectId, forPicker: "true" });
    if (gradeId) params.set("gradeId", gradeId);
    apiFetch<QuestionBankItem[]>(`/question-bank?${params}`)
      .then(setBankItems)
      .catch(() => setBankItems([]));
  }, [subjectId, gradeId]);

  function decisionKey(materialId: string, extractedId: string) {
    return `${materialId}:${extractedId}`;
  }

  function getQuestionDecision(
    materialId: string,
    q: ExtractedPaperQuestion,
    isDuplicate: boolean
  ): { action: "save" | "skip" | "merge"; mergedText?: string } {
    const key = decisionKey(materialId, q.id);
    if (questionDecisions[key]) return questionDecisions[key];
    return { action: isDuplicate ? "skip" : "save" };
  }

  async function handleSaveQuestionsToBank(materialId: string, questions: ExtractedPaperQuestion[]) {
    if (!requestId || !curriculumId || !phaseId || !gradeId || !subjectId) {
      setError("Complete curriculum settings (Step 3) before saving to Question Bank, or fill grade/subject in Settings first.");
      return;
    }
    setSavingQuestions(true);
    setError("");
    try {
      const material = request?.materials.find((m) => m.id === materialId);
      const decisions = questions.map((q) => {
        const isDup = material?.duplicateWarnings?.find((d) => d.extractedId === q.id)?.isDuplicate ?? false;
        const d = getQuestionDecision(materialId, q, isDup);
        return {
          extractedId: q.id,
          action: d.action,
          ...(d.action === "merge" && d.mergedText ? { mergedText: d.mergedText } : {}),
        };
      });
      await apiFetch(`/ai-assessment-builder/${requestId}/materials/${materialId}/save-questions`, {
        method: "POST",
        body: JSON.stringify({
          curriculumId,
          phaseId,
          gradeId,
          subjectId,
          term: term || null,
          decisions,
        }),
      });
      await loadRequest(requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save questions");
    } finally {
      setSavingQuestions(false);
    }
  }

  async function handleSaveSettings() {
    if (!requestId) return;
    setLoading(true);
    setError("");
    try {
      if (selectedBankIds.length > 0) {
        await apiFetch(`/ai-assessment-builder/${requestId}/source`, {
          method: "PATCH",
          body: JSON.stringify({
            sourceMode: uploadPurpose === "PAST_PAPER" ? "MIXED" : "QUESTION_BANK",
            selectedQuestionBankIds: selectedBankIds,
          }),
        });
      }
      await apiFetch(`/ai-assessment-builder/${requestId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          curriculumId,
          phaseId,
          gradeId,
          subjectId,
          assessmentType,
          title,
          term: term || null,
          totalMarks: Number(totalMarks),
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          difficulty,
          questionTypes,
          bloomLevels,
          instructions: instructions || null,
        }),
      });
      await loadRequest(requestId);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!requestId) return;
    setLoading(true);
    setError("");
    try {
      const updated = await apiFetch<AiBuilderRequest>(
        `/ai-assessment-builder/${requestId}/generate`,
        { method: "POST" }
      );
      setRequest(updated);
      setDraft(updated.draft);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!requestId || !draft) return;
    setLoading(true);
    setError("");
    try {
      const updated = await apiFetch<AiBuilderRequest>(
        `/ai-assessment-builder/${requestId}/draft`,
        { method: "PATCH", body: JSON.stringify({ draft }) }
      );
      setRequest(updated);
      setDraft(updated.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!requestId) return;
    setLoading(true);
    setError("");
    try {
      if (draft) {
        await apiFetch(`/ai-assessment-builder/${requestId}/draft`, {
          method: "PATCH",
          body: JSON.stringify({ draft }),
        });
      }
      const result = await apiFetch<{ assessmentId: string }>(
        `/ai-assessment-builder/${requestId}/approve`,
        { method: "POST" }
      );
      await loadRequest(requestId);
      setStep(5);
      navigate(`/assessments/${result.assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(type: "question-paper" | "memorandum" | "rubric") {
    if (!requestId) return;
    try {
      await apiDownloadPath(
        `/ai-assessment-builder/${requestId}/export/${type}`,
        `${title || "assessment"}-${type}.pdf`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function updateQuestion(index: number, patch: Partial<AiGeneratedQuestion>) {
    if (!draft) return;
    const questions = [...draft.questions];
    questions[index] = { ...questions[index], ...patch };
    setDraft({ ...draft, questions });
  }

  function toggleQuestionType(qt: AiQuestionType) {
    setQuestionTypes((prev) =>
      prev.includes(qt) ? prev.filter((t) => t !== qt) : [...prev, qt]
    );
  }

  function toggleBloomLevel(bl: AiBloomLevel) {
    setBloomLevels((prev) =>
      prev.includes(bl) ? prev.filter((b) => b !== bl) : [...prev, bl]
    );
  }

  const step1Valid = (request?.materials.length ?? 0) > 0;
  const step2Valid = request?.materials.some((m) => m.effectiveText?.trim()) ?? false;
  const step3Valid =
    curriculumId && phaseId && gradeId && subjectId && title.trim() &&
    questionTypes.length > 0 && bloomLevels.length > 0 && Number(totalMarks) > 0;

  if (loading && !request) {
    return (
      <div>
        <h1 className="sc-page-title">AI Assessment Builder</h1>
        <p className="sc-page-subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sc-page-title">AI Assessment Builder</h1>
      <p className="sc-page-subtitle">
        Upload study material, extract content, and generate a complete assessment with memo and rubric.
      </p>

      <div className="sc-gen-steps">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`sc-gen-step${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && <p className="sc-error">{error}</p>}

      {step === 0 && (
        <div className="sc-card sc-card-gold">
          <h2>Step 1 — Upload</h2>
          <p className="sc-page-subtitle">Supported: PDF, JPG, PNG, DOCX, TXT (max 25 MB each)</p>

          <div className="ai-checkbox-grid" style={{ marginBottom: "1rem" }}>
            {(
              [
                { value: "STUDY_MATERIAL", label: "Study Material" },
                { value: "PAST_PAPER", label: "Past Paper" },
                { value: "ASSESSMENT_FRAMEWORK", label: "Assessment Framework" },
              ] as { value: AiUploadPurpose; label: string }[]
            ).map((opt) => (
              <label
                key={opt.value}
                className={`ai-checkbox-item${uploadPurpose === opt.value ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="uploadPurpose"
                  checked={uploadPurpose === opt.value}
                  onChange={() => setUploadPurpose(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div
            className="ai-upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.txt,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              multiple
              hidden
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <p>{uploading ? "Uploading…" : "Click to upload files"}</p>
          </div>

          {request?.materials.length ? (
            <div className="ai-material-list">
              {request.materials.map((m) => (
                <div key={m.id} className="ai-material-item">
                  <div>
                    <strong>{m.fileName}</strong>
                    <div className="ai-material-meta">
                      {m.uploadPurpose?.replaceAll("_", " ") ?? "STUDY MATERIAL"} · {m.fileType} · {(m.fileSize / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sc-btn sc-btn-ghost"
                    onClick={() => void handleDeleteMaterial(m.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="marks-step-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!step1Valid || uploading}
              onClick={() => setStep(1)}
            >
              Next — Extract Content
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="sc-card sc-card-gold">
          <h2>Step 2 — Extract Content</h2>
          <p className="sc-page-subtitle">
            Extract text from uploaded files using OCR (JPG, PNG, JPEG, scanned PDF). Review and correct text if needed.
          </p>

          {request?.materials.map((m) => (
            <div key={m.id} className="ai-material-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{m.fileName}</strong>
                <span
                  className={`ai-extraction-badge ${
                    m.extractionStatus === "EXTRACTED"
                      ? "is-extracted"
                      : m.extractionStatus === "MANUAL_REQUIRED"
                        ? "is-manual"
                        : "is-pending"
                  }`}
                >
                  {m.extractionStatus.replaceAll("_", " ")}
                </span>
              </div>
              {m.ocrConfidence != null && (
                <div className="ai-material-meta">
                  OCR confidence: {m.ocrConfidence.toFixed(0)}%
                  {m.ocrConfidence < 55 ? " — please review text below" : ""}
                </div>
              )}
              {(m.extractionStatus !== "PENDING" || m.effectiveText) && (
                <textarea
                  className="sc-input ai-text-editor"
                  value={textEdits[m.id] ?? ""}
                  onChange={(e) => setTextEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onBlur={() => void handleSaveText(m.id)}
                  placeholder="Extracted or manually entered text…"
                />
              )}

              {m.uploadPurpose === "PAST_PAPER" && m.extractedQuestions?.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <strong>Detected questions ({m.extractedQuestions.length})</strong>
                  {m.duplicateWarnings?.some((d) => d.isDuplicate) && (
                    <p className="sc-error" style={{ fontSize: "0.82rem" }}>
                      Duplicate warnings — similar questions exist in the Question Bank
                    </p>
                  )}
                  <div className="ai-material-list">
                    {m.extractedQuestions.map((q) => {
                      const dup = m.duplicateWarnings?.find((d) => d.extractedId === q.id);
                      const decision = getQuestionDecision(m.id, q, dup?.isDuplicate ?? false);
                      const dKey = decisionKey(m.id, q.id);
                      return (
                        <div key={q.id} className="ai-material-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <div>
                            <strong>Q{q.questionNumber}</strong> ({q.marks}m) — {q.questionType.replaceAll("_", " ")}
                            {dup?.isDuplicate && (
                              <span className="ai-extraction-badge is-manual" style={{ marginLeft: "0.5rem" }}>
                                Possible duplicate
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{q.questionText}</div>
                          {q.memoAnswer && (
                            <div className="ai-material-meta">Memo: {q.memoAnswer}</div>
                          )}
                          {dup?.isDuplicate && (
                            <div style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
                              <div className="ai-material-meta">
                                Similar: {dup.matches[0]?.existingQuestionText.slice(0, 60)}…
                                ({Math.round((dup.matches[0]?.similarity ?? 0) * 100)}%)
                              </div>
                              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                                {(["save", "skip", "merge"] as const).map((action) => (
                                  <label key={action} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                    <input
                                      type="radio"
                                      name={`dup-${dKey}`}
                                      checked={decision.action === action}
                                      onChange={() =>
                                        setQuestionDecisions((prev) => ({
                                          ...prev,
                                          [dKey]: { action, mergedText: prev[dKey]?.mergedText ?? q.questionText },
                                        }))
                                      }
                                    />
                                    {action === "save" ? "Save anyway" : action === "skip" ? "Skip" : "Merge/edit"}
                                  </label>
                                ))}
                              </div>
                              {decision.action === "merge" && (
                                <textarea
                                  className="sc-input"
                                  rows={2}
                                  style={{ marginTop: "0.35rem", fontSize: "0.82rem" }}
                                  value={decision.mergedText ?? q.questionText}
                                  onChange={(e) =>
                                    setQuestionDecisions((prev) => ({
                                      ...prev,
                                      [dKey]: { action: "merge", mergedText: e.target.value },
                                    }))
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {(!curriculumId || !phaseId || !gradeId || !subjectId) && (
                    <div className="sc-form-grid-2" style={{ marginTop: "0.75rem" }}>
                      <label className="sc-label">
                        Curriculum
                        <select className="sc-select" value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
                          <option value="">Select…</option>
                          {curriculums.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="sc-label">
                        Phase
                        <select className="sc-select" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                          <option value="">Select…</option>
                          {phases.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="sc-label">
                        Grade
                        <select className="sc-select" value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                          <option value="">Select…</option>
                          {grades.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="sc-label">
                        Subject
                        <select className="sc-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                          <option value="">Select…</option>
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="sc-label">
                        Term (optional)
                        <input className="sc-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Term 2" />
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="sc-btn sc-btn-primary"
                    style={{ marginTop: "0.5rem" }}
                    disabled={savingQuestions || !curriculumId || !phaseId || !gradeId || !subjectId}
                    onClick={() => void handleSaveQuestionsToBank(m.id, m.extractedQuestions)}
                  >
                    {savingQuestions ? "Saving…" : "Save to Question Bank"}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="marks-step-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading}
              onClick={() => void handleExtract()}
            >
              {loading ? "Extracting…" : "Extract Content"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!step2Valid}
              onClick={() => setStep(2)}
            >
              Next — Settings
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sc-card sc-card-gold sc-form-grid">
          <h2>Step 3 — Assessment Settings</h2>

          <div className="sc-form-grid-2">
            <label className="sc-label">
              Curriculum
              <select className="sc-select" value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
                {curriculums.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="sc-label">
              Phase
              <select className="sc-select" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">Select phase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="sc-label">
              Grade
              <select className="sc-select" value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                <option value="">Select grade</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="sc-label">
              Subject
              <select className="sc-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!phaseId}>
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` (${s.category.toLowerCase()})` : ""}
                  </option>
                ))}
              </select>
              {phaseId && subjects.length === 0 && (
                <span className="sc-error" style={{ fontSize: "0.8rem" }}>Loading subjects…</span>
              )}
            </label>
          </div>

          <div className="sc-form-grid-2">
            <label className="sc-label">
              Assessment Name
              <input className="sc-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="sc-label">
              Term
              <input className="sc-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Term 1" />
            </label>
            <label className="sc-label">
              Total Marks
              <input className="sc-input" type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
            </label>
            <label className="sc-label">
              Duration (minutes)
              <input className="sc-input" type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </label>
            <label className="sc-label">
              Assessment Type
              <select className="sc-select" value={assessmentType} onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}>
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="sc-label">
              Difficulty
              <select className="sc-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value as AiBuilderDifficulty)}>
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="sc-label">Question Types</span>
            <div className="ai-checkbox-grid">
              {QUESTION_TYPES.map((qt) => (
                <label
                  key={qt.value}
                  className={`ai-checkbox-item${questionTypes.includes(qt.value) ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={questionTypes.includes(qt.value)}
                    onChange={() => toggleQuestionType(qt.value)}
                  />
                  {qt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="sc-label">Bloom Levels</span>
            <div className="ai-checkbox-grid">
              {BLOOM_LEVELS.map((bl) => (
                <label
                  key={bl.value}
                  className={`ai-checkbox-item${bloomLevels.includes(bl.value) ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={bloomLevels.includes(bl.value)}
                    onChange={() => toggleBloomLevel(bl.value)}
                  />
                  {bl.label}
                </label>
              ))}
            </div>
          </div>

          <label className="sc-label">
            Instructions (optional)
            <textarea className="sc-input" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>

          {bankItems.length > 0 && (
            <div>
              <span className="sc-label">Reuse Question Bank items (optional)</span>
              <div className="ai-material-list">
                {bankItems.slice(0, 20).map((item) => (
                  <label key={item.id} className="ai-checkbox-item" style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedBankIds.includes(item.id)}
                      onChange={() =>
                        setSelectedBankIds((prev) =>
                          prev.includes(item.id)
                            ? prev.filter((id) => id !== item.id)
                            : [...prev, item.id]
                        )
                      }
                    />
                    <span style={{ fontSize: "0.85rem" }}>
                      ({item.marks}m) {item.questionText.slice(0, 80)}
                      {item.questionText.length > 80 ? "…" : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="marks-step-actions">
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!step3Valid || loading}
              onClick={() => void handleSaveSettings()}
            >
              {loading ? "Saving…" : "Save & Continue"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sc-card sc-card-gold">
          <h2>Step 4 — Generate Assessment</h2>
          <p className="sc-page-subtitle">
            {blueprint
              ? `Framework enforced: ${blueprint.name} (${blueprint.totalMarks} marks, ${blueprint.slots.length} question slots). AI fills content only.`
              : "Generate questions, memo, and rubric from your study material."}
          </p>

          {blueprint && (
            <div className="ai-material-list" style={{ marginBottom: "1rem" }}>
              {blueprint.slots.slice(0, 8).map((slot) => (
                <div key={slot.questionNumber} className="ai-material-meta">
                  {slot.section} Q{slot.questionNumber} — {slot.label} ({slot.marks}m)
                </div>
              ))}
              {blueprint.slots.length > 8 && (
                <div className="ai-material-meta">…and {blueprint.slots.length - 8} more slots</div>
              )}
            </div>
          )}

          <div className="sc-gen-summary-grid">
            <div className="sc-gen-summary-item">
              <div className="sc-gen-summary-value">{request?.materials.length ?? 0}</div>
              <div className="sc-gen-summary-label">Materials</div>
            </div>
            <div className="sc-gen-summary-item">
              <div className="sc-gen-summary-value">{totalMarks}</div>
              <div className="sc-gen-summary-label">Total Marks</div>
            </div>
            <div className="sc-gen-summary-item">
              <div className="sc-gen-summary-value">{questionTypes.length}</div>
              <div className="sc-gen-summary-label">Question Types</div>
            </div>
          </div>

          <div className="marks-step-actions">
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading}
              onClick={() => void handleGenerate()}
            >
              {loading ? "Generating…" : "Generate Assessment"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && draft && (
        <div className="sc-card sc-card-gold">
          <h2>Step 5 — Review & Edit</h2>

          {request?.qualityChecks && (
            <div className="ai-quality-issues">
              <strong>
                Validation: {request.qualityChecks.passed ? "Passed" : "Issues Found"}
              </strong>
              {request.qualityChecks.blueprint && (
                <p className="ai-material-meta" style={{ marginTop: "0.35rem" }}>
                  Framework: {request.qualityChecks.blueprint.name} —{" "}
                  {request.qualityChecks.blueprint.slots.length} slots,{" "}
                  {request.qualityChecks.blueprint.totalMarks} marks
                </p>
              )}
              {request.qualityChecks.issues.map((issue, i) => (
                <div
                  key={i}
                  className={`ai-quality-issue is-${issue.severity}`}
                >
                  {issue.message}
                </div>
              ))}
            </div>
          )}

          <label className="sc-label">
            Instructions
            <textarea
              className="sc-input"
              rows={2}
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            />
          </label>

          {draft.questions.map((q, i) => (
            <div key={q.questionNumber} className="ai-question-editor">
              <div className="sc-form-grid-2">
                <label className="sc-label">
                  Q{q.questionNumber} Marks
                  <input
                    className="sc-input"
                    type="number"
                    min={1}
                    value={q.marks}
                    onChange={(e) => updateQuestion(i, { marks: Number(e.target.value) })}
                  />
                </label>
                <label className="sc-label">
                  Bloom Level
                  <select
                    className="sc-select"
                    value={q.bloomLevel}
                    onChange={(e) => updateQuestion(i, { bloomLevel: e.target.value as AiBloomLevel })}
                  >
                    {BLOOM_LEVELS.map((bl) => (
                      <option key={bl.value} value={bl.value}>{bl.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="sc-label">
                Question Text
                <textarea
                  className="sc-input"
                  rows={2}
                  value={q.questionText}
                  onChange={(e) => updateQuestion(i, { questionText: e.target.value })}
                />
              </label>
              <label className="sc-label">
                Memo Answer
                <textarea
                  className="sc-input"
                  rows={2}
                  value={q.memoAnswer}
                  onChange={(e) => updateQuestion(i, { memoAnswer: e.target.value })}
                />
              </label>
              {q.rubric?.criteria?.length ? (
                <div>
                  <span className="sc-label">Rubric Criteria</span>
                  {q.rubric.criteria.map((c, ci) => (
                    <div key={ci} style={{ marginBottom: "0.5rem" }}>
                      <input
                        className="sc-input"
                        value={c.name}
                        onChange={(e) => {
                          const criteria = [...q.rubric!.criteria];
                          criteria[ci] = { ...c, name: e.target.value };
                          updateQuestion(i, { rubric: { criteria } });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <div className="ai-export-actions">
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => void handleExport("question-paper")}>
              Export Question Paper
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => void handleExport("memorandum")}>
              Export Memorandum
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => void handleExport("rubric")}>
              Export Rubric
            </button>
          </div>

          <div className="marks-step-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button type="button" className="sc-btn sc-btn-ghost" disabled={loading} onClick={() => void handleSaveDraft()}>
              Save Edits
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading || request?.qualityChecks?.passed === false}
              onClick={() => setStep(5)}
            >
              Continue to Approve
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="sc-card sc-card-gold">
          <h2>Step 6 — Approve & Create Assessment</h2>
          <p className="sc-page-subtitle">
            Approve to create the assessment, questions, memo, rubric template, and Paper Vault drafts.
          </p>

          {request?.assessmentId ? (
            <p>
              Assessment created.{" "}
              <a href={`/assessments/${request.assessmentId}`}>View assessment →</a>
            </p>
          ) : (
            <div className="marks-step-actions">
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(4)}>Back</button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={loading}
                onClick={() => void handleApprove()}
              >
                {loading ? "Creating…" : "Approve & Create Assessment"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
