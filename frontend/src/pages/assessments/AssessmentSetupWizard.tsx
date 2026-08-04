import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import {
  bulkUploadScripts,
  completeSetup,
  getSetupStatus,
  updateSetup,
  uploadMasterFile,
  type AssessmentSetupStatus,
} from "../../services/assessmentSetupApi";
import {
  MAX_UPLOAD_FILES,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import type { AssessmentDetail, AssessmentType } from "../../types";
import "./AssessmentSetupWizard.css";

const ASSESSMENT_TYPES: { value: AssessmentType; label: string }[] = [
  { value: "TEST", label: "Test" },
  { value: "EXAM", label: "Examination" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "SBA_TASK", label: "SBA" },
  { value: "PRACTICAL", label: "Practical" },
];

type Step = 1 | 2 | 3;

export default function AssessmentSetupWizard() {
  const { id: assessmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromHavePaper = searchParams.get("from") === "have-paper";

  const [step, setStep] = useState<Step>(fromHavePaper ? 2 : 1);
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [setupStatus, setSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    term: "",
    assessmentType: "TEST" as AssessmentType,
    totalMarks: "",
    questionCount: "",
    pagesPerScript: "",
    memorandumAvailable: false,
    rubricAvailable: false,
  });

  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      const [detail, status] = await Promise.all([
        apiFetch<AssessmentDetail>(`/assessments/${assessmentId}`),
        getSetupStatus(assessmentId),
      ]);
      setAssessment(detail);
      setSetupStatus(status);
      setForm({
        title: detail.title,
        term: detail.term ?? "",
        assessmentType: detail.assessmentType,
        totalMarks: String(detail.totalMarks),
        questionCount: detail.questionCount != null ? String(detail.questionCount) : "",
        pagesPerScript: detail.pagesPerScript != null ? String(detail.pagesPerScript) : "",
        memorandumAvailable: detail.memorandumAvailable ?? false,
        rubricAvailable: detail.rubricAvailable ?? false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveStep1 = async () => {
    if (!assessmentId) return;
    setSaving(true);
    setError("");
    try {
      await updateSetup(assessmentId, {
        title: form.title,
        term: form.term || null,
        assessmentType: form.assessmentType,
        totalMarks: Number(form.totalMarks),
        questionCount: form.questionCount ? Number(form.questionCount) : null,
        pagesPerScript: form.pagesPerScript ? Number(form.pagesPerScript) : null,
        memorandumAvailable: form.memorandumAvailable,
        rubricAvailable: form.rubricAvailable,
      });
      const status = await getSetupStatus(assessmentId);
      setSetupStatus(status);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleMasterUpload = async (
    docKey: "questionPaper" | "memorandum" | "rubric" | "supporting",
    file: File
  ) => {
    if (!assessmentId) return;
    setError("");
    try {
      await uploadMasterFile(assessmentId, docKey, file);
      const status = await getSetupStatus(assessmentId);
      setSetupStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleCompleteMaster = async () => {
    if (!assessmentId) return;
    setSaving(true);
    setError("");
    try {
      await completeSetup(assessmentId);
      const status = await getSetupStatus(assessmentId);
      setSetupStatus(status);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup incomplete");
    } finally {
      setSaving(false);
    }
  };

  const ensureBatch = async (): Promise<string> => {
    if (batchId) return batchId;
    const batches = await apiFetch<{ id: string }[]>(
      `/assessments/${assessmentId}/script-batches`
    );
    if (batches[0]) {
      setBatchId(batches[0].id);
      return batches[0].id;
    }
    const batch = await apiFetch<{ id: string }>(
      `/assessments/${assessmentId}/script-batches`,
      { method: "POST", body: JSON.stringify({ title: form.title }) }
    );
    setBatchId(batch.id);
    return batch.id;
  };

  const handleBulkUpload = async () => {
    if (!assessmentId || !bulkFiles.length) return;
    if (bulkFiles.length > MAX_UPLOAD_FILES) {
      setError(UPLOAD_FILES_HINT);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await ensureBatch();
      const result = await bulkUploadScripts(id, bulkFiles, setUploadProgress);
      navigate(`/assessments/${assessmentId}/scripts/verify/${id}`, {
        state: { verification: result.verification },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  if (loading) return <p>Loading assessment setup…</p>;
  if (!assessment || !assessmentId) {
    return <p className="sc-error">Assessment not found</p>;
  }

  const master = setupStatus?.masterFiles;

  return (
    <div className="sc-setup-wizard">
      <Link
        to={fromHavePaper ? "/assessments/new" : `/assessments/${assessmentId}`}
        className="sc-detail-back"
      >
        {fromHavePaper ? "← Back to Create Assessment" : "← Back to Assessment"}
      </Link>
      <h1 className="sc-page-title">
        {fromHavePaper ? "Upload Your Paper" : "Assessment Setup"}
      </h1>
      <p className="sc-page-subtitle">
        {fromHavePaper
          ? "Upload your question paper and memorandum (if you have one). Then go to Mark Papers."
          : "Add assessment details and upload your paper files before marking."}
      </p>

      <div className="sc-setup-steps">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`sc-setup-step${step === s ? " is-active" : step > s ? " is-done" : ""}`}
          >
            Step {s}
          </div>
        ))}
      </div>

      {error ? <p className="sc-error">{error}</p> : null}

      {step === 1 ? (
        <div className="sc-card sc-card-padded">
          <h2>Step 1 — Assessment Information</h2>
          <div className="sc-form-grid sc-form-grid-2">
            <label>
              Grade
              <input className="sc-input" value={assessment.grade.name} disabled />
            </label>
            <label>
              Subject
              <input className="sc-input" value={assessment.subject.name} disabled />
            </label>
            <label>
              Assessment Name
              <input
                className="sc-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Term
              <input
                className="sc-input"
                placeholder="e.g. Term 2"
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
              />
            </label>
            <label>
              Assessment Type
              <select
                className="sc-input"
                value={form.assessmentType}
                onChange={(e) =>
                  setForm({ ...form, assessmentType: e.target.value as AssessmentType })
                }
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Total Marks
              <input
                className="sc-input"
                type="number"
                min={1}
                value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
              />
            </label>
            <label>
              Number of Questions
              <input
                className="sc-input"
                type="number"
                min={0}
                value={form.questionCount}
                onChange={(e) => setForm({ ...form, questionCount: e.target.value })}
              />
            </label>
            <label>
              Pages per learner answer script
              <input
                className="sc-input"
                type="number"
                min={1}
                value={form.pagesPerScript}
                onChange={(e) => setForm({ ...form, pagesPerScript: e.target.value })}
              />
              <span className="sc-muted" style={{ fontSize: "0.8rem" }}>
                Used only to split scanned learner answers — not the question paper.
              </span>
            </label>
            <label className="sc-setup-checkbox">
              <input
                type="checkbox"
                checked={form.memorandumAvailable}
                onChange={(e) =>
                  setForm({ ...form, memorandumAvailable: e.target.checked })
                }
              />
              Memorandum Available
            </label>
            <label className="sc-setup-checkbox">
              <input
                type="checkbox"
                checked={form.rubricAvailable}
                onChange={(e) => setForm({ ...form, rubricAvailable: e.target.checked })}
              />
              Rubric Available
            </label>
          </div>
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={saving}
              onClick={() => void handleSaveStep1()}
            >
              {saving ? "Saving…" : "Continue to Master Upload"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="sc-card sc-card-padded">
          <h2>{fromHavePaper ? "Upload question paper and memorandum" : "Step 2 — Upload paper files"}</h2>
          <p className="sc-page-subtitle">
            {fromHavePaper
              ? `Choose your question paper file, and your memorandum if you have one. ${UPLOAD_FILES_HINT}`
              : `Upload the main paper files for this assessment. ${UPLOAD_FILES_HINT}`}
          </p>
          <div className="sc-setup-upload-grid">
            {(
              [
                { key: "questionPaper" as const, label: "Question Paper", required: true },
                { key: "memorandum" as const, label: "Memorandum", required: form.memorandumAvailable },
                { key: "rubric" as const, label: "Rubric", required: form.rubricAvailable },
                { key: "supporting" as const, label: "Supporting Documents", required: false },
              ] as const
            ).map((item) => (
              <div key={item.key} className="sc-setup-upload-card">
                <h3>
                  {item.label}
                  {item.required ? " *" : ""}
                </h3>
                {(item.key === "supporting"
                  ? (master?.supportingDocuments ?? 0) > 0
                  : master?.[item.key]) ? (
                  <span className="sc-badge sc-badge-success">Uploaded</span>
                ) : (
                  <span className="sc-badge sc-badge-muted">Not uploaded</span>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  multiple={item.key === "supporting"}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    if (files.length > MAX_UPLOAD_FILES) {
                      setError(UPLOAD_FILES_HINT);
                      return;
                    }
                    for (const file of files) {
                      void handleMasterUpload(item.key, file);
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div className="sc-form-actions">
            {!fromHavePaper ? (
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
            ) : null}
            {fromHavePaper ? (
              <Link to="/marking" className="sc-btn sc-btn-primary">
                Go to Mark Papers
              </Link>
            ) : (
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={saving}
                onClick={() => void handleCompleteMaster()}
              >
                {saving ? "Completing…" : "Continue to learner paper upload"}
              </button>
            )}
            {fromHavePaper ? (
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                disabled={saving}
                onClick={() => void handleCompleteMaster()}
              >
                {saving ? "Saving…" : "Also upload learner papers"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="sc-card sc-card-padded">
          <h2>Step 3 — Bulk Script Upload</h2>
          <p className="sc-page-subtitle">
            Upload scanned learner scripts in bulk. The system splits pages automatically using{" "}
            <strong>{form.pagesPerScript || setupStatus?.pagesPerScript} pages per learner answer script</strong>. {UPLOAD_FILES_HINT}
          </p>
          <div className="sc-setup-bulk-zone">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              onChange={(e) => setBulkFiles(Array.from(e.target.files ?? []))}
            />
            {bulkFiles.length > 0 ? (
              <p>{bulkFiles.length} file(s) selected — {bulkFiles.reduce((s, f) => s + f.size, 0) > 0 ? "ready to upload" : ""}</p>
            ) : null}
            {uploadProgress > 0 ? (
              <div className="sc-setup-progress">
                <div className="sc-setup-progress-bar" style={{ width: `${uploadProgress}%` }} />
              </div>
            ) : null}
          </div>
          <div className="sc-form-actions">
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <Link
              to={`/assessments/${assessmentId}/scripts`}
              className="sc-btn sc-btn-ghost"
            >
              Skip — Upload Later
            </Link>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={saving || !bulkFiles.length}
              onClick={() => void handleBulkUpload()}
            >
              {saving ? "Processing…" : "Upload & Verify Scripts"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
