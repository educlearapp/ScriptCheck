import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import FileDropzone from "../../components/marking/FileDropzone";
import MarkingCurriculumFields, {
  markingCurriculumReady,
} from "../../components/marking/MarkingCurriculumFields";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import {
  bulkUploadScripts,
  createMarkingPack,
  getMarkingWorkbench,
  listMarkingJobs,
  prepareMarkingJob,
  resplitLearnerAnswers,
  updateSetup,
  uploadMasterFile,
  type MarkingJobListItem,
  type MarkingWorkbenchState,
  type ScriptFormat,
  type ScriptVerificationResult,
} from "../../services/assessmentSetupApi";
import { formatStatusLabel } from "../../utils/statusLabels";
import "../dashboard/Dashboard.css";
import "./MarkingOverview.css";

const MEMO_NOTE =
  "Optional. If omitted, a proposed memo can be generated in a later phase before AI marking runs.";

const QP_NOTE =
  "Optional unless no memo is uploaded and answers must be generated from the paper.";

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function workflowStageLabel(stage: string): string {
  switch (stage) {
    case "CREATE_JOB":
      return "Create job";
    case "UPLOADS":
      return "Uploads";
    case "AI_PROCESSING":
      return "AI processing";
    case "REVIEW":
      return "Review";
    case "RESULTS":
      return "Results";
    default:
      return formatStatusLabel(stage);
  }
}

function scriptFormatLabel(format: ScriptFormat): string {
  return format === "ON_QUESTION_PAPER"
    ? "Answers on question paper"
    : "Separate answer sheets";
}

function resultStatusLabel(script: { status: string; finalTotal: number | null }): string {
  if (script.finalTotal != null && script.finalTotal > 0) return "Marked";
  if (script.status === "MARKED" || script.status === "IN_PROGRESS") return "Needs review";
  if (script.status === "FINALISED" || script.status.includes("APPROVED")) return "Finalised";
  return "Uploaded";
}

function ScriptSplitSummary({
  verification,
  pagesDraft,
  onPagesDraftChange,
  onResplit,
  resplitting,
}: {
  verification: ScriptVerificationResult;
  pagesDraft: string;
  onPagesDraftChange: (value: string) => void;
  onResplit: () => void;
  resplitting: boolean;
}) {
  const parsedPages = parsePositiveInt(pagesDraft);
  const savedPages = verification.expectedPagesPerScript;
  const pagesChanged = parsedPages != null && savedPages != null && parsedPages !== savedPages;

  return (
    <div className="sc-marking-split-summary">
      <div className="sc-grid-3 sc-marking-split-stats">
        <div className="sc-card" style={{ padding: "0.85rem" }}>
          <div className="sc-detail-label">Pages uploaded</div>
          <div className="sc-stat-value">{verification.totalPagesUploaded}</div>
        </div>
        <div className="sc-card" style={{ padding: "0.85rem" }}>
          <div className="sc-detail-label">Detected scripts</div>
          <div className="sc-stat-value">{verification.detectedScriptCount}</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "0.85rem" }}>
          <div className="sc-detail-label">Complete scripts</div>
          <div className="sc-stat-value">{verification.completeScripts}</div>
        </div>
      </div>

      <div className="sc-marking-pages-row">
        <label className="sc-marking-field" htmlFor="wb-pages-per-script">
          Pages per learner script
          <input
            id="wb-pages-per-script"
            className="sc-input"
            type="number"
            min={1}
            inputMode="numeric"
            value={pagesDraft}
            onChange={(e) => onPagesDraftChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="sc-btn sc-btn-secondary"
          disabled={resplitting || !pagesChanged || parsedPages == null}
          onClick={onResplit}
        >
          {resplitting ? "Recalculating…" : "Recalculate split"}
        </button>
      </div>

      {verification.incompleteScripts > 0 ? (
        <p className="sc-marking-memo-note sc-error">
          {verification.incompleteScripts} script(s) appear incomplete — adjust pages per script and
          recalculate if needed.
        </p>
      ) : null}
    </div>
  );
}

function WorkflowStep({
  title,
  status,
  children,
}: {
  title: string;
  status: "pending" | "active" | "complete" | "blocked";
  children: React.ReactNode;
}) {
  return (
    <section className={`sc-marking-workflow-step is-${status}`}>
      <header className="sc-marking-workflow-step-header">
        <span className="sc-marking-workflow-step-badge">{title}</span>
      </header>
      <div className="sc-marking-workflow-step-body">{children}</div>
    </section>
  );
}

export default function MarkingWorkbench() {
  const [recentJobs, setRecentJobs] = useState<MarkingJobListItem[]>([]);
  const [workbench, setWorkbench] = useState<MarkingWorkbenchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [assessmentName, setAssessmentName] = useState("");
  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [questionCount, setQuestionCount] = useState("");
  const [pagesInput, setPagesInput] = useState("");
  const [scriptFormat, setScriptFormat] = useState<ScriptFormat>("ANSWER_SHEET");

  const [scriptFiles, setScriptFiles] = useState<File[]>([]);
  const [scriptDrag, setScriptDrag] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingScripts, setUploadingScripts] = useState(false);
  const [uploadingPaper, setUploadingPaper] = useState(false);
  const [uploadingMemo, setUploadingMemo] = useState(false);
  const [uploadingRubric, setUploadingRubric] = useState(false);
  const [resplitting, setResplitting] = useState(false);
  const [pagesDraft, setPagesDraft] = useState("");
  const [preparing, setPreparing] = useState(false);

  const scriptFileRef = useRef<HTMLInputElement>(null);
  const paperRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const rubricRef = useRef<HTMLInputElement>(null);

  const curriculumReady = markingCurriculumReady(curriculumId, phaseId, gradeId, subjectId);
  const parsedPages = parsePositiveInt(pagesInput);
  const parsedMarks = parsePositiveInt(totalMarks);
  const parsedQuestions = parsePositiveInt(questionCount);

  const jobFormValid =
    assessmentName.trim().length > 0 &&
    curriculumReady &&
    term.trim().length > 0 &&
    parsedPages != null &&
    parsedMarks != null &&
    parsedQuestions != null;

  const activeBatchId = workbench?.batchId ?? null;

  const loadRecentJobs = useCallback(async () => {
    const data = await listMarkingJobs().catch(() => ({ items: [] as MarkingJobListItem[] }));
    setRecentJobs(data.items);
  }, []);

  const loadWorkbench = useCallback(async (batchId: string) => {
    const state = await getMarkingWorkbench(batchId);
    setWorkbench(state);
    setAssessmentName(state.title);
    setCurriculumId(state.curriculumId);
    setPhaseId(state.phaseId);
    setGradeId(state.grade.id);
    setSubjectId(state.subject.id);
    setTerm(state.term ?? "");
    setTotalMarks(String(state.totalMarks));
    setQuestionCount(state.questionCount != null ? String(state.questionCount) : "");
    setPagesInput(state.pagesPerScript != null ? String(state.pagesPerScript) : "");
    setScriptFormat(state.scriptFormat);
    if (state.verification) {
      setPagesDraft(String(state.verification.expectedPagesPerScript));
    }
  }, []);

  useEffect(() => {
    void loadRecentJobs().finally(() => setLoading(false));
  }, [loadRecentJobs]);

  const pickFiles = (incoming: FileList | File[], setter: (files: File[]) => void) => {
    const list = Array.from(incoming);
    if (list.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setError("");
    setter(list);
  };

  const handleCreateJob = async () => {
    if (!jobFormValid) {
      setError("Complete all required job fields before creating the marking job.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const pack = await createMarkingPack({
        title: assessmentName.trim(),
        curriculumId,
        phaseId,
        gradeId,
        subjectId,
        term: term.trim(),
        pagesPerScript: parsedPages ?? undefined,
        totalMarks: parsedMarks ?? undefined,
        questionCount: parsedQuestions ?? undefined,
        scriptFormat,
      });
      await updateSetup(pack.assessmentId, {
        term: term.trim(),
        totalMarks: parsedMarks!,
        questionCount: parsedQuestions!,
        pagesPerScript: parsedPages!,
      });
      await loadWorkbench(pack.batchId);
      await loadRecentJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create marking job");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadScripts = async () => {
    if (!activeBatchId || scriptFiles.length === 0) return;
    if (scriptFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setUploadingScripts(true);
    setError("");
    try {
      const result = await bulkUploadScripts(activeBatchId, scriptFiles, setUploadProgress);
      setScriptFiles([]);
      setPagesDraft(String(result.verification.expectedPagesPerScript));
      await loadWorkbench(activeBatchId);
      await loadRecentJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Script upload failed");
    } finally {
      setUploadingScripts(false);
      setUploadProgress(0);
    }
  };

  const handleUploadMaster = async (
    kind: "questionPaper" | "memorandum" | "rubric",
    file: File,
    setUploading: (v: boolean) => void,
    ref: React.RefObject<HTMLInputElement | null>
  ) => {
    if (!workbench?.assessmentId) {
      setError("Create a marking job first.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await uploadMasterFile(workbench.assessmentId, kind, file);
      if (kind !== "questionPaper") {
        await updateSetup(workbench.assessmentId, {
          [kind === "memorandum" ? "memorandumAvailable" : "rubricAvailable"]: true,
        });
      }
      await loadWorkbench(workbench.batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const handleResplit = async () => {
    if (!activeBatchId) return;
    const parsed = parsePositiveInt(pagesDraft);
    if (parsed == null) {
      setError("Enter a valid pages-per-script value.");
      return;
    }
    setResplitting(true);
    setError("");
    try {
      await resplitLearnerAnswers(activeBatchId, parsed);
      await loadWorkbench(activeBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate split");
    } finally {
      setResplitting(false);
    }
  };

  const handlePrepareJob = async () => {
    if (!activeBatchId) return;
    setPreparing(true);
    setError("");
    try {
      const state = await prepareMarkingJob(activeBatchId);
      setWorkbench(state);
      await loadRecentJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare marking job");
    } finally {
      setPreparing(false);
    }
  };

  const resumeJob = async (batchId: string) => {
    setBusy(true);
    setError("");
    try {
      await loadWorkbench(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marking job");
    } finally {
      setBusy(false);
    }
  };

  const startNewJob = () => {
    setWorkbench(null);
    setAssessmentName("");
    setCurriculumId("");
    setPhaseId("");
    setGradeId("");
    setSubjectId("");
    setTerm("");
    setTotalMarks("");
    setQuestionCount("");
    setPagesInput("");
    setScriptFormat("ANSWER_SHEET");
    setScriptFiles([]);
    setPagesDraft("");
    setError("");
    setCurriculumError(null);
  };

  const workflowSteps = useMemo(() => {
    if (!workbench) {
      return {
        create: "active" as const,
        uploads: "pending" as const,
        ai: "pending" as const,
        review: "pending" as const,
        results: "pending" as const,
      };
    }
    const stage = workbench.workflowStage;
    const uploadsDone =
      workbench.uploads.learnerScripts && workbench.uploads.scriptCount > 0;
    return {
      create: "complete" as const,
      uploads: uploadsDone ? ("complete" as const) : ("active" as const),
      ai:
        stage === "AI_PROCESSING"
          ? ("active" as const)
          : ["REVIEW", "RESULTS"].includes(stage)
            ? ("complete" as const)
            : uploadsDone
              ? ("blocked" as const)
              : ("pending" as const),
      review: ["REVIEW", "RESULTS"].includes(stage)
        ? ("active" as const)
        : stage === "AI_PROCESSING"
          ? ("pending" as const)
          : ("pending" as const),
      results: stage === "RESULTS" ? ("active" as const) : ("pending" as const),
    };
  }, [workbench]);

  const canPrepare =
    workbench != null &&
    workbench.uploads.learnerScripts &&
    workbench.uploads.scriptCount > 0 &&
    workbench.pagesPerScript != null &&
    workbench.pagesPerScript > 0;

  if (loading) {
    return (
      <div className="sc-dash sc-marking-page" data-page="marking-workbench">
        <p>Loading marking workbench…</p>
      </div>
    );
  }

  return (
    <div className="sc-dash sc-marking-page" data-page="marking-workbench">
      <header className="sc-marking-page-header">
        <div className="sc-marking-page-header-row">
          <div>
            <h1 className="sc-page-title">AI Marking Workbench</h1>
            <p className="sc-page-subtitle">
              Upload learner scripts, prepare a marking job, and review results. Automated AI marking
              is not available in this release — this workbench prepares the job only.
            </p>
          </div>
          {workbench ? (
            <button type="button" className="sc-btn sc-btn-ghost" onClick={startNewJob}>
              New job
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-marking-workbench-layout">
        <div className="sc-marking-workbench-main">
          <WorkflowStep title="1 · Create marking job" status={workflowSteps.create}>
            <div className="sc-marking-workbench-card">
              <label className="sc-marking-field">
                Assessment name
                <input
                  className="sc-input"
                  value={assessmentName}
                  placeholder="e.g. Term 2 Mathematics Test"
                  disabled={busy}
                  onChange={(e) => setAssessmentName(e.target.value)}
                />
              </label>

              {curriculumError ? (
                <p className="sc-error sc-marking-curriculum-error">{curriculumError}</p>
              ) : null}

              <MarkingCurriculumFields
                curriculumId={curriculumId}
                phaseId={phaseId}
                gradeId={gradeId}
                subjectId={subjectId}
                onCurriculumIdChange={(id) => {
                  setCurriculumId(id);
                  setPhaseId("");
                  setGradeId("");
                  setSubjectId("");
                }}
                onPhaseIdChange={(id) => {
                  setPhaseId(id);
                  setGradeId("");
                  setSubjectId("");
                }}
                onGradeIdChange={setGradeId}
                onSubjectIdChange={setSubjectId}
                onCurriculumError={setCurriculumError}
                disabled={busy}
              />

              <div className="sc-marking-details-grid">
                <label className="sc-marking-field">
                  Term
                  <input
                    className="sc-input"
                    value={term}
                    placeholder="e.g. Term 2"
                    disabled={busy}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </label>
                <label className="sc-marking-field">
                  Total marks
                  <input
                    className="sc-input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={totalMarks}
                    placeholder="e.g. 50"
                    disabled={busy}
                    onChange={(e) => setTotalMarks(e.target.value)}
                  />
                </label>
                <label className="sc-marking-field">
                  Number of questions
                  <input
                    className="sc-input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={questionCount}
                    placeholder="e.g. 10"
                    disabled={busy}
                    onChange={(e) => setQuestionCount(e.target.value)}
                  />
                </label>
                <label className="sc-marking-field">
                  Pages per learner script
                  <input
                    className="sc-input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={pagesInput}
                    placeholder="e.g. 4"
                    disabled={busy}
                    onChange={(e) => setPagesInput(e.target.value)}
                  />
                </label>
              </div>

              <fieldset className="sc-marking-script-format">
                <legend className="sc-marking-field">Script format</legend>
                <label className="sc-marking-radio">
                  <input
                    type="radio"
                    name="scriptFormat"
                    checked={scriptFormat === "ANSWER_SHEET"}
                    disabled={busy}
                    onChange={() => setScriptFormat("ANSWER_SHEET")}
                  />
                  Separate answer sheets / booklets
                </label>
                <label className="sc-marking-radio">
                  <input
                    type="radio"
                    name="scriptFormat"
                    checked={scriptFormat === "ON_QUESTION_PAPER"}
                    disabled={busy}
                    onChange={() => setScriptFormat("ON_QUESTION_PAPER")}
                  />
                  Learners wrote on the question paper itself
                </label>
              </fieldset>

              {!workbench ? (
                <button
                  type="button"
                  className="sc-btn sc-btn-primary"
                  disabled={busy || !jobFormValid}
                  onClick={() => void handleCreateJob()}
                >
                  {busy ? "Creating…" : "Create marking job"}
                </button>
              ) : (
                <p className="sc-marking-hint">
                  Job created · Batch {workbench.batchId.slice(0, 8)}… ·{" "}
                  {scriptFormatLabel(workbench.scriptFormat)}
                </p>
              )}
            </div>
          </WorkflowStep>

          <WorkflowStep
            title="2 · Upload materials"
            status={workbench ? workflowSteps.uploads : "pending"}
          >
            <div className="sc-marking-workbench-card">
              {!workbench ? (
                <p className="sc-marking-hint">Create a marking job to enable uploads.</p>
              ) : (
                <>
                  <div className="sc-marking-upload-card sc-marking-question-paper-panel">
                    <h3 className="sc-marking-section-title">
                      Question paper{" "}
                      <span className="sc-marking-optional-tag">optional</span>
                    </h3>
                    <p className="sc-marking-memo-note">{QP_NOTE}</p>
                    <div className="sc-marking-card-actions">
                      <button
                        type="button"
                        className="sc-btn sc-btn-secondary"
                        disabled={uploadingPaper || busy}
                        onClick={() => paperRef.current?.click()}
                      >
                        {uploadingPaper
                          ? "Uploading…"
                          : workbench.uploads.questionPaper
                            ? "Replace question paper"
                            : "Upload question paper"}
                      </button>
                      {workbench.uploads.questionPaper ? (
                        <span className="sc-badge sc-badge-success">Uploaded</span>
                      ) : null}
                    </div>
                    <input
                      ref={paperRef}
                      type="file"
                      className="sc-marking-file-input-hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadMaster("questionPaper", file, setUploadingPaper, paperRef);
                      }}
                    />
                  </div>

                  <div className="sc-marking-upload-card">
                    <h3 className="sc-marking-section-title">
                      Memo / rubric{" "}
                      <span className="sc-marking-optional-tag">optional</span>
                    </h3>
                    <p className="sc-marking-memo-note">{MEMO_NOTE}</p>
                    <div className="sc-marking-card-actions">
                      <button
                        type="button"
                        className="sc-btn sc-btn-ghost"
                        disabled={uploadingMemo || busy}
                        onClick={() => memoRef.current?.click()}
                      >
                        {uploadingMemo
                          ? "Uploading…"
                          : workbench.uploads.memorandum
                            ? "Replace memorandum"
                            : "Upload memorandum"}
                      </button>
                      <button
                        type="button"
                        className="sc-btn sc-btn-ghost"
                        disabled={uploadingRubric || busy}
                        onClick={() => rubricRef.current?.click()}
                      >
                        {uploadingRubric
                          ? "Uploading…"
                          : workbench.uploads.rubric
                            ? "Replace rubric"
                            : "Upload rubric"}
                      </button>
                      {workbench.uploads.memorandum ? (
                        <span className="sc-badge sc-badge-success">Memo</span>
                      ) : null}
                      {workbench.uploads.rubric ? (
                        <span className="sc-badge sc-badge-success">Rubric</span>
                      ) : null}
                    </div>
                    <input
                      ref={memoRef}
                      type="file"
                      className="sc-marking-file-input-hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadMaster("memorandum", file, setUploadingMemo, memoRef);
                      }}
                    />
                    <input
                      ref={rubricRef}
                      type="file"
                      className="sc-marking-file-input-hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadMaster("rubric", file, setUploadingRubric, rubricRef);
                      }}
                    />
                  </div>

                  <div className="sc-marking-upload-card sc-marking-required-panel">
                    <h3 className="sc-marking-section-title">
                      Learner scripts <span className="sc-marking-required-tag">required</span>
                    </h3>
                    <p className="sc-marking-hint">
                      Upload scanned learner papers (single or bulk). Supports separate answer sheets
                      and scripts where learners wrote on the question paper.
                    </p>
                    <FileDropzone
                      label="Drag & drop learner script scans here"
                      filesCount={scriptFiles.length}
                      dragOver={scriptDrag}
                      disabled={busy}
                      onPick={() => scriptFileRef.current?.click()}
                      onDragOver={() => setScriptDrag(true)}
                      onDragLeave={() => setScriptDrag(false)}
                      onDrop={(e) => {
                        setScriptDrag(false);
                        if (e.dataTransfer.files.length) {
                          pickFiles(e.dataTransfer.files, setScriptFiles);
                        }
                      }}
                    />
                    <input
                      ref={scriptFileRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.length) pickFiles(e.target.files, setScriptFiles);
                      }}
                    />
                    {uploadProgress > 0 ? (
                      <div className="sc-setup-progress">
                        <div
                          className="sc-setup-progress-bar"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="sc-btn sc-btn-primary"
                      disabled={
                        uploadingScripts ||
                        busy ||
                        scriptFiles.length === 0
                      }
                      onClick={() => void handleUploadScripts()}
                    >
                      {uploadingScripts ? "Uploading…" : "Upload learner scripts"}
                    </button>
                    {workbench.uploads.learnerScripts ? (
                      <p className="sc-marking-hint">
                        <strong>{workbench.uploads.scriptCount}</strong> learner script(s) in this job.
                      </p>
                    ) : null}
                  </div>

                  {workbench.verification ? (
                    <ScriptSplitSummary
                      verification={workbench.verification}
                      pagesDraft={pagesDraft}
                      onPagesDraftChange={setPagesDraft}
                      onResplit={() => void handleResplit()}
                      resplitting={resplitting}
                    />
                  ) : null}

                  {canPrepare ? (
                    <div className="sc-marking-prepare-panel">
                      <p className="sc-marking-hint">
                        Confirm script split and prepare this job for marking. This does{" "}
                        <strong>not</strong> run AI marking — that will be available in a later release.
                      </p>
                      {workbench.prepareBlockers.length > 0 ? (
                        <ul className="sc-marking-blocker-list">
                          {workbench.prepareBlockers.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        className="sc-btn sc-btn-primary"
                        disabled={preparing || busy}
                        onClick={() => void handlePrepareJob()}
                      >
                        {preparing
                          ? "Preparing…"
                          : "Confirm scripts & prepare job (no AI marking yet)"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </WorkflowStep>

          <WorkflowStep title="3 · AI processing" status={workflowSteps.ai}>
            <div className="sc-marking-workbench-card">
              <p className="sc-marking-ai-notice">
                Automated AI marking (OCR, answer detection, mark allocation) is{" "}
                <strong>not implemented</strong> in this release. When available, this step will process
                all uploaded scripts against the memo or rubric.
              </p>
              {workbench ? (
                <dl className="sc-marking-details-list">
                  <div>
                    <dt>Job status</dt>
                    <dd>{formatStatusLabel(workbench.batchStatus)}</dd>
                  </div>
                  <div>
                    <dt>Scripts ready</dt>
                    <dd>{workbench.uploads.scriptCount}</dd>
                  </div>
                  <div>
                    <dt>Memo answers ready</dt>
                    <dd>{workbench.memoAnswersReady ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>AI marking</dt>
                    <dd>Not available (Phase 0)</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </WorkflowStep>

          <WorkflowStep title="4 · Review" status={workflowSteps.review}>
            <div className="sc-marking-workbench-card">
              {!workbench || workbench.scripts.length === 0 ? (
                <p className="sc-marking-hint">
                  Upload and prepare learner scripts to review marked papers here.
                </p>
              ) : (
                <>
                  <p className="sc-marking-hint">
                    Open individual learner scripts to view scans and enter or adjust marks manually
                    until AI marking is available.
                  </p>
                  <div className="sc-table-wrap">
                    <table className="sc-table">
                      <thead>
                        <tr>
                          <th>Script</th>
                          <th>Learner</th>
                          <th>Pages</th>
                          <th>Mark</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {workbench.scripts.map((s) => (
                          <tr key={s.id}>
                            <td>{s.scriptNumber}</td>
                            <td>{s.learnerName}</td>
                            <td>{s.pageCount}</td>
                            <td>
                              {s.finalTotal != null
                                ? `${s.finalTotal} / ${workbench.totalMarks}`
                                : "—"}
                            </td>
                            <td>
                              <span className="sc-badge sc-badge-muted">
                                {resultStatusLabel(s)}
                              </span>
                            </td>
                            <td>
                              <Link to={`/scripts/${s.id}`} className="sc-btn sc-btn-ghost sc-marking-table-btn">
                                Review
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sc-marking-card-actions">
                    <Link
                      to={`/assessments/${workbench.assessmentId}/scripts/verify/${workbench.batchId}`}
                      className="sc-btn sc-btn-ghost"
                    >
                      Full split verification
                    </Link>
                    <Link
                      to={`/assessments/${workbench.assessmentId}/scripts`}
                      className="sc-btn sc-btn-ghost"
                    >
                      Assessment scripts (legacy)
                    </Link>
                  </div>
                </>
              )}
            </div>
          </WorkflowStep>

          <WorkflowStep title="5 · Results" status={workflowSteps.results}>
            <div className="sc-marking-workbench-card">
              {!workbench || workbench.scripts.length === 0 ? (
                <p className="sc-marking-hint">Results appear after learner scripts are uploaded.</p>
              ) : (
                <>
                  <div className="sc-table-wrap">
                    <table className="sc-table">
                      <thead>
                        <tr>
                          <th>Learner</th>
                          <th>Mark</th>
                          <th>Total</th>
                          <th>%</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workbench.scripts.map((s) => (
                          <tr key={s.id}>
                            <td>{s.learnerName}</td>
                            <td>{s.finalTotal ?? s.teacherTotal ?? "—"}</td>
                            <td>{workbench.totalMarks}</td>
                            <td>
                              {s.finalPercentage != null
                                ? `${s.finalPercentage}%`
                                : "—"}
                            </td>
                            <td>
                              <span className="sc-badge sc-badge-muted">
                                {resultStatusLabel(s)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sc-marking-card-actions">
                    <Link
                      to={`/assessments/${workbench.assessmentId}/results`}
                      className="sc-btn sc-btn-ghost"
                    >
                      Assessment results
                    </Link>
                  </div>
                </>
              )}
            </div>
          </WorkflowStep>
        </div>

        <aside className="sc-marking-jobs-sidebar">
          <section className="sc-card sc-marking-jobs-panel">
            <header className="sc-marking-queue-header">
              <h2 className="sc-marking-section-title">Recent marking jobs</h2>
              <p className="sc-marking-hint">Script batches — not assessment management.</p>
            </header>
            {recentJobs.length === 0 ? (
              <p className="sc-marking-hint sc-marking-jobs-empty">No marking jobs yet.</p>
            ) : (
              <div className="sc-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Scripts</th>
                      <th>Stage</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((job) => (
                      <tr
                        key={job.batchId}
                        className={job.batchId === activeBatchId ? "is-selected" : undefined}
                      >
                        <td>
                          <div className="sc-marking-job-title">{job.title}</div>
                          <div className="sc-marking-job-meta">
                            {job.grade.name} · {job.subject.name}
                          </div>
                        </td>
                        <td>{job.scriptCount}</td>
                        <td>
                          <span className="sc-badge sc-badge-muted">
                            {workflowStageLabel(job.workflowStage)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-marking-table-btn"
                            disabled={busy}
                            onClick={() => void resumeJob(job.batchId)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
