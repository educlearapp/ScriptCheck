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
import type { Assessment } from "../../types";
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
      return;
    }
    void loadSelectedDetails(selectedId);
  }, [selectedId, loadSelectedDetails]);

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

  const openReview = async () => {
    if (!paperSet.id || !selectedAssessment) return;
    setActionBusy("review");
    setError("");
    try {
      const detail = await apiFetch<{ learnerScripts: Array<{ id: string }> }>(
        `/script-batches/${paperSet.id}`
      );
      const firstPaperId = detail.learnerScripts[0]?.id;
      if (firstPaperId) {
        navigate(`/scripts/${firstPaperId}`);
      } else {
        navigate(`/assessments/${selectedAssessment.id}/scripts`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the marks.");
    } finally {
      setActionBusy("");
    }
  };

  const sendToDh = async () => {
    if (!paperSet.id) return;
    setActionBusy("dh");
    setError("");
    try {
      await apiFetch(`/script-batches/${paperSet.id}/submit-to-hod`, { method: "POST" });
      await loadSelectedDetails(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send to the Department Head.");
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

          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={actionBusy === "review"}
            onClick={() => void openReview()}
          >
            {actionBusy === "review" ? "Opening..." : "Review marks"}
          </button>

          <div className="sc-teacher-final-actions" aria-label="Final actions">
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={actionBusy === "dh"}
              onClick={() => void sendToDh()}
            >
              {actionBusy === "dh" ? "Sending..." : "Send to Department Head"}
            </button>
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
