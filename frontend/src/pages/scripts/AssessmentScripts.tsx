import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { canViewResults, hasPermission } from "../../auth/permissions";
import AssessmentIntelligenceHeader from "../../components/assessment/AssessmentIntelligenceHeader";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import { bulkUploadScripts } from "../../services/assessmentSetupApi";
import { formatStatusLabel } from "../../utils/statusLabels";
import type { AssessmentDetail, LearnerScriptSummary, ScriptBatchSummary } from "../../types";
import "../../components/intelligence/AssessmentHealthReport.css";
import "./Scripts.css";

type BatchDetail = ScriptBatchSummary & {
  learnerScripts: LearnerScriptSummary[];
  assessment: { id: string; title: string; totalMarks: number; grade: { name: string }; subject: { name: string } };
};

export default function AssessmentScripts() {
  const { id: assessmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [batches, setBatches] = useState<ScriptBatchSummary[]>([]);
  const [activeBatch, setActiveBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [batchTitle, setBatchTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const loadBatches = useCallback(() => {
    if (!assessmentId) return;
    apiFetch<ScriptBatchSummary[]>(`/assessments/${assessmentId}/script-batches`)
      .then(setBatches)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load batches")
      );
  }, [assessmentId]);

  const loadBatchDetail = useCallback((batchId: string) => {
    apiFetch<BatchDetail>(`/script-batches/${batchId}`)
      .then(setActiveBatch)
      .catch((err) =>
        setActionError(err instanceof Error ? err.message : "Failed to load batch")
      );
  }, []);

  useEffect(() => {
    if (!assessmentId) return;
    setLoading(true);
    Promise.all([
      apiFetch<AssessmentDetail>(`/assessments/${assessmentId}`),
      apiFetch<ScriptBatchSummary[]>(`/assessments/${assessmentId}/script-batches`),
    ])
      .then(([detail, batchList]) => {
        setAssessment(detail);
        setBatches(batchList);
        if (batchList[0]) loadBatchDetail(batchList[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [assessmentId, loadBatchDetail]);

  const handleCreateBatch = async () => {
    if (!assessmentId) return;
    setCreating(true);
    setActionError("");
    try {
      const batch = await apiFetch<ScriptBatchSummary>(
        `/assessments/${assessmentId}/script-batches`,
        { method: "POST", body: JSON.stringify({ title: batchTitle || assessment?.title }) }
      );
      setBatchTitle("");
      loadBatches();
      loadBatchDetail(batch.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setCreating(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!activeBatch || !bulkFiles.length) return;
    if (bulkFiles.length > MAX_UPLOAD_FILES) {
      setActionError(UPLOAD_FILES_HINT);
      return;
    }
    setBulkUploading(true);
    setActionError("");
    try {
      const result = await bulkUploadScripts(activeBatch.id, bulkFiles, setUploadProgress);
      setBulkFiles([]);
      loadBatchDetail(activeBatch.id);
      loadBatches();
      navigate(`/assessments/${assessmentId}/scripts/verify/${activeBatch.id}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setBulkUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSubmitBatch = async () => {
    if (!activeBatch) return;
    setSubmitting(true);
    setActionError("");
    try {
      await apiFetch(`/script-batches/${activeBatch.id}/submit-to-hod`, { method: "POST" });
      loadBatchDetail(activeBatch.id);
      loadBatches();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Loading scripts…</p>;

  if (error || !assessment) {
    return (
      <div>
        <p className="sc-error">{error || "Assessment not found"}</p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost">Back</Link>
      </div>
    );
  }

  const canCreate = hasPermission(user, "scripts.create");
  const canSubmit = hasPermission(user, "scripts.submit");
  const canSubmitBatch =
    activeBatch &&
    ["MARKING", "TEACHER_REVIEW", "RETURNED_TO_TEACHER"].includes(activeBatch.status);
  const pagesPerScript = assessment.pagesPerScript;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <Link to={`/assessments/${assessmentId}`} className="sc-detail-back">← Assessment</Link>
          <h1 className="sc-page-title">Assessment Scripts</h1>
          <p className="sc-page-subtitle">
            {assessment.title} · {assessment.subject.name} · {assessment.grade.name}
            {pagesPerScript ? ` · ${pagesPerScript} pages per script` : ""}
          </p>
          {assessmentId ? <AssessmentIntelligenceHeader assessmentId={assessmentId} /> : null}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {!assessment.setupComplete ? (
            <Link to={`/assessments/${assessmentId}/setup`} className="sc-btn sc-btn-primary">
              Complete Setup
            </Link>
          ) : null}
          {canViewResults(user, assessment.creatorTeacher.id) ? (
            <Link to={`/assessments/${assessmentId}/results`} className="sc-btn sc-btn-ghost">
              View Results
            </Link>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <div className="sc-grid-2" style={{ gap: "1rem", marginTop: "1rem", alignItems: "start" }}>
        <div className="sc-card" style={{ padding: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem", color: "var(--sc-gold-light)" }}>Script Batches</h3>
          {batches.length === 0 ? (
            <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>No batches yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {batches.map((b) => (
                <li key={b.id} style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    className={`sc-btn sc-btn-ghost${activeBatch?.id === b.id ? " is-active" : ""}`}
                    style={{ width: "100%", textAlign: "left", justifyContent: "flex-start" }}
                    onClick={() => loadBatchDetail(b.id)}
                  >
                    {b.title}
                    <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
                      {formatStatusLabel(b.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canCreate ? (
            <div style={{ marginTop: "1rem" }}>
              <input
                className="sc-input"
                placeholder="Batch title"
                value={batchTitle}
                onChange={(e) => setBatchTitle(e.target.value)}
              />
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                style={{ marginTop: "0.5rem", width: "100%" }}
                disabled={creating}
                onClick={handleCreateBatch}
              >
                {creating ? "Creating…" : "Create script batch"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          {activeBatch ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>{activeBatch.title}</h3>
                  <p className="sc-page-subtitle" style={{ margin: "0.25rem 0 0" }}>
                    {activeBatch.totalScripts} scripts · {formatStatusLabel(activeBatch.status)}
                  </p>
                </div>
                <div className="sc-form-actions" style={{ marginTop: 0 }}>
                  <Link
                    to={`/script-batches/${activeBatch.id}/analytics`}
                    className="sc-btn sc-btn-ghost"
                  >
                    Analytics
                  </Link>
                  {activeBatch.totalScripts > 0 ? (
                    <Link
                      to={`/assessments/${assessmentId}/scripts/verify/${activeBatch.id}`}
                      className="sc-btn sc-btn-ghost"
                    >
                      Verify Scripts
                    </Link>
                  ) : null}
                  {canSubmit && canSubmitBatch ? (
                    <button
                      type="button"
                      className="sc-btn sc-btn-primary"
                      disabled={submitting}
                      onClick={handleSubmitBatch}
                    >
                      {submitting ? "Submitting…" : "Submit batch to DH"}
                    </button>
                  ) : null}
                </div>
              </div>

              {canCreate && pagesPerScript && ["DRAFT", "MARKING", "RETURNED_TO_TEACHER"].includes(activeBatch.status) ? (
                <div style={{ marginTop: "1rem", padding: "1rem", border: "2px dashed var(--sc-gold)", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 0.5rem" }}>Bulk Script Upload</h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)", margin: "0 0 0.75rem" }}>
                    Upload scanned scripts in bulk. The system automatically splits pages ({pagesPerScript} per script).{" "}
                    {UPLOAD_FILES_HINT}
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > MAX_UPLOAD_FILES) {
                        setActionError(UPLOAD_FILES_HINT);
                        return;
                      }
                      setBulkFiles(files);
                    }}
                  />
                  {bulkFiles.length > 0 ? (
                    <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                      {bulkFiles.length} file(s) selected
                    </p>
                  ) : null}
                  {uploadProgress > 0 ? (
                    <div style={{ height: 4, background: "rgba(255,255,255,0.1)", marginTop: "0.5rem", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${uploadProgress}%`, background: "var(--sc-gold)" }} />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="sc-btn sc-btn-primary"
                    style={{ marginTop: "0.75rem" }}
                    disabled={bulkUploading || !bulkFiles.length}
                    onClick={() => void handleBulkUpload()}
                  >
                    {bulkUploading ? "Processing…" : "Upload & Auto-Split Scripts"}
                  </button>
                </div>
              ) : !pagesPerScript ? (
                <div style={{ marginTop: "1rem" }}>
                  <Link to={`/assessments/${assessmentId}/setup`} className="sc-btn sc-btn-ghost">
                    Complete setup to enable bulk upload
                  </Link>
                </div>
              ) : null}

              <div className="sc-table-wrap" style={{ marginTop: "1rem" }}>
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Learner</th>
                      <th>Pages</th>
                      <th>Status</th>
                      <th>Teacher</th>
                      <th>Final</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBatch.learnerScripts.map((s) => (
                      <tr key={s.id}>
                        <td>{s.scriptNumber}</td>
                        <td>{s.learner.firstName} {s.learner.lastName}</td>
                        <td>{s.pageCount ?? "—"}</td>
                        <td><span className="sc-badge sc-badge-muted">{formatStatusLabel(s.status)}</span></td>
                        <td>{s.teacherTotal ?? "—"}</td>
                        <td>{s.finalTotal ?? "—"}</td>
                        <td>
                          <Link to={`/scripts/${s.id}`} className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--sc-text-muted)" }}>Select or create a batch to manage learner scripts.</p>
          )}
        </div>
      </div>
    </div>
  );
}
