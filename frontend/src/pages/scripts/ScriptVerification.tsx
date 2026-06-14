import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import {
  confirmScriptVerification,
  finalizeQuickScan,
  getScriptVerification,
  resplitLearnerAnswers,
  type ScriptVerificationResult,
} from "../../services/assessmentSetupApi";

function parsePagesDraft(draft: string): number | null {
  const trimmed = draft.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export default function ScriptVerification() {
  const { id: assessmentId, batchId } = useParams<{ id: string; batchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [verification, setVerification] = useState<ScriptVerificationResult | null>(
    (location.state as { verification?: ScriptVerificationResult } | null)?.verification ?? null
  );
  const [pagesDraft, setPagesDraft] = useState("");
  const [loading, setLoading] = useState(!verification);
  const [resplitting, setResplitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const applyVerification = useCallback((data: ScriptVerificationResult) => {
    setVerification(data);
    setPagesDraft(String(data.expectedPagesPerScript));
  }, []);

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const data = await getScriptVerification(batchId);
      applyVerification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verification");
    } finally {
      setLoading(false);
    }
  }, [applyVerification, batchId]);

  useEffect(() => {
    if (!verification) void load();
  }, [load, verification]);

  const parsedPages = parsePagesDraft(pagesDraft);
  const savedPages = verification?.expectedPagesPerScript ?? null;
  const pagesChanged = parsedPages != null && savedPages != null && parsedPages !== savedPages;

  const handleResplit = async () => {
    if (!batchId || parsedPages == null) {
      setError("Enter a whole number greater than 0 for pages per learner answer script.");
      return;
    }
    setResplitting(true);
    setError("");
    try {
      const data = await resplitLearnerAnswers(batchId, parsedPages);
      applyVerification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate split");
    } finally {
      setResplitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!batchId || !assessmentId) return;
    setConfirming(true);
    setError("");
    try {
      if (pagesChanged && parsedPages != null) {
        const data = await resplitLearnerAnswers(batchId, parsedPages);
        applyVerification(data);
      }
      await finalizeQuickScan(assessmentId);
      await confirmScriptVerification(batchId);
      const batchDetail = await apiFetch<{ learnerScripts: { id: string }[] }>(
        `/script-batches/${batchId}`
      );
      const scriptId =
        batchDetail.learnerScripts?.[0]?.id ?? verification?.scripts?.[0]?.scriptId;
      if (scriptId) {
        navigate(`/scripts/${scriptId}`);
      } else {
        navigate(`/assessments/${assessmentId}/scripts`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <p>Verifying learner answers…</p>;
  if (!verification) {
    return (
      <div>
        <p className="sc-error">{error || "Verification data not available"}</p>
        <Link to="/marking" className="sc-btn sc-btn-ghost">
          Back to Marking
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/marking" className="sc-detail-back">
        ← Marking
      </Link>
      <h1 className="sc-page-title">Learner Answer Verification</h1>
      <p className="sc-page-subtitle">
        Review how scanned learner answer papers were split. Adjust pages per learner answer script if the split
        looks wrong — no re-upload needed.
      </p>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-card sc-card-padded sc-verification-pages-editor" style={{ marginTop: "1.25rem" }}>
        <label className="sc-label" htmlFor="verification-pages-per-learner">
          Expected pages per learner answer script
        </label>
        <div className="sc-verification-pages-row">
          <input
            id="verification-pages-per-learner"
            className="sc-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={pagesDraft}
            onChange={(e) => {
              setPagesDraft(e.target.value);
              setError("");
            }}
          />
          <button
            type="button"
            className="sc-btn sc-btn-secondary"
            disabled={resplitting || !pagesChanged || parsedPages == null}
            onClick={() => void handleResplit()}
          >
            {resplitting ? "Recalculating…" : "Recalculate split"}
          </button>
        </div>
        <p className="sc-marking-pages-hint">
          Example: if each learner answer booklet is 4 pages, enter 4. This does not use the assessment paper
          page count.
        </p>
      </div>

      <div className="sc-grid-3" style={{ marginTop: "1.25rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Total Learner Answer Pages</div>
          <div className="sc-stat-value">{verification.totalPagesUploaded}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Pages Per Learner Answer Script</div>
          <div className="sc-stat-value">{verification.expectedPagesPerScript}</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Detected Learner Answers</div>
          <div className="sc-stat-value">{verification.detectedScriptCount}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Complete Learner Answers</div>
          <div className="sc-stat-value">{verification.completeScripts}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Missing Pages</div>
          <div className="sc-stat-value">{verification.missingPages}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Extra Pages</div>
          <div className="sc-stat-value">{verification.extraPages}</div>
        </div>
      </div>

      {verification.incompleteScripts > 0 ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: "1rem", borderColor: "var(--sc-warning, #f0ad4e)" }}>
          <strong>Warning:</strong> {verification.incompleteScripts} learner answer(s) appear incomplete.
          Try changing pages per learner answer script and recalculating the split.
        </div>
      ) : null}

      {verification.warnings.length > 0 ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Warnings</h3>
          <ul>
            {verification.warnings.map((w) => (
              <li key={w} style={{ color: "var(--sc-warning, #f0ad4e)" }}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.25rem", padding: 0 }}>
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Learner Answer</th>
                <th>Learner</th>
                <th>Pages</th>
                <th>Expected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {verification.scripts.map((s) => (
                <tr key={s.scriptId}>
                  <td>Answer {s.scriptNumber}</td>
                  <td>{s.learnerName}</td>
                  <td>{s.pageCount}</td>
                  <td>{s.expectedPages}</td>
                  <td>
                    {s.isComplete ? (
                      <span className="sc-badge sc-badge-success">Complete</span>
                    ) : (
                      <span className="sc-badge sc-badge-warning">Incomplete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sc-form-actions" style={{ marginTop: "1.5rem" }}>
        <Link to="/marking" className="sc-btn sc-btn-ghost">
          Back to Marking
        </Link>
        <button
          type="button"
          className="sc-btn sc-btn-primary"
          disabled={confirming || resplitting}
          onClick={() => void handleConfirm()}
        >
          {confirming ? "Starting AI marking…" : "Confirm & Start AI Marking"}
        </button>
      </div>
    </div>
  );
}
