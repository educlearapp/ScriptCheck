import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import {
  bulkUploadScripts,
  getMarkingOverview,
  getSetupStatus,
  type MarkingOverviewItem,
} from "../../services/assessmentSetupApi";
import type { Assessment } from "../../types";
import { formatStatusLabel } from "../../utils/statusLabels";
import "../dashboard/Dashboard.css";
import "./MarkingOverview.css";

type SelectedMeta = {
  id: string;
  title: string;
  setupComplete: boolean;
  pagesPerScript: number | null;
  scriptCount: number;
  batchId: string | null;
};

function resolveSelectedMeta(
  selectedId: string,
  items: MarkingOverviewItem[],
  assessments: Assessment[]
): SelectedMeta | null {
  const item = items.find((i) => i.id === selectedId);
  if (item) {
    return {
      id: item.id,
      title: item.title,
      setupComplete: item.setupComplete,
      pagesPerScript: item.pagesPerScript,
      scriptCount: item.scriptCount,
      batchId: item.batchId,
    };
  }
  const assessment = assessments.find((a) => a.id === selectedId);
  if (!assessment) return null;
  return {
    id: assessment.id,
    title: assessment.title,
    setupComplete: assessment.setupComplete ?? false,
    pagesPerScript: assessment.pagesPerScript ?? null,
    scriptCount: 0,
    batchId: null,
  };
}

export default function MarkingOverview() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<MarkingOverviewItem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pagesPerScript, setPagesPerScript] = useState<number | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getMarkingOverview().then((d) => d.items).catch(() => [] as MarkingOverviewItem[]),
      apiFetch<Assessment[]>("/assessments").catch(() => [] as Assessment[]),
    ])
      .then(([marking, all]) => {
        setItems(marking);
        setAssessments(all);
        setSelectedId((prev) => {
          if (prev) return prev;
          if (marking[0]) return marking[0].id;
          if (all[0]) return all[0].id;
          return "";
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => resolveSelectedMeta(selectedId, items, assessments),
    [selectedId, items, assessments]
  );

  useEffect(() => {
    if (!selectedId) {
      setPagesPerScript(null);
      return;
    }
    if (selected?.pagesPerScript != null) {
      setPagesPerScript(selected.pagesPerScript);
      return;
    }
    getSetupStatus(selectedId)
      .then((s) => setPagesPerScript(s.pagesPerScript))
      .catch(() => setPagesPerScript(null));
  }, [selectedId, selected?.pagesPerScript]);

  const setupPath = selectedId
    ? selected?.setupComplete
      ? `/assessments/${selectedId}/scripts`
      : `/assessments/${selectedId}/setup`
    : "/assessments/new";

  const hasPagesPerScript = pagesPerScript != null && pagesPerScript >= 1;
  const hasScripts = (selected?.scriptCount ?? 0) > 0;
  const hasBatch = !!selected?.batchId;

  const flowSteps = useMemo(
    () => [
      { n: 1, label: "Select assessment", done: !!selectedId },
      { n: 2, label: "Upload scripts", done: hasBatch || hasScripts || bulkFiles.length > 0 },
      { n: 3, label: "Verify scripts", done: hasScripts },
      { n: 4, label: "Start marking", done: hasScripts && hasPagesPerScript },
    ],
    [selectedId, hasBatch, hasScripts, bulkFiles.length, hasPagesPerScript]
  );

  const activeStep = flowSteps.find((s) => !s.done)?.n ?? 4;

  const ensureBatch = async (assessmentId: string): Promise<string> => {
    const batches = await apiFetch<{ id: string }[]>(
      `/assessments/${assessmentId}/script-batches`
    );
    if (batches[0]) return batches[0].id;
    const batch = await apiFetch<{ id: string }>(
      `/assessments/${assessmentId}/script-batches`,
      { method: "POST", body: JSON.stringify({ title: selected?.title ?? "Script batch" }) }
    );
    return batch.id;
  };

  const handleBulkUpload = async () => {
    if (!selectedId || !bulkFiles.length) return;
    if (bulkFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    if (!hasPagesPerScript) {
      setError("Set Pages Per Script in Assessment Setup before bulk upload.");
      navigate(`/assessments/${selectedId}/setup`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const batchId = await ensureBatch(selectedId);
      const result = await bulkUploadScripts(batchId, bulkFiles, setUploadProgress);
      navigate(`/assessments/${selectedId}/scripts/verify/${batchId}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setError("");
    setBulkFiles(list);
  };

  if (loading) return <p>Loading marking queue…</p>;

  return (
    <div className="sc-dash sc-marking-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Marking</h1>
          <p className="sc-page-subtitle">
            Select an assessment, upload scripts, verify splitting, then open the marking workspace.
          </p>
        </div>
        <div className="sc-dash-meta">
          <span className="sc-dash-meta-pill">
            Awaiting: <strong>{items.length}</strong>
          </span>
        </div>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <ol className="sc-marking-steps" aria-label="Marking workflow">
        {flowSteps.map((step) => (
          <li
            key={step.n}
            className={`sc-marking-step${step.done ? " is-done" : ""}${step.n === activeStep ? " is-active" : ""}`}
          >
            <span className="sc-marking-step-num">{step.done ? "✓" : step.n}</span>
            <span className="sc-marking-step-label">{step.label}</span>
          </li>
        ))}
      </ol>

      <div className="sc-card sc-card-padded sc-marking-workflow">
        <section className="sc-marking-workflow-panel" aria-labelledby="marking-step-1">
          <h2 id="marking-step-1" className="sc-marking-panel-title">
            <span className="sc-marking-panel-step">1</span>
            Select Assessment
          </h2>
          <div className="sc-marking-select-row">
            <label className="sc-marking-field">
              Assessment
              <select
                className="sc-input"
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setBulkFiles([]);
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
            <div className="sc-marking-field">
              <span className="sc-marking-field-label">Pages Per Script</span>
              <div className="sc-marking-readonly">
                {hasPagesPerScript ? (
                  <strong>{pagesPerScript}</strong>
                ) : (
                  <span className="sc-muted">Not set</span>
                )}
              </div>
              {selectedId ? (
                <Link
                  to={`/assessments/${selectedId}/setup`}
                  className="sc-marking-setup-link"
                >
                  {hasPagesPerScript ? "Change in Setup" : "Set in Assessment Setup"}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="sc-marking-stats">
            <div className="sc-marking-stat">
              <div className="sc-marking-stat-label">Scripts in Assessment</div>
              <div className="sc-marking-stat-value">{selected?.scriptCount ?? "—"}</div>
            </div>
            <div className="sc-marking-stat">
              <div className="sc-marking-stat-label">Setup Status</div>
              <div className="sc-marking-stat-value sc-marking-stat-text">
                {selected?.setupComplete ? "Complete" : "Incomplete"}
              </div>
            </div>
            <div className="sc-marking-stat">
              <div className="sc-marking-stat-label">Pages Per Script</div>
              <div className="sc-marking-stat-value">
                {hasPagesPerScript ? pagesPerScript : "—"}
              </div>
            </div>
          </div>

          <div className="sc-marking-actions">
            <Link to="/assessments/new" className="sc-btn sc-btn-ghost">
              Create Assessment
            </Link>
            {selectedId ? (
              <Link to={setupPath} className="sc-btn sc-btn-ghost">
                Assessment Setup
              </Link>
            ) : null}
          </div>
        </section>

        <section className="sc-marking-workflow-panel" aria-labelledby="marking-step-2">
          <h2 id="marking-step-2" className="sc-marking-panel-title">
            <span className="sc-marking-panel-step">2</span>
            Upload Scripts
          </h2>
          <p className="sc-marking-hint">
            {UPLOAD_FILES_HINT} Scanned PDFs are split using Pages Per Script
            {hasPagesPerScript ? ` (${pagesPerScript} per script)` : ""}.
          </p>
          {!hasPagesPerScript && selectedId ? (
            <p className="sc-marking-warning">
              Set Pages Per Script in Assessment Setup before uploading.
            </p>
          ) : null}
          <div
            className={`sc-marking-dropzone${dragOver ? " is-dragover" : ""}${!selectedId || !hasPagesPerScript ? " is-disabled" : ""}`}
            onDragOver={(e) => {
              if (!selectedId || !hasPagesPerScript) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!selectedId || !hasPagesPerScript) return;
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => {
              if (selectedId && hasPagesPerScript) fileInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectedId && hasPagesPerScript) {
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={selectedId && hasPagesPerScript ? 0 : -1}
            aria-disabled={!selectedId || !hasPagesPerScript}
          >
            <strong>Drag & drop scripts here</strong>
            <p>or click to browse · PDF, PNG, JPG · max {MAX_UPLOAD_FILES} files</p>
            {bulkFiles.length > 0 ? (
              <p>
                <strong>{bulkFiles.length}</strong> file(s) selected
              </p>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
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
            disabled={uploading || !selectedId || !bulkFiles.length || !hasPagesPerScript}
            onClick={() => void handleBulkUpload()}
          >
            {uploading ? "Uploading…" : "Upload & Verify"}
          </button>
        </section>
      </div>

      {selectedId ? (
        <div className="sc-card sc-card-padded sc-marking-next-steps">
          <h2 className="sc-marking-panel-title">
            <span className="sc-marking-panel-step">3–4</span>
            Verify &amp; Start Marking
          </h2>
          <p className="sc-marking-hint">
            After upload, review script splitting on the verification screen, then open the marking
            workspace.
          </p>
          <div className="sc-marking-actions">
            {hasBatch ? (
              <Link
                to={`/assessments/${selectedId}/scripts/verify/${selected.batchId}`}
                className="sc-btn sc-btn-ghost"
              >
                Verify Scripts
              </Link>
            ) : (
              <button type="button" className="sc-btn sc-btn-ghost" disabled>
                Verify Scripts
              </button>
            )}
            {hasScripts ? (
              <Link
                to={`/assessments/${selectedId}/scripts`}
                className="sc-btn sc-btn-primary"
              >
                Start Marking
              </Link>
            ) : (
              <button type="button" className="sc-btn sc-btn-primary" disabled>
                Start Marking
              </button>
            )}
            <Link
              to={`/assessments/${selectedId}/scripts`}
              className="sc-btn sc-btn-ghost"
            >
              Upload via Scripts Page
            </Link>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="sc-card sc-marking-queue">
          <div className="sc-marking-queue-header">
            <h2 className="sc-marking-panel-title" style={{ margin: 0 }}>
              Marking Queue
            </h2>
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
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedId ? "is-selected" : undefined}
                  >
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
                      <div className="sc-marking-table-actions">
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost sc-marking-table-btn"
                          onClick={() => setSelectedId(item.id)}
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
                        <Link
                          to={
                            item.setupComplete
                              ? `/assessments/${item.id}/scripts`
                              : `/assessments/${item.id}/setup`
                          }
                          className="sc-btn sc-btn-ghost sc-marking-table-btn"
                        >
                          Upload
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="sc-card sc-card-padded">
          <p className="sc-dash-empty">No assessments awaiting marking.</p>
          <div className="sc-marking-empty-actions">
            <Link to="/assessments/new" className="sc-btn sc-btn-primary">
              Create Assessment
            </Link>
            <Link to="/assessments" className="sc-btn sc-btn-ghost">
              View Assessments
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
