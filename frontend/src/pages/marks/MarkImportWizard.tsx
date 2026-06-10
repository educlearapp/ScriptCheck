import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL } from "../../api";
import { getAuthToken } from "../../auth/session";
import { apiFetch } from "../../api";
import type { MarkImportParseResult, MarkImportValidation } from "../../types";
import ConcessionAlerts from "../../components/concessions/ConcessionAlerts";
import "./Marks.css";

type Step = 1 | 2 | 3 | 4 | 5;

type ColumnMapping = {
  learnerNumber: string;
  learnerName: string;
  mark: string;
  comment: string;
};

const STEPS = ["Upload", "Map columns", "Validate", "Preview", "Import"];

async function uploadMarkFile(
  assessmentId: string,
  file: File
): Promise<MarkImportParseResult> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    `${API_URL}/mark-import/assessments/${assessmentId}/parse`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Upload failed (${res.status})`);
  }
  return data as MarkImportParseResult;
}

export default function MarkImportWizard() {
  const { id: assessmentId } = useParams<{ id: string }>();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<MarkImportParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    learnerNumber: "",
    learnerName: "",
    mark: "",
    comment: "",
  });
  const [validation, setValidation] = useState<MarkImportValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const applySuggestedMapping = useCallback((result: MarkImportParseResult) => {
    const s = result.suggestedMapping;
    setMapping({
      learnerNumber: s.learnerNumber ?? "",
      learnerName: s.learnerName ?? "",
      mark: s.mark ?? "",
      comment: s.comment ?? "",
    });
  }, []);

  const handleFileSelect = async (selected: File) => {
    if (!assessmentId) return;
    setError("");
    setLoading(true);
    setFile(selected);

    try {
      const result = await uploadMarkFile(assessmentId, selected);
      setParsed(result);
      applySuggestedMapping(result);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const runValidation = async () => {
    if (!assessmentId || !parsed) return;
    setError("");
    setLoading(true);

    try {
      const result = await apiFetch<MarkImportValidation>(
        `/mark-import/assessments/${assessmentId}/validate`,
        {
          method: "POST",
          body: JSON.stringify({ rows: parsed.rows, mapping }),
        }
      );
      setValidation(result);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    if (!assessmentId || !validation) return;
    setError("");
    setLoading(true);

    try {
      const result = await apiFetch<{ imported: number; skipped: number }>(
        `/mark-import/assessments/${assessmentId}/import`,
        {
          method: "POST",
          body: JSON.stringify({
            validRows: validation.validRows,
            fileName: parsed?.fileName,
          }),
        }
      );
      setImportResult(result);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  if (!assessmentId) return null;

  return (
    <div className="marks-page">
      <div className="marks-header">
        <div>
          <h1 className="sc-page-title">Import Marks</h1>
          <p className="sc-page-subtitle">
            Upload a CSV or XLSX file to import assessment marks in bulk.
          </p>
        </div>
        <Link to={`/assessments/${assessmentId}`} className="sc-btn sc-btn-ghost">
          Back to assessment
        </Link>
      </div>

      <ConcessionAlerts assessmentId={assessmentId} compact />

      <div className="marks-wizard-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`marks-wizard-step${step === i + 1 ? " is-active" : ""}${step > i + 1 ? " is-done" : ""}`}
          >
            <span className="marks-wizard-step-num">{i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {step === 1 && (
        <div className="sc-card marks-step-card">
          <h2>Step 1 — Upload file</h2>
          <p>Supported formats: CSV, XLSX</p>
          <label className="marks-upload-zone">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              disabled={loading}
            />
            {loading ? "Uploading…" : "Choose file or drag here"}
          </label>
          {file ? <p className="marks-file-name">{file.name}</p> : null}
        </div>
      )}

      {step === 2 && parsed && (
        <div className="sc-card marks-step-card">
          <h2>Step 2 — Map columns</h2>
          <p>{parsed.rows.length} data rows detected in {parsed.fileName}</p>
          <div className="marks-mapping-grid">
            {(
              [
                ["learnerNumber", "Learner Number", true],
                ["learnerName", "Learner Name", false],
                ["mark", "Assessment Mark", true],
                ["comment", "Comment", false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key} className="marks-mapping-field">
                <span>
                  {label}
                  {required ? " *" : ""}
                </span>
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [key]: e.target.value }))
                  }
                >
                  <option value="">— Select column —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="marks-step-actions">
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!mapping.learnerNumber || !mapping.mark}
              onClick={() => setStep(3)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sc-card marks-step-card">
          <h2>Step 3 — Validate</h2>
          <p>Run validation to check learners, marks, and duplicates.</p>
          <div className="marks-step-actions">
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading}
              onClick={runValidation}
            >
              {loading ? "Validating…" : "Run validation"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && validation && (
        <div className="sc-card marks-step-card">
          <h2>Step 4 — Preview</h2>
          <div className="marks-validation-summary">
            <span className="marks-stat-valid">{validation.summary.validCount} valid</span>
            <span className="marks-stat-error">{validation.summary.errorCount} errors</span>
            <span className="marks-stat-warn">{validation.summary.warningCount} warnings</span>
            <span className="marks-stat-skip">{validation.summary.skippedCount} skipped</span>
          </div>

          {validation.errors.length > 0 && (
            <div className="marks-issue-block">
              <h3>Errors (will not be imported)</h3>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Learner</th>
                    <th>Mark</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.errors.slice(0, 20).map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}</td>
                      <td>{e.learnerNumber ?? e.learnerName ?? "—"}</td>
                      <td>{e.mark ?? "—"}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="marks-issue-block">
              <h3>Warnings</h3>
              <ul>
                {validation.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validation.validRows.length > 0 && (
            <div className="marks-issue-block">
              <h3>Ready to import ({validation.validRows.length} rows)</h3>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Learner #</th>
                    <th>Name</th>
                    <th>Mark</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.validRows.slice(0, 15).map((r) => (
                    <tr key={r.row}>
                      <td>{r.learnerNumber}</td>
                      <td>{r.learnerName}</td>
                      <td>{r.mark}</td>
                      <td>{r.comment ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validation.validRows.length > 15 ? (
                <p>…and {validation.validRows.length - 15} more rows</p>
              ) : null}
            </div>
          )}

          <div className="marks-step-actions">
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setStep(3)}
            >
              Re-validate
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading || validation.validRows.length === 0}
              onClick={executeImport}
            >
              {loading ? "Importing…" : `Import ${validation.validRows.length} marks`}
            </button>
          </div>
        </div>
      )}

      {step === 5 && importResult && (
        <div className="sc-card marks-step-card">
          <h2>Step 5 — Import complete</h2>
          <p>
            Successfully imported <strong>{importResult.imported}</strong> marks.
            Subject analysis has been updated automatically.
          </p>
          <div className="marks-step-actions">
            <Link
              to={`/assessments/${assessmentId}/results`}
              className="sc-btn sc-btn-primary"
            >
              View results
            </Link>
            <Link
              to={`/assessments/${assessmentId}/analysis`}
              className="sc-btn sc-btn-ghost"
            >
              View analysis
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
