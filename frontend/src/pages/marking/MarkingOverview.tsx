import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiDownload, apiFetch } from "../../api";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import {
  bulkUploadScripts,
  getMarkingOverview,
  getSetupStatus,
  updateSetup,
  type AssessmentSetupStatus,
  type MarkingOverviewItem,
} from "../../services/assessmentSetupApi";
import type { Assessment, BatchModerationAnalytics } from "../../types";
import { validateBatchBeforeHodSubmit } from "../../utils/submitValidation";
import "../dashboard/Dashboard.css";
import "./MarkingOverview.css";

type PaperSet = {
  id: string;
  status: string;
  totalScripts: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: { learnerScripts: number };
};

type PaperSetMeta = {
  id: string | null;
  status: string | null;
  paperCount: number;
};

const emptyPaperSet = (): PaperSetMeta => ({
  id: null,
  status: null,
  paperCount: 0,
});

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function latestPaperSet(items: PaperSet[]): PaperSetMeta {
  if (!items.length) return emptyPaperSet();
  const latest = items.reduce((current, next) => {
    const currentTime = new Date(current.updatedAt ?? current.createdAt ?? 0).getTime();
    const nextTime = new Date(next.updatedAt ?? next.createdAt ?? 0).getTime();
    return nextTime > currentTime ? next : current;
  });
  return {
    id: latest.id,
    status: latest.status,
    paperCount: latest.totalScripts ?? latest._count?.learnerScripts ?? 0,
  };
}

function FileDropzone({
  filesCount,
  dragOver,
  disabled,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  filesCount: number;
  dragOver: boolean;
  disabled?: boolean;
  onPick: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`sc-marking-dropzone${dragOver ? " is-dragover" : ""}${disabled ? " is-disabled" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDragOver();
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
      <strong>Drop scanned learner papers here</strong>
      <p>or click to choose files from your computer.</p>
      {filesCount > 0 ? <p>{filesCount} file(s) ready to upload.</p> : null}
    </div>
  );
}

export default function MarkingOverview() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [markingItems, setMarkingItems] = useState<MarkingOverviewItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [setupStatus, setSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [paperSet, setPaperSet] = useState<PaperSetMeta>(emptyPaperSet());
  const [pagesInput, setPagesInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [batchAnalytics, setBatchAnalytics] = useState<BatchModerationAnalytics | null>(null);
  const [submitIssues, setSubmitIssues] = useState<string[]>([]);
  const [showSubmitOverride, setShowSubmitOverride] = useState(false);

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === selectedId) ?? null,
    [assessments, selectedId]
  );

  const selectedMarkingItem = useMemo(
    () => markingItems.find((item) => item.id === selectedId) ?? null,
    [markingItems, selectedId]
  );

  const pagesPerLearner =
    parsePositiveInt(pagesInput) ??
    setupStatus?.pagesPerScript ??
    selectedAssessment?.pagesPerScript ??
    null;

  const papersChecked = paperSet.paperCount > 0 && paperSet.status !== "DRAFT";
  const canUpload = Boolean(selectedAssessment && pagesPerLearner && files.length > 0);
  const canReview = Boolean(paperSet.id && papersChecked);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [allAssessments, marking] = await Promise.all([
        apiFetch<Assessment[]>("/assessments"),
        getMarkingOverview().then((data) => data.items).catch(() => [] as MarkingOverviewItem[]),
      ]);
      setAssessments(allAssessments);
      setMarkingItems(marking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your assessments.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedDetails = useCallback(async (assessmentId: string) => {
    setError("");
    const [setup, paperSets] = await Promise.all([
      getSetupStatus(assessmentId).catch(() => null),
      apiFetch<PaperSet[]>(`/assessments/${assessmentId}/script-batches`).catch(() => []),
    ]);
    setSetupStatus(setup);
    const pages = setup?.pagesPerScript ?? null;
    setPagesInput(pages ? String(pages) : "");
    setPaperSet(latestPaperSet(paperSets));
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (!selectedId) {
      setSetupStatus(null);
      setPaperSet(emptyPaperSet());
      setPagesInput("");
      setFiles([]);
      setBatchAnalytics(null);
      return;
    }
    void loadSelectedDetails(selectedId);
  }, [selectedId, loadSelectedDetails]);

  useEffect(() => {
    if (!paperSet.id || !papersChecked) {
      setBatchAnalytics(null);
      return;
    }
    let cancelled = false;
    apiFetch<BatchModerationAnalytics>(`/script-batches/${paperSet.id}/analytics`)
      .then((data) => {
        if (!cancelled) setBatchAnalytics(data);
      })
      .catch(() => {
        if (!cancelled) setBatchAnalytics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [paperSet.id, papersChecked, paperSet.paperCount]);

  const teacherDash = batchAnalytics?.teacherDashboard;
  const allMarked = Boolean(teacherDash?.allMarked);

  const pickFiles = (incoming: FileList | File[]) => {
    const picked = Array.from(incoming);
    if (picked.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setError("");
    setFiles(picked);
  };

  const ensurePaperSet = async () => {
    if (!selectedAssessment) throw new Error("Choose an assessment first.");
    const existing = await apiFetch<PaperSet[]>(
      `/assessments/${selectedAssessment.id}/script-batches`
    );
    if (existing[0]?.id) return existing[0].id;
    const created = await apiFetch<{ id: string }>(
      `/assessments/${selectedAssessment.id}/script-batches`,
      {
        method: "POST",
        body: JSON.stringify({ title: `${selectedAssessment.title} learner papers` }),
      }
    );
    return created.id;
  };

  const uploadPapers = async () => {
    if (!selectedAssessment || !pagesPerLearner) {
      setError("Tell ScriptCheck how many pages belong to one learner, then upload.");
      return;
    }
    if (!files.length) {
      setError("Choose the scanned learner papers first.");
      return;
    }
    if (files.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }

    setUploading(true);
    setError("");
    try {
      await updateSetup(selectedAssessment.id, { pagesPerScript: pagesPerLearner });
      const paperSetId = await ensurePaperSet();
      const result = await bulkUploadScripts(paperSetId, files, setUploadProgress);
      setFiles([]);
      setPaperSet({
        id: paperSetId,
        status: "DRAFT",
        paperCount: result.scriptsCreated,
      });
      navigate(`/assessments/${selectedAssessment.id}/scripts/verify/${paperSetId}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The papers could not be uploaded.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const openReview = async (preferUnfinished = true) => {
    if (!paperSet.id || !selectedAssessment) return;
    setActionBusy("review");
    setError("");
    try {
      const [detail, analytics] = await Promise.all([
        apiFetch<{ learnerScripts: Array<{ id: string; status: string }> }>(
          `/script-batches/${paperSet.id}`
        ),
        apiFetch<BatchModerationAnalytics>(`/script-batches/${paperSet.id}/analytics`).catch(
          () => null
        ),
      ]);
      if (analytics) setBatchAnalytics(analytics);
      const unfinishedId =
        analytics?.teacherDashboard?.nextUnfinishedScriptId ??
        detail.learnerScripts.find((s) => s.status !== "MARKED")?.id;
      const targetId = preferUnfinished
        ? unfinishedId ?? detail.learnerScripts[0]?.id
        : detail.learnerScripts[0]?.id;
      if (targetId) {
        navigate(`/scripts/${targetId}`);
      } else {
        navigate(`/assessments/${selectedAssessment.id}/scripts`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the marks.");
    } finally {
      setActionBusy("");
    }
  };

  const performSubmitToHod = async (scriptCount: number) => {
    if (!paperSet.id) return;
    const confirmed = window.confirm(
      `Send ${scriptCount} completed learner paper(s) to the Department Head?`
    );
    if (!confirmed) return;
    await apiFetch(`/script-batches/${paperSet.id}/submit-to-hod`, { method: "POST" });
    setSubmitIssues([]);
    setShowSubmitOverride(false);
    await loadSelectedDetails(selectedId);
    const analytics = await apiFetch<BatchModerationAnalytics>(
      `/script-batches/${paperSet.id}/analytics`
    ).catch(() => null);
    if (analytics) setBatchAnalytics(analytics);
  };

  const sendToDh = async (force = false) => {
    if (!paperSet.id) return;
    setActionBusy("dh");
    setError("");
    try {
      const detail = await apiFetch<{
        learnerScripts: Array<{ id: string; status: string }>;
      }>(`/script-batches/${paperSet.id}`);
      const scripts = detail.learnerScripts ?? [];
      if (scripts.length === 0) {
        setError("There are no learner papers to send yet.");
        return;
      }

      if (!force) {
        const scriptsForValidation = await Promise.all(
          scripts.map(async (s) => {
            const full = await apiFetch<{
              teacherTotal: number | null;
              status: string;
              questionMarks: Array<{
                questionNumber: string;
                maxMarks: number;
                teacherMark: number | null;
              }>;
              learner: { firstName: string; lastName: string };
            }>(`/scripts/${s.id}`);
            return {
              id: s.id,
              learnerName: `${full.learner.firstName} ${full.learner.lastName}`,
              status: full.status,
              teacherTotal: full.teacherTotal,
              questionMarks: full.questionMarks,
            };
          })
        );
        const validation = validateBatchBeforeHodSubmit({ scripts: scriptsForValidation });
        if (!validation.ok) {
          setSubmitIssues(validation.issues.map((i) => i.message));
          setShowSubmitOverride(true);
          return;
        }
      }

      await performSubmitToHod(scripts.length);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not send to the Department Head.";
      setError(
        /must be marked|remaining/i.test(raw)
          ? "Some learner papers still need to be finished. Open them and select “Finish This Learner” before sending."
          : raw
      );
    } finally {
      setActionBusy("");
    }
  };

  const exportMarks = async () => {
    if (!paperSet.id) return;
    setActionBusy("export");
    setError("");
    try {
      await apiDownload(
        `/script-batches/${paperSet.id}/export.csv`,
        `marks-${paperSet.id.slice(0, 8)}.csv`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export marks.");
    } finally {
      setActionBusy("");
    }
  };

  if (loading) {
    return <p>Opening Mark Papers...</p>;
  }

  return (
    <div className="sc-teacher-journey">
      <header className="sc-teacher-journey-header">
        <Link to="/dashboard" className="sc-detail-back">
          Back home
        </Link>
        <h1>Mark Papers</h1>
        <p>
          Follow one step at a time. ScriptCheck helps with the marking, and you
          approve the final marks.
        </p>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <ol className="sc-teacher-steps" aria-label="Mark Papers steps">
        <li className={selectedAssessment ? "is-done" : "is-current"}>Choose assessment</li>
        <li className={paperSet.paperCount > 0 ? "is-done" : selectedAssessment ? "is-current" : ""}>
          Upload papers
        </li>
        <li className={papersChecked ? "is-done" : paperSet.paperCount > 0 ? "is-current" : ""}>
          ScriptCheck marks
        </li>
        <li className={canReview ? "is-current" : ""}>Review marks</li>
        <li>Send, print, or export</li>
      </ol>

      {!selectedAssessment ? (
        <section className="sc-card sc-card-padded sc-teacher-step-card">
          <p className="sc-teacher-step-label">Step 1</p>
          <h2>Choose the assessment to mark.</h2>
          <p>Select an existing assessment, or create one first.</p>
          <label className="sc-marking-field">
            Assessment
            <select
              className="sc-input"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setError("");
              }}
            >
              <option value="">Choose an assessment</option>
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title} ({assessment.grade.name}, {assessment.subject.name})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="sc-btn sc-btn-primary" disabled={!selectedId}>
            Continue
          </button>
          <Link to="/assessments/new" className="sc-teacher-secondary-link">
            I need to create an assessment first
          </Link>
        </section>
      ) : !papersChecked ? (
        <section className="sc-card sc-card-padded sc-teacher-step-card">
          <p className="sc-teacher-step-label">Step 2</p>
          <h2>Upload the scanned learner papers.</h2>
          <p>
            You chose <strong>{selectedAssessment.title}</strong>. Next, add the
            scanned papers and tell ScriptCheck how many pages belong to one learner.
          </p>

          <label className="sc-marking-field">
            Pages for one learner
            <input
              className="sc-input"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Example: 4"
              value={pagesInput}
              onChange={(e) => {
                setPagesInput(e.target.value);
                setError("");
              }}
            />
          </label>

          <FileDropzone
            filesCount={files.length}
            dragOver={dragOver}
            onPick={() => fileRef.current?.click()}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false);
              if (e.dataTransfer.files.length) pickFiles(e.dataTransfer.files);
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) pickFiles(e.target.files);
            }}
          />

          {uploadProgress > 0 ? (
            <div className="sc-setup-progress">
              <div className="sc-setup-progress-bar" style={{ width: `${uploadProgress}%` }} />
            </div>
          ) : null}

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={uploading || !canUpload}
            onClick={() => void uploadPapers()}
          >
            {uploading ? "Uploading papers..." : "Upload papers"}
          </button>
        </section>
      ) : (
        <section className="sc-card sc-card-padded sc-teacher-step-card">
          <p className="sc-teacher-step-label">Steps 4 and 5</p>
          <h2>Review the marks before you approve them.</h2>
          <p>
            ScriptCheck has helped mark {paperSet.paperCount} learner paper(s).
            Open the marks, make any changes you need, then choose what to do next.
          </p>
          {selectedMarkingItem ? (
            <p className="sc-teacher-soft-note">
              Current status: {selectedMarkingItem.statusLabel || selectedMarkingItem.status}
            </p>
          ) : null}

          {teacherDash ? (
            <div className="sc-batch-dashboard" aria-label="Batch marking dashboard">
              <div className="sc-batch-dashboard-grid">
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.totalScripts}</span>
                  <span className="sc-batch-stat-label">Total scripts</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.notStarted}</span>
                  <span className="sc-batch-stat-label">Not Started</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.inProgress}</span>
                  <span className="sc-batch-stat-label">In Progress</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.marked}</span>
                  <span className="sc-batch-stat-label">Marked</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.submitted}</span>
                  <span className="sc-batch-stat-label">Submitted</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.averageMark ?? "—"}</span>
                  <span className="sc-batch-stat-label">Average mark</span>
                </div>
                <div className="sc-batch-stat">
                  <span className="sc-batch-stat-value">{teacherDash.flaggedForReview}</span>
                  <span className="sc-batch-stat-label">Flagged for review</span>
                </div>
              </div>
              <div className="sc-batch-progress">
                <div className="sc-batch-progress-meta">
                  <span>Progress</span>
                  <strong>{teacherDash.progressPercent}%</strong>
                </div>
                <div
                  className="sc-batch-progress-track"
                  role="progressbar"
                  aria-valuenow={teacherDash.progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="sc-batch-progress-fill"
                    style={{ width: `${Math.min(100, Math.max(0, teacherDash.progressPercent))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {allMarked ? (
            <div className="sc-batch-complete-banner">
              <p>All learner scripts have been marked.</p>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={actionBusy === "dh"}
                onClick={() => void sendToDh(false)}
              >
                {actionBusy === "dh" ? "Sending..." : "Submit to HOD"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="sc-btn sc-btn-primary sc-btn-continue-marking"
              disabled={actionBusy === "review"}
              onClick={() => void openReview(true)}
            >
              {actionBusy === "review" ? "Opening..." : "Continue Marking"}
            </button>
          )}

          {!allMarked ? (
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={actionBusy === "review"}
              onClick={() => void openReview(true)}
            >
              {actionBusy === "review" ? "Opening..." : "Review marks"}
            </button>
          ) : null}

          {showSubmitOverride && submitIssues.length > 0 ? (
            <div className="sc-submit-review-panel" role="region" aria-label="Submit validation">
              <h3>Review before Submit to HOD</h3>
              <ul>
                {submitIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <div className="sc-form-actions">
                <button
                  type="button"
                  className="sc-btn sc-btn-secondary"
                  onClick={() => {
                    setShowSubmitOverride(false);
                    void openReview(true);
                  }}
                >
                  Return to marking
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn-primary"
                  disabled={actionBusy === "dh"}
                  onClick={() => {
                    const ok = window.confirm(
                      "Override validation issues and submit to HOD anyway? This is recorded in your confirmation."
                    );
                    if (ok) void sendToDh(true);
                  }}
                >
                  Override and submit
                </button>
              </div>
            </div>
          ) : null}

          <div className="sc-teacher-final-actions" aria-label="Final actions">
            {!allMarked ? (
              <button
                type="button"
                className="sc-btn sc-btn-secondary"
                disabled={actionBusy === "dh"}
                onClick={() => void sendToDh(false)}
              >
                {actionBusy === "dh" ? "Sending..." : "Send to Department Head"}
              </button>
            ) : null}
            <button type="button" className="sc-btn sc-btn-secondary" onClick={() => window.print()}>
              Print
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={actionBusy === "export"}
              onClick={() => void exportMarks()}
            >
              {actionBusy === "export" ? "Downloading..." : "Download Results"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
