import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiDownload, apiFetch } from "../../api";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import {
  bulkUploadScripts,
  completeSetup,
  createMarkingPack,
  reextractQuickScanQuestions,
  getAssessmentFiles,
  getMarkingOverview,
  getSetupStatus,
  updateSetup,
  uploadMasterFile,
  type AssessmentFileEntry,
  type AssessmentSetupStatus,
  type MarkingOverviewItem,
  type ScriptFormat,
} from "../../services/assessmentSetupApi";
import type { Assessment } from "../../types";
import { formatStatusLabel } from "../../utils/statusLabels";
import CurriculumSelector, { curriculumContextReady } from "../assessments/CurriculumSelector";
import "../dashboard/Dashboard.css";
import "./MarkingOverview.css";

type BatchMeta = {
  batchId: string | null;
  batchStatus: string | null;
  scriptCount: number;
};

type ScriptBatchSummary = {
  id: string;
  status: string;
  totalScripts: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: { learnerScripts: number };
};

const MEMO_NOTE =
  "If the question paper includes a memorandum section, ScriptCheck will detect answers automatically. Otherwise upload the memo separately before starting AI marking.";

const QUICK_SCAN_SESSION_KEY = "scriptcheck-quick-scan-job";

const emptyBatch = (): BatchMeta => ({
  batchId: null,
  batchStatus: null,
  scriptCount: 0,
});

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizePages(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 1) return null;
  return Math.trunc(value);
}

function latestBatch(batches: ScriptBatchSummary[]): BatchMeta {
  if (!batches.length) return emptyBatch();
  const b = batches.reduce((a, c) => {
    const at = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const ct = new Date(c.updatedAt ?? c.createdAt ?? 0).getTime();
    return ct > at ? c : a;
  });
  return {
    batchId: b.id,
    batchStatus: b.status,
    scriptCount: b.totalScripts ?? b._count?.learnerScripts ?? 0,
  };
}

function defaultQuickTitle(term: string) {
  const label = term.trim() || "Quick Scan";
  return `${label} — ${new Date().toLocaleDateString()}`;
}

function FileDropzone({
  label,
  filesCount,
  dragOver,
  disabled,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  label: string;
  filesCount: number;
  dragOver: boolean;
  disabled?: boolean;
  onPick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`sc-marking-dropzone${dragOver ? " is-dragover" : ""}${disabled ? " is-disabled" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDragOver(e);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDrop(e);
      }}
      onClick={() => {
        if (!disabled) onPick();
      }}
      onKeyDown={(e) => {
        if (!disabled && e.key === "Enter") onPick();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <strong>{label}</strong>
      <p>or click to browse · PDF, PNG, JPG · max {MAX_UPLOAD_FILES} files</p>
      {filesCount > 0 ? (
        <p>
          <strong>{filesCount}</strong> file(s) selected
        </p>
      ) : null}
    </div>
  );
}

function VerifyStartActions({
  assessmentId,
  batch,
  scriptsVerified,
  memoAnswersReady = true,
  memoBlocker = null,
}: {
  assessmentId: string | null;
  batch: BatchMeta;
  scriptsVerified: boolean;
  memoAnswersReady?: boolean;
  memoBlocker?: string | null;
}) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [starting, setStarting] = useState(false);

  const hasScripts = batch.scriptCount > 0;
  const canStartMarking = scriptsVerified && memoAnswersReady;
  const startMarkingHint = !scriptsVerified
    ? "Upload, verify, and confirm script split first"
    : memoBlocker ?? "Upload memo before AI marking";

  const handleExportCsv = async () => {
    if (!batch.batchId) return;
    setExporting(true);
    setExportError("");
    try {
      await apiDownload(
        `/script-batches/${batch.batchId}/export.csv`,
        `marks-${batch.batchId.slice(0, 8)}.csv`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "CSV export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleStartMarking = async () => {
    if (!assessmentId || !batch.batchId || !canStartMarking) return;
    setStarting(true);
    setExportError("");
    try {
      const detail = await apiFetch<{ learnerScripts: { id: string }[] }>(
        `/script-batches/${batch.batchId}`
      );
      const scriptId = detail.learnerScripts?.[0]?.id;
      if (scriptId) {
        navigate(`/scripts/${scriptId}`);
      } else {
        navigate(`/assessments/${assessmentId}/scripts`);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not open marking view");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sc-marking-card-actions">
      {hasScripts && batch.batchId ? (
        <Link
          to={`/assessments/${assessmentId}/scripts/verify/${batch.batchId}`}
          className="sc-btn sc-btn-ghost"
        >
          Verify Scripts
        </Link>
      ) : (
        <button type="button" className="sc-btn sc-btn-ghost" disabled>
          Verify Scripts
        </button>
      )}
      {canStartMarking && assessmentId ? (
        <button
          type="button"
          className="sc-btn sc-btn-primary"
          disabled={starting}
          onClick={() => void handleStartMarking()}
        >
          {starting ? "Opening…" : "Start AI Marking"}
        </button>
      ) : (
        <button
          type="button"
          className="sc-btn sc-btn-primary is-disabled-hint"
          disabled
          title={startMarkingHint}
        >
          Start AI Marking
        </button>
      )}
      {hasScripts && batch.batchId ? (
        <button
          type="button"
          className="sc-btn sc-btn-secondary"
          disabled={exporting}
          onClick={() => void handleExportCsv()}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      ) : null}
      {exportError ? <p className="sc-marking-memo-note sc-error">{exportError}</p> : null}
      {scriptsVerified && !memoAnswersReady && memoBlocker ? (
        <p className="sc-marking-memo-note sc-error">{memoBlocker}</p>
      ) : null}
    </div>
  );
}

export default function MarkingOverview() {
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [queueItems, setQueueItems] = useState<MarkingOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Card 1 — ScriptCheck assessment
  const [selectedId, setSelectedId] = useState("");
  const [pagesInput, setPagesInput] = useState("");
  const [savedPages, setSavedPages] = useState<number | null>(null);
  const [setupStatus, setSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [savingPages, setSavingPages] = useState(false);
  const [scFiles, setScFiles] = useState<File[]>([]);
  const [scDrag, setScDrag] = useState(false);
  const [scUploading, setScUploading] = useState(false);
  const [scProgress, setScProgress] = useState(0);
  const [scBatch, setScBatch] = useState<BatchMeta>(emptyBatch());
  const scFileRef = useRef<HTMLInputElement>(null);

  // Card 2 — Quick Scan
  const [quickCurriculumId, setQuickCurriculumId] = useState("");
  const [quickPhaseId, setQuickPhaseId] = useState("");
  const [quickGradeId, setQuickGradeId] = useState("");
  const [quickSubjectId, setQuickSubjectId] = useState("");
  const [quickTerm, setQuickTerm] = useState("");
  const [quickTotalMarks, setQuickTotalMarks] = useState("");
  const [quickQuestionCount, setQuickQuestionCount] = useState("");
  const [quickPagesInput, setQuickPagesInput] = useState("");
  const [quickScriptFormat, setQuickScriptFormat] = useState<ScriptFormat>("ANSWER_SHEET");
  const [quickAssessmentId, setQuickAssessmentId] = useState<string | null>(null);
  const [quickBatchId, setQuickBatchId] = useState<string | null>(null);
  const [quickBatch, setQuickBatch] = useState<BatchMeta>(emptyBatch());
  const [quickSetupStatus, setQuickSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [quickFiles, setQuickFiles] = useState<AssessmentFileEntry[]>([]);
  const [quickBookletFiles, setQuickBookletFiles] = useState<File[]>([]);
  const [quickDrag, setQuickDrag] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickProgress, setQuickProgress] = useState(0);
  const [quickUploadingPaper, setQuickUploadingPaper] = useState(false);
  const [quickUploadingMemo, setQuickUploadingMemo] = useState(false);
  const [quickUploadingRubric, setQuickUploadingRubric] = useState(false);
  const quickPaperRef = useRef<HTMLInputElement>(null);
  const quickBookletRef = useRef<HTMLInputElement>(null);
  const quickMemoRef = useRef<HTMLInputElement>(null);
  const quickRubricRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const [marking, all] = await Promise.all([
        getMarkingOverview().then((d) => d.items).catch(() => [] as MarkingOverviewItem[]),
        apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]),
      ]);
      setQueueItems(marking);
      setAssessments(all);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchBatch = useCallback(async (assessmentId: string) => {
    try {
      const batches = await apiFetch<ScriptBatchSummary[]>(
        `/assessments/${assessmentId}/script-batches`
      );
      return latestBatch(batches);
    } catch {
      return emptyBatch();
    }
  }, []);

  const fetchContext = useCallback(async (assessmentId: string, fallbackPages?: number | null) => {
    const [statusRes, filesRes] = await Promise.allSettled([
      getSetupStatus(assessmentId),
      getAssessmentFiles(assessmentId),
    ]);
    const status = statusRes.status === "fulfilled" ? statusRes.value : null;
    const files = filesRes.status === "fulfilled" ? filesRes.value.assessmentFiles : [];
    const pages =
      normalizePages(status?.pagesPerScript) ?? normalizePages(fallbackPages) ?? null;
    return { status, files, pages };
  }, []);

  useEffect(() => {
    void loadLists();
    try {
      const raw = sessionStorage.getItem(QUICK_SCAN_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { assessmentId?: string; batchId?: string };
      if (saved.assessmentId) setQuickAssessmentId(saved.assessmentId);
      if (saved.batchId) setQuickBatchId(saved.batchId);
    } catch {
      /* ignore corrupt session */
    }
  }, [loadLists]);

  useEffect(() => {
    if (!selectedId) {
      setSetupStatus(null);
      setSavedPages(null);
      setPagesInput("");
      setScBatch(emptyBatch());
      return;
    }
    void fetchContext(selectedId).then(({ status, pages }) => {
      setSetupStatus(status);
      setSavedPages(pages);
      setPagesInput(pages != null ? String(pages) : "");
    });
    void fetchBatch(selectedId).then(setScBatch);
  }, [selectedId, fetchContext, fetchBatch]);

  useEffect(() => {
    if (!quickAssessmentId) {
      setQuickSetupStatus(null);
      setQuickFiles([]);
      setQuickBatch(emptyBatch());
      return;
    }
    void fetchContext(quickAssessmentId).then(({ status, files }) => {
      setQuickSetupStatus(status);
      setQuickFiles(files);
    });
    void fetchBatch(quickAssessmentId).then((batch) => {
      setQuickBatch(batch);
      if (batch.batchId) setQuickBatchId(batch.batchId);
    });
  }, [quickAssessmentId, fetchContext, fetchBatch]);

  useEffect(() => {
    const onFocus = () => void loadLists(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadLists]);

  const selectedAssessment = useMemo(
    () => assessments.find((a) => a.id === selectedId) ?? null,
    [assessments, selectedId]
  );

  const parsedPages = parsePositiveInt(pagesInput);
  const hasSavedPages = savedPages != null;
  const scVerified =
    scBatch.scriptCount > 0 && !!scBatch.batchStatus && scBatch.batchStatus !== "DRAFT";
  const scCanUpload = !!selectedId && hasSavedPages && scFiles.length > 0;

  const quickReady = curriculumContextReady(
    quickCurriculumId,
    quickPhaseId,
    quickGradeId,
    quickSubjectId
  );
  const parsedQuickPages = parsePositiveInt(quickPagesInput);
  const parsedQuickMarks = parsePositiveInt(quickTotalMarks);
  const parsedQuickQuestions = parsePositiveInt(quickQuestionCount);
  const quickMetaValid =
    quickReady &&
    quickTerm.trim().length > 0 &&
    parsedQuickPages != null &&
    parsedQuickMarks != null &&
    parsedQuickQuestions != null;
  const quickHasPaper =
    quickSetupStatus?.masterFiles.questionPaper === true ||
    quickFiles.some((f) => f.category === "assessment" && f.fileType === "Question Paper");
  const quickHasMemo =
    quickSetupStatus?.masterFiles.memorandum === true ||
    quickFiles.some((f) => f.category === "assessment" && f.fileType === "Memorandum");
  const quickHasRubric =
    quickSetupStatus?.masterFiles.rubric === true ||
    quickFiles.some((f) => f.category === "assessment" && f.fileType === "Rubric");
  const quickVerified =
    quickBatch.scriptCount > 0 && !!quickBatch.batchStatus && quickBatch.batchStatus !== "DRAFT";
  const quickCanUpload =
    quickMetaValid && !!quickBatchId && quickHasPaper && quickBookletFiles.length > 0;

  const ensureScBatch = async (assessmentId: string, title: string): Promise<string> => {
    const batches = await apiFetch<{ id: string }[]>(
      `/assessments/${assessmentId}/script-batches`
    );
    if (batches[0]?.id) return batches[0].id;
    const status = await getSetupStatus(assessmentId);
    if (!status.setupComplete && status.readyForMarking) {
      await completeSetup(assessmentId);
    }
    const created = await apiFetch<{ id: string }>(
      `/assessments/${assessmentId}/script-batches`,
      { method: "POST", body: JSON.stringify({ title: `${title} — Learner Answers` }) }
    );
    return created.id;
  };

  const ensureQuickPack = async (): Promise<{ assessmentId: string; batchId: string }> => {
    if (quickAssessmentId && quickBatchId) {
      return { assessmentId: quickAssessmentId, batchId: quickBatchId };
    }
    if (!quickMetaValid) {
      throw new Error("Complete grade, term, subject, total marks, questions, and pages per script.");
    }
    setQuickBusy(true);
    try {
      const pack = await createMarkingPack({
        title: defaultQuickTitle(quickTerm),
        curriculumId: quickCurriculumId,
        phaseId: quickPhaseId,
        gradeId: quickGradeId,
        subjectId: quickSubjectId,
        pagesPerScript: parsedQuickPages ?? undefined,
        totalMarks: parsedQuickMarks ?? undefined,
        questionCount: parsedQuickQuestions ?? undefined,
        scriptFormat: quickScriptFormat,
      });
      await updateSetup(pack.assessmentId, {
        term: quickTerm.trim(),
        totalMarks: parsedQuickMarks!,
        questionCount: parsedQuickQuestions!,
        pagesPerScript: parsedQuickPages!,
      });
      setQuickAssessmentId(pack.assessmentId);
      setQuickBatchId(pack.batchId);
      setQuickBatch({ batchId: pack.batchId, batchStatus: "DRAFT", scriptCount: 0 });
      sessionStorage.setItem(
        QUICK_SCAN_SESSION_KEY,
        JSON.stringify({ assessmentId: pack.assessmentId, batchId: pack.batchId })
      );
      const all = await apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]);
      setAssessments(all);
      return { assessmentId: pack.assessmentId, batchId: pack.batchId };
    } finally {
      setQuickBusy(false);
    }
  };

  const savePages = async () => {
    if (!selectedId || parsedPages == null) {
      setError("Enter a whole number greater than 0 for pages per script.");
      return;
    }
    setSavingPages(true);
    setError("");
    try {
      await updateSetup(selectedId, { pagesPerScript: parsedPages });
      const { pages, status } = await fetchContext(selectedId, parsedPages);
      const confirmed = pages ?? parsedPages;
      setSavedPages(confirmed);
      setPagesInput(String(confirmed));
      setSetupStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pages per script");
    } finally {
      setSavingPages(false);
    }
  };

  const uploadScBooklets = async () => {
    if (!scCanUpload || !selectedId || !selectedAssessment) return;
    if (scFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setScUploading(true);
    setError("");
    try {
      const batchId = await ensureScBatch(selectedId, selectedAssessment.title);
      const result = await bulkUploadScripts(batchId, scFiles, setScProgress);
      setScBatch(await fetchBatch(selectedId));
      navigate(`/assessments/${selectedId}/scripts/verify/${batchId}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setScUploading(false);
      setScProgress(0);
    }
  };

  const uploadQuickPaper = async (file: File) => {
    if (!quickMetaValid) {
      setError("Complete all Quick Scan fields first.");
      return;
    }
    setQuickUploadingPaper(true);
    setError("");
    try {
      const { assessmentId } = await ensureQuickPack();
      await uploadMasterFile(assessmentId, "questionPaper", file);
      const ctx = await fetchContext(assessmentId, parsedQuickPages);
      setQuickSetupStatus(ctx.status);
      setQuickFiles(ctx.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question paper upload failed");
    } finally {
      setQuickUploadingPaper(false);
      if (quickPaperRef.current) quickPaperRef.current.value = "";
    }
  };

  const uploadQuickMaster = async (
    kind: "memorandum" | "rubric",
    file: File,
    setUploading: (v: boolean) => void,
    ref: React.RefObject<HTMLInputElement | null>
  ) => {
    if (!quickMetaValid) {
      setError("Complete all Quick Scan fields first.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { assessmentId } = await ensureQuickPack();
      await uploadMasterFile(assessmentId, kind, file);
      await updateSetup(assessmentId, {
        [kind === "memorandum" ? "memorandumAvailable" : "rubricAvailable"]: true,
      });
      if (kind === "memorandum" && quickSetupStatus?.setupComplete) {
        await reextractQuickScanQuestions(assessmentId);
      }
      const ctx = await fetchContext(assessmentId, parsedQuickPages);
      setQuickSetupStatus(ctx.status);
      setQuickFiles(ctx.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const uploadQuickBooklets = async () => {
    if (!quickCanUpload) return;
    if (quickBookletFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setQuickBusy(true);
    setError("");
    try {
      const { assessmentId, batchId } = await ensureQuickPack();
      const result = await bulkUploadScripts(batchId, quickBookletFiles, setQuickProgress);
      const all = await apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]);
      setAssessments(all);
      const ctx = await fetchContext(assessmentId, parsedQuickPages);
      setQuickSetupStatus(ctx.status);
      setQuickFiles(ctx.files);
      setQuickBatch(await fetchBatch(assessmentId));
      navigate(`/assessments/${assessmentId}/scripts/verify/${batchId}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setQuickBusy(false);
      setQuickProgress(0);
    }
  };

  const pickFiles = (
    incoming: FileList | File[],
    setter: (files: File[]) => void
  ) => {
    const list = Array.from(incoming);
    if (list.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setError("");
    setter(list);
  };

  if (loading) {
    return (
      <div className="sc-dash sc-marking-page" data-page="marking-final">
        <p>Loading marking…</p>
      </div>
    );
  }

  return (
    <div className="sc-dash sc-marking-page" data-page="marking-final">
      <header className="sc-marking-page-header">
        <h1 className="sc-page-title">Marking</h1>
        <p className="sc-page-subtitle">Choose how you want to mark.</p>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-marking-cards">
        {/* CARD 1 — Mark ScriptCheck Assessment */}
        <article className="sc-card sc-card-padded sc-marking-card" aria-labelledby="card-scriptcheck">
          <header className="sc-marking-card-header">
            <h2 id="card-scriptcheck" className="sc-marking-card-title">
              Mark ScriptCheck Assessment
            </h2>
            <p className="sc-marking-hint">
              For assessments already built in ScriptCheck. No question paper upload needed here.
            </p>
          </header>

          <label className="sc-marking-field">
            Select existing assessment
            <select
              className="sc-input"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setScFiles([]);
                setError("");
              }}
            >
              <option value="">— Select assessment —</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.grade.name} · {a.subject.name})
                </option>
              ))}
            </select>
          </label>

          {selectedAssessment ? (
            <div className="sc-marking-details-panel">
              <h3 className="sc-marking-section-title">Assessment details</h3>
              <dl className="sc-marking-details-list">
                <div>
                  <dt>Grade</dt>
                  <dd>{selectedAssessment.grade.name}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{selectedAssessment.subject.name}</dd>
                </div>
                <div>
                  <dt>Term</dt>
                  <dd>{selectedAssessment.term ?? "—"}</dd>
                </div>
                <div>
                  <dt>Total marks</dt>
                  <dd>{selectedAssessment.totalMarks}</dd>
                </div>
                <div>
                  <dt>Questions</dt>
                  <dd>
                    {selectedAssessment.questionCount ?? setupStatus?.questionCount ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{formatStatusLabel(selectedAssessment.status)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="sc-marking-hint">Select an assessment to view details and upload scripts.</p>
          )}

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Pages per learner script</h3>
            <label className="sc-marking-field" htmlFor="sc-pages">
              Pages per script
              <input
                id="sc-pages"
                className="sc-input"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 4"
                value={pagesInput}
                disabled={!selectedId}
                onChange={(e) => setPagesInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!selectedId || savingPages || parsedPages == null}
              onClick={() => void savePages()}
            >
              {savingPages ? "Saving…" : "Save pages per script"}
            </button>
          </div>

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Upload learner answer booklet(s)</h3>
            <FileDropzone
              label="Drag & drop learner answer booklet(s) here"
              filesCount={scFiles.length}
              dragOver={scDrag}
              disabled={!selectedId}
              onPick={() => scFileRef.current?.click()}
              onDragOver={() => setScDrag(true)}
              onDragLeave={() => setScDrag(false)}
              onDrop={(e) => {
                setScDrag(false);
                if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files, setScFiles);
              }}
            />
            <input
              ref={scFileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) pickFiles(e.target.files, setScFiles);
              }}
            />
          </div>

          {scProgress > 0 ? (
            <div className="sc-setup-progress">
              <div className="sc-setup-progress-bar" style={{ width: `${scProgress}%` }} />
            </div>
          ) : null}

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={scUploading || !scCanUpload}
            onClick={() => void uploadScBooklets()}
          >
            {scUploading ? "Uploading…" : "Upload & Verify"}
          </button>

          <VerifyStartActions
            assessmentId={selectedId || null}
            batch={scBatch}
            scriptsVerified={scVerified}
          />
        </article>

        {/* CARD 2 — Quick Scan & Mark */}
        <article className="sc-card sc-card-padded sc-marking-card sc-marking-card-quick" aria-labelledby="card-quickscan">
          <header className="sc-marking-card-header">
            <h2 id="card-quickscan" className="sc-marking-card-title">
              Quick Scan &amp; Mark
            </h2>
            <p className="sc-marking-hint">
              You only have scanned papers or PDFs — mark immediately without manual assessment setup.
            </p>
          </header>

          <CurriculumSelector
            curriculumId={quickCurriculumId}
            phaseId={quickPhaseId}
            gradeId={quickGradeId}
            subjectId={quickSubjectId}
            onCurriculumIdChange={setQuickCurriculumId}
            onPhaseIdChange={(id) => {
              setQuickPhaseId(id);
              setQuickGradeId("");
              setQuickSubjectId("");
            }}
            onGradeIdChange={setQuickGradeId}
            onSubjectIdChange={setQuickSubjectId}
            disabled={quickBusy}
          />

          <div className="sc-marking-details-grid">
            <label className="sc-marking-field">
              Term
              <input
                className="sc-input"
                value={quickTerm}
                placeholder="e.g. Term 2"
                disabled={quickBusy}
                onChange={(e) => setQuickTerm(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Total marks
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={quickTotalMarks}
                placeholder="e.g. 50"
                disabled={quickBusy}
                onChange={(e) => setQuickTotalMarks(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Number of questions
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={quickQuestionCount}
                placeholder="e.g. 10"
                disabled={quickBusy}
                onChange={(e) => setQuickQuestionCount(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Pages per learner script
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={quickPagesInput}
                placeholder="e.g. 4"
                disabled={quickBusy}
                onChange={(e) => setQuickPagesInput(e.target.value)}
              />
            </label>
          </div>

          <fieldset className="sc-marking-script-format">
            <legend className="sc-marking-field">Script format</legend>
            <label className="sc-marking-radio">
              <input
                type="radio"
                name="quickScriptFormat"
                checked={quickScriptFormat === "ANSWER_SHEET"}
                disabled={quickBusy}
                onChange={() => setQuickScriptFormat("ANSWER_SHEET")}
              />
              Separate answer sheets / booklets
            </label>
            <label className="sc-marking-radio">
              <input
                type="radio"
                name="quickScriptFormat"
                checked={quickScriptFormat === "ON_QUESTION_PAPER"}
                disabled={quickBusy}
                onChange={() => setQuickScriptFormat("ON_QUESTION_PAPER")}
              />
              Learners wrote on the question paper itself
            </label>
          </fieldset>

          <div className="sc-marking-upload-card sc-marking-question-paper-panel">
            <h3 className="sc-marking-section-title">Upload question paper</h3>
            <p className="sc-marking-memo-note">{MEMO_NOTE}</p>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!quickMetaValid || quickUploadingPaper || quickBusy}
              onClick={() => quickPaperRef.current?.click()}
            >
              {quickUploadingPaper || quickBusy
                ? "Preparing…"
                : quickHasPaper
                  ? "Replace question paper"
                  : "Upload question paper"}
            </button>
            <input
              ref={quickPaperRef}
              type="file"
              className="sc-marking-file-input-hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              disabled={!quickMetaValid}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadQuickPaper(file);
              }}
            />
          </div>

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Optional memo / rubric</h3>
            <div className="sc-marking-card-actions">
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                disabled={!quickMetaValid || quickUploadingMemo || quickBusy}
                onClick={() => quickMemoRef.current?.click()}
              >
                {quickUploadingMemo
                  ? "Uploading…"
                  : quickHasMemo
                    ? "Replace memorandum"
                    : "Upload memorandum"}
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                disabled={!quickMetaValid || quickUploadingRubric || quickBusy}
                onClick={() => quickRubricRef.current?.click()}
              >
                {quickUploadingRubric
                  ? "Uploading…"
                  : quickHasRubric
                    ? "Replace rubric"
                    : "Upload rubric"}
              </button>
            </div>
            <input
              ref={quickMemoRef}
              type="file"
              className="sc-marking-file-input-hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadQuickMaster("memorandum", file, setQuickUploadingMemo, quickMemoRef);
              }}
            />
            <input
              ref={quickRubricRef}
              type="file"
              className="sc-marking-file-input-hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadQuickMaster("rubric", file, setQuickUploadingRubric, quickRubricRef);
              }}
            />
          </div>

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Upload learner answer booklet(s)</h3>
            <FileDropzone
              label="Drag & drop learner answer booklet(s) here"
              filesCount={quickBookletFiles.length}
              dragOver={quickDrag}
              disabled={!quickMetaValid}
              onPick={() => quickBookletRef.current?.click()}
              onDragOver={() => setQuickDrag(true)}
              onDragLeave={() => setQuickDrag(false)}
              onDrop={(e) => {
                setQuickDrag(false);
                if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files, setQuickBookletFiles);
              }}
            />
            <input
              ref={quickBookletRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) pickFiles(e.target.files, setQuickBookletFiles);
              }}
            />
          </div>

          {quickProgress > 0 ? (
            <div className="sc-setup-progress">
              <div className="sc-setup-progress-bar" style={{ width: `${quickProgress}%` }} />
            </div>
          ) : null}

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={quickBusy || !quickCanUpload}
            onClick={() => void uploadQuickBooklets()}
          >
            {quickBusy ? "Uploading…" : "Upload & Verify"}
          </button>

          <VerifyStartActions
            assessmentId={quickAssessmentId}
            batch={quickBatch}
            scriptsVerified={quickVerified}
            memoAnswersReady={quickSetupStatus?.memoAnswersReady === true}
            memoBlocker={quickSetupStatus?.memoBlocker ?? null}
          />
        </article>
      </div>

      {queueItems.length > 0 ? (
        <section className="sc-card sc-marking-queue" aria-label="Marking queue">
          <div className="sc-marking-queue-header">
            <h2 className="sc-marking-section-title">Marking queue</h2>
          </div>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Grade</th>
                  <th>Subject</th>
                  <th>Scripts</th>
                  <th>Pages/Script</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.map((item) => (
                  <tr key={item.id} className={item.id === selectedId ? "is-selected" : undefined}>
                    <td>{item.title}</td>
                    <td>{item.grade.name}</td>
                    <td>{item.subject.name}</td>
                    <td>{item.scriptCount}</td>
                    <td>{item.pagesPerScript ?? "—"}</td>
                    <td>
                      <span className="sc-badge sc-badge-muted">
                        {item.statusLabel || formatStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="sc-marking-card-actions">
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost sc-marking-table-btn"
                          onClick={() => {
                            setSelectedId(item.id);
                            setScFiles([]);
                          }}
                        >
                          Select
                        </button>
                        {item.batchId ? (
                          <Link
                            to={`/assessments/${item.id}/scripts`}
                            className="sc-btn sc-btn-primary sc-marking-table-btn"
                          >
                            Mark
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
