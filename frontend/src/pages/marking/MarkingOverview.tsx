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
  getMarkingOverview,
  getSetupStatus,
  updateSetup,
  uploadMasterFile,
  type AssessmentSetupStatus,
  type MarkingMode,
  type MarkingOverviewItem,
} from "../../services/assessmentSetupApi";
import type { Assessment } from "../../types";
import { formatStatusLabel } from "../../utils/statusLabels";
import CurriculumSelector, { curriculumContextReady } from "../assessments/CurriculumSelector";
import "../dashboard/Dashboard.css";
import "./MarkingOverview.css";

type MarkingOption = 1 | 2 | 3;

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

const MARKING_SESSION_KEY = "scriptcheck-marking-job";

const OPTION_LABELS: Record<MarkingOption, { title: string; summary: string }> = {
  1: {
    title: "Question paper + learner booklets — no memo",
    summary: "Upload question paper and learner booklets only. AI generates the marking guide — no memo required.",
  },
  2: {
    title: "Question paper with answers included",
    summary: "Upload a question paper that includes memo or answers, plus learner booklets.",
  },
  3: {
    title: "ScriptCheck assessment",
    summary: "Select an assessment already built in ScriptCheck, upload learner scripts, verify split, and mark.",
  },
};

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

function defaultJobTitle(term: string, option: MarkingOption) {
  const label = term.trim() || "Marking";
  const suffix = option === 1 ? "QP + Answers" : "QP with Memo";
  return `${label} — ${suffix} — ${new Date().toLocaleDateString()}`;
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
  canStart,
  startHint,
}: {
  assessmentId: string | null;
  batch: BatchMeta;
  scriptsVerified: boolean;
  canStart: boolean;
  startHint: string;
}) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [starting, setStarting] = useState(false);

  const hasScripts = batch.scriptCount > 0;

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
    if (!assessmentId || !batch.batchId || !canStart) return;
    setStarting(true);
    setExportError("");
    try {
      const detail = await apiFetch<{
        learnerScripts: Array<{ id: string }>;
      }>(`/script-batches/${batch.batchId}`);
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
      {canStart && assessmentId ? (
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
          title={startHint}
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
      {scriptsVerified && !canStart ? (
        <p className="sc-marking-memo-note">{startHint}</p>
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
  const [selectedOption, setSelectedOption] = useState<MarkingOption | null>(null);

  // Option 3 — ScriptCheck assessment
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

  // Options 1 & 2 — upload workflows
  const [packCurriculumId, setPackCurriculumId] = useState("");
  const [packPhaseId, setPackPhaseId] = useState("");
  const [packGradeId, setPackGradeId] = useState("");
  const [packSubjectId, setPackSubjectId] = useState("");
  const [packTerm, setPackTerm] = useState("");
  const [packTotalMarks, setPackTotalMarks] = useState("");
  const [packQuestionCount, setPackQuestionCount] = useState("");
  const [packPagesInput, setPackPagesInput] = useState("");
  const [packAssessmentId, setPackAssessmentId] = useState<string | null>(null);
  const [packBatchId, setPackBatchId] = useState<string | null>(null);
  const [packBatch, setPackBatch] = useState<BatchMeta>(emptyBatch());
  const [packSetupStatus, setPackSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [packHasPaper, setPackHasPaper] = useState(false);
  const [packBookletFiles, setPackBookletFiles] = useState<File[]>([]);
  const [packDrag, setPackDrag] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [packUploadingPaper, setPackUploadingPaper] = useState(false);
  const packPaperRef = useRef<HTMLInputElement>(null);
  const packBookletRef = useRef<HTMLInputElement>(null);

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

  const fetchSetup = useCallback(async (assessmentId: string, fallbackPages?: number | null) => {
    const status = await getSetupStatus(assessmentId).catch(() => null);
    const pages =
      normalizePages(status?.pagesPerScript) ?? normalizePages(fallbackPages) ?? null;
    return { status, pages };
  }, []);

  useEffect(() => {
    void loadLists();
    try {
      const raw = sessionStorage.getItem(MARKING_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        option?: MarkingOption;
        assessmentId?: string;
        batchId?: string;
      };
      if (saved.option) setSelectedOption(saved.option);
      if (saved.assessmentId) {
        if (saved.option === 3) setSelectedId(saved.assessmentId);
        else setPackAssessmentId(saved.assessmentId);
      }
      if (saved.batchId) setPackBatchId(saved.batchId);
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
    void fetchSetup(selectedId).then(({ status, pages }) => {
      setSetupStatus(status);
      setSavedPages(pages);
      setPagesInput(pages != null ? String(pages) : "");
    });
    void fetchBatch(selectedId).then(setScBatch);
  }, [selectedId, fetchSetup, fetchBatch]);

  useEffect(() => {
    if (!packAssessmentId) {
      setPackSetupStatus(null);
      setPackHasPaper(false);
      setPackBatch(emptyBatch());
      return;
    }
    void fetchSetup(packAssessmentId).then(({ status }) => {
      setPackSetupStatus(status);
      setPackHasPaper(status?.masterFiles.questionPaper === true);
    });
    void fetchBatch(packAssessmentId).then((batch) => {
      setPackBatch(batch);
      if (batch.batchId) setPackBatchId(batch.batchId);
    });
  }, [packAssessmentId, fetchSetup, fetchBatch]);

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

  const packReady = curriculumContextReady(
    packCurriculumId,
    packPhaseId,
    packGradeId,
    packSubjectId
  );
  const parsedPackPages = parsePositiveInt(packPagesInput);
  const parsedPackMarks = parsePositiveInt(packTotalMarks);
  const parsedPackQuestions = parsePositiveInt(packQuestionCount);
  const packMetaValid =
    packReady &&
    packTerm.trim().length > 0 &&
    parsedPackPages != null &&
    parsedPackMarks != null &&
    parsedPackQuestions != null;
  const packVerified =
    packBatch.scriptCount > 0 && !!packBatch.batchStatus && packBatch.batchStatus !== "DRAFT";
  const packCanUpload =
    packMetaValid && !!packBatchId && packHasPaper && packBookletFiles.length > 0;

  const packCanStart =
    packVerified &&
    (selectedOption === 1
      ? packSetupStatus?.markingGuideReady === true || packSetupStatus?.readyForMarking === true
      : packSetupStatus?.memoAnswersReady === true || packSetupStatus?.readyForMarking === true);

  const packStartHint = !packVerified
    ? "Upload learner booklets and confirm script split first"
    : selectedOption === 1
      ? "Confirm script split to generate AI marking guide and marks"
      : "Confirm script split — answers must be detected on the question paper";

  const persistSession = (option: MarkingOption, assessmentId: string, batchId: string) => {
    sessionStorage.setItem(
      MARKING_SESSION_KEY,
      JSON.stringify({ option, assessmentId, batchId })
    );
  };

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

  const ensureMarkingPack = async (option: 1 | 2): Promise<{ assessmentId: string; batchId: string }> => {
    if (packAssessmentId && packBatchId) {
      return { assessmentId: packAssessmentId, batchId: packBatchId };
    }
    if (!packMetaValid) {
      throw new Error("Complete grade, term, subject, total marks, questions, and pages per script.");
    }
    setPackBusy(true);
    try {
      const markingMode: MarkingMode = option === 1 ? "QP_LEARNER_ONLY" : "QP_WITH_ANSWERS";
      const pack = await createMarkingPack({
        title: defaultJobTitle(packTerm, option),
        curriculumId: packCurriculumId,
        phaseId: packPhaseId,
        gradeId: packGradeId,
        subjectId: packSubjectId,
        pagesPerScript: parsedPackPages ?? undefined,
        totalMarks: parsedPackMarks ?? undefined,
        questionCount: parsedPackQuestions ?? undefined,
        scriptFormat: option === 2 ? "ON_QUESTION_PAPER" : "ANSWER_SHEET",
        markingMode,
      });
      await updateSetup(pack.assessmentId, {
        term: packTerm.trim(),
        totalMarks: parsedPackMarks!,
        questionCount: parsedPackQuestions!,
        pagesPerScript: parsedPackPages!,
      });
      setPackAssessmentId(pack.assessmentId);
      setPackBatchId(pack.batchId);
      setPackBatch({ batchId: pack.batchId, batchStatus: "DRAFT", scriptCount: 0 });
      persistSession(option, pack.assessmentId, pack.batchId);
      const all = await apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]);
      setAssessments(all);
      return { assessmentId: pack.assessmentId, batchId: pack.batchId };
    } finally {
      setPackBusy(false);
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
      const { pages, status } = await fetchSetup(selectedId, parsedPages);
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
      persistSession(3, selectedId, batchId);
      navigate(`/assessments/${selectedId}/scripts/verify/${batchId}`, {
        state: { verification: result.verification, markingOption: 3 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setScUploading(false);
      setScProgress(0);
    }
  };

  const uploadPackPaper = async (option: 1 | 2, file: File) => {
    if (!packMetaValid) {
      setError("Complete all assessment details first.");
      return;
    }
    setPackUploadingPaper(true);
    setError("");
    try {
      const { assessmentId } = await ensureMarkingPack(option);
      await uploadMasterFile(assessmentId, "questionPaper", file);
      const { status } = await fetchSetup(assessmentId, parsedPackPages);
      setPackSetupStatus(status);
      setPackHasPaper(status?.masterFiles.questionPaper === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question paper upload failed");
    } finally {
      setPackUploadingPaper(false);
      if (packPaperRef.current) packPaperRef.current.value = "";
    }
  };

  const uploadPackBooklets = async (option: 1 | 2) => {
    if (!packCanUpload) return;
    if (packBookletFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setPackBusy(true);
    setError("");
    try {
      const { assessmentId, batchId } = await ensureMarkingPack(option);
      const result = await bulkUploadScripts(batchId, packBookletFiles, setPackProgress);
      const all = await apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]);
      setAssessments(all);
      const { status } = await fetchSetup(assessmentId, parsedPackPages);
      setPackSetupStatus(status);
      setPackHasPaper(status?.masterFiles.questionPaper === true);
      setPackBatch(await fetchBatch(assessmentId));
      persistSession(option, assessmentId, batchId);
      navigate(`/assessments/${assessmentId}/scripts/verify/${batchId}`, {
        state: { verification: result.verification, markingOption: option },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPackBusy(false);
      setPackProgress(0);
    }
  };

  const pickFiles = (incoming: FileList | File[], setter: (files: File[]) => void) => {
    const list = Array.from(incoming);
    if (list.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setError("");
    setter(list);
  };

  const selectOption = (option: MarkingOption) => {
    setSelectedOption(option);
    setError("");
  };

  if (loading) {
    return (
      <div className="sc-dash sc-marking-page" data-page="marking">
        <p>Loading marking…</p>
      </div>
    );
  }

  return (
    <div className="sc-dash sc-marking-page" data-page="marking">
      <header className="sc-marking-page-header">
        <h1 className="sc-page-title">Marking</h1>
        <p className="sc-page-subtitle">Choose one of three marking workflows.</p>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <section className="sc-marking-option-picker" aria-label="Marking workflow options">
        {[1, 2, 3].map((option) => {
          const info = OPTION_LABELS[option as MarkingOption];
          const isSelected = selectedOption === option;
          return (
            <button
              key={option}
              type="button"
              className={`sc-marking-option-card${isSelected ? " is-selected" : ""}`}
              onClick={() => selectOption(option as MarkingOption)}
              aria-pressed={isSelected}
            >
              <span className="sc-marking-option-number">Option {option}</span>
              <strong className="sc-marking-option-title">{info.title}</strong>
              <p className="sc-marking-option-summary">{info.summary}</p>
            </button>
          );
        })}
      </section>

      {selectedOption === 1 ? (
        <article className="sc-card sc-card-padded sc-marking-card" aria-labelledby="option-1">
          <header className="sc-marking-card-header">
            <h2 id="option-1" className="sc-marking-card-title">
              Option 1 — Question paper + learner answers (no memo)
            </h2>
            <p className="sc-marking-hint">
              Upload the question paper and learner answer booklets only. AI extracts questions,
              generates a marking guide, marks learner answers, and lets you adjust before saving.
            </p>
          </header>

          <CurriculumSelector
            curriculumId={packCurriculumId}
            phaseId={packPhaseId}
            gradeId={packGradeId}
            subjectId={packSubjectId}
            onCurriculumIdChange={setPackCurriculumId}
            onPhaseIdChange={(id) => {
              setPackPhaseId(id);
              setPackGradeId("");
              setPackSubjectId("");
            }}
            onGradeIdChange={setPackGradeId}
            onSubjectIdChange={setPackSubjectId}
            disabled={packBusy}
          />

          <div className="sc-marking-details-grid">
            <label className="sc-marking-field">
              Term
              <input
                className="sc-input"
                value={packTerm}
                placeholder="e.g. Term 2"
                disabled={packBusy}
                onChange={(e) => setPackTerm(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Total marks
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={packTotalMarks}
                placeholder="e.g. 50"
                disabled={packBusy}
                onChange={(e) => setPackTotalMarks(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Number of questions
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={packQuestionCount}
                placeholder="e.g. 10"
                disabled={packBusy}
                onChange={(e) => setPackQuestionCount(e.target.value)}
              />
            </label>
            <label className="sc-marking-field">
              Pages per learner script
              <input
                className="sc-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={packPagesInput}
                placeholder="e.g. 4"
                disabled={packBusy}
                onChange={(e) => setPackPagesInput(e.target.value)}
              />
            </label>
          </div>

          <div className="sc-marking-upload-card sc-marking-question-paper-panel">
            <h3 className="sc-marking-section-title">Upload question paper</h3>
            <p className="sc-marking-memo-note">No memo or answer key required for this workflow.</p>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!packMetaValid || packUploadingPaper || packBusy}
              onClick={() => packPaperRef.current?.click()}
            >
              {packUploadingPaper || packBusy
                ? "Preparing…"
                : packHasPaper
                  ? "Replace question paper"
                  : "Upload question paper"}
            </button>
            <input
              ref={packPaperRef}
              type="file"
              className="sc-marking-file-input-hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              disabled={!packMetaValid}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPackPaper(1, file);
              }}
            />
          </div>

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Upload learner answer booklet(s)</h3>
            <FileDropzone
              label="Drag & drop learner answer booklet(s) here"
              filesCount={packBookletFiles.length}
              dragOver={packDrag}
              disabled={!packMetaValid}
              onPick={() => packBookletRef.current?.click()}
              onDragOver={() => setPackDrag(true)}
              onDragLeave={() => setPackDrag(false)}
              onDrop={(e) => {
                setPackDrag(false);
                if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files, setPackBookletFiles);
              }}
            />
            <input
              ref={packBookletRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) pickFiles(e.target.files, setPackBookletFiles);
              }}
            />
          </div>

          {packProgress > 0 ? (
            <div className="sc-setup-progress">
              <div className="sc-setup-progress-bar" style={{ width: `${packProgress}%` }} />
            </div>
          ) : null}

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={packBusy || !packCanUpload}
            onClick={() => void uploadPackBooklets(1)}
          >
            {packBusy ? "Uploading…" : "Upload & Verify"}
          </button>

          <VerifyStartActions
            assessmentId={packAssessmentId}
            batch={packBatch}
            scriptsVerified={packVerified}
            canStart={packCanStart}
            startHint={packStartHint}
          />
        </article>
      ) : null}

      {selectedOption === 2 ? (
        <article className="sc-card sc-card-padded sc-marking-card" aria-labelledby="option-2">
          <header className="sc-marking-card-header">
            <h2 id="option-2" className="sc-marking-card-title">
              Option 2 — Question paper with answers included
            </h2>
            <p className="sc-marking-hint">
              Upload a question paper that includes memo or answers, plus learner answer booklets.
              ScriptCheck extracts questions and answers, then marks learner scripts.
            </p>
          </header>

          <CurriculumSelector
            curriculumId={packCurriculumId}
            phaseId={packPhaseId}
            gradeId={packGradeId}
            subjectId={packSubjectId}
            onCurriculumIdChange={setPackCurriculumId}
            onPhaseIdChange={(id) => {
              setPackPhaseId(id);
              setPackGradeId("");
              setPackSubjectId("");
            }}
            onGradeIdChange={setPackGradeId}
            onSubjectIdChange={setPackSubjectId}
            disabled={packBusy}
          />

          <div className="sc-marking-details-grid">
            <label className="sc-marking-field">
              Term
              <input className="sc-input" value={packTerm} placeholder="e.g. Term 2" disabled={packBusy} onChange={(e) => setPackTerm(e.target.value)} />
            </label>
            <label className="sc-marking-field">
              Total marks
              <input className="sc-input" type="number" min={1} inputMode="numeric" value={packTotalMarks} placeholder="e.g. 50" disabled={packBusy} onChange={(e) => setPackTotalMarks(e.target.value)} />
            </label>
            <label className="sc-marking-field">
              Number of questions
              <input className="sc-input" type="number" min={1} inputMode="numeric" value={packQuestionCount} placeholder="e.g. 10" disabled={packBusy} onChange={(e) => setPackQuestionCount(e.target.value)} />
            </label>
            <label className="sc-marking-field">
              Pages per learner script
              <input className="sc-input" type="number" min={1} inputMode="numeric" value={packPagesInput} placeholder="e.g. 4" disabled={packBusy} onChange={(e) => setPackPagesInput(e.target.value)} />
            </label>
          </div>

          <div className="sc-marking-upload-card sc-marking-question-paper-panel">
            <h3 className="sc-marking-section-title">Upload question paper (with memo/answers)</h3>
            <p className="sc-marking-memo-note">
              Include a memorandum or answers section on the question paper. No separate memo upload needed.
            </p>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!packMetaValid || packUploadingPaper || packBusy}
              onClick={() => packPaperRef.current?.click()}
            >
              {packUploadingPaper || packBusy
                ? "Preparing…"
                : packHasPaper
                  ? "Replace question paper"
                  : "Upload question paper"}
            </button>
            <input
              ref={packPaperRef}
              type="file"
              className="sc-marking-file-input-hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              disabled={!packMetaValid}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPackPaper(2, file);
              }}
            />
          </div>

          <div className="sc-marking-upload-card">
            <h3 className="sc-marking-section-title">Upload learner answer booklet(s)</h3>
            <FileDropzone
              label="Drag & drop learner answer booklet(s) here"
              filesCount={packBookletFiles.length}
              dragOver={packDrag}
              disabled={!packMetaValid}
              onPick={() => packBookletRef.current?.click()}
              onDragOver={() => setPackDrag(true)}
              onDragLeave={() => setPackDrag(false)}
              onDrop={(e) => {
                setPackDrag(false);
                if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files, setPackBookletFiles);
              }}
            />
            <input
              ref={packBookletRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) pickFiles(e.target.files, setPackBookletFiles);
              }}
            />
          </div>

          {packProgress > 0 ? (
            <div className="sc-setup-progress">
              <div className="sc-setup-progress-bar" style={{ width: `${packProgress}%` }} />
            </div>
          ) : null}

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={packBusy || !packCanUpload}
            onClick={() => void uploadPackBooklets(2)}
          >
            {packBusy ? "Uploading…" : "Upload & Verify"}
          </button>

          <VerifyStartActions
            assessmentId={packAssessmentId}
            batch={packBatch}
            scriptsVerified={packVerified}
            canStart={packCanStart}
            startHint={packStartHint}
          />
        </article>
      ) : null}

      {selectedOption === 3 ? (
        <article className="sc-card sc-card-padded sc-marking-card" aria-labelledby="option-3">
          <header className="sc-marking-card-header">
            <h2 id="option-3" className="sc-marking-card-title">
              Option 3 — Mark ScriptCheck assessment
            </h2>
            <p className="sc-marking-hint">
              Select an assessment already built in ScriptCheck. Upload learner scripts, verify the split,
              start AI marking, then review, save, and export.
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
                <div><dt>Grade</dt><dd>{selectedAssessment.grade.name}</dd></div>
                <div><dt>Subject</dt><dd>{selectedAssessment.subject.name}</dd></div>
                <div><dt>Term</dt><dd>{selectedAssessment.term ?? "—"}</dd></div>
                <div><dt>Total marks</dt><dd>{selectedAssessment.totalMarks}</dd></div>
                <div><dt>Questions</dt><dd>{selectedAssessment.questionCount ?? setupStatus?.questionCount ?? "—"}</dd></div>
                <div><dt>Status</dt><dd>{formatStatusLabel(selectedAssessment.status)}</dd></div>
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
            canStart={scVerified}
            startHint="Upload, verify, and confirm script split first"
          />
        </article>
      ) : null}

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
                  <tr key={item.id}>
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
                      {item.batchId ? (
                        <Link
                          to={`/assessments/${item.id}/scripts`}
                          className="sc-btn sc-btn-primary sc-marking-table-btn"
                        >
                          Mark
                        </Link>
                      ) : null}
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
