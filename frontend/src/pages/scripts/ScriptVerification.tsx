import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  confirmScriptVerification,
  getScriptVerification,
  type ScriptVerificationResult,
} from "../../services/assessmentSetupApi";

export default function ScriptVerification() {
  const { id: assessmentId, batchId } = useParams<{ id: string; batchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [verification, setVerification] = useState<ScriptVerificationResult | null>(
    (location.state as { verification?: ScriptVerificationResult } | null)?.verification ?? null
  );
  const [loading, setLoading] = useState(!verification);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const data = await getScriptVerification(batchId);
      setVerification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verification");
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (!verification) void load();
  }, [load, verification]);

  const handleConfirm = async () => {
    if (!batchId || !assessmentId) return;
    setConfirming(true);
    setError("");
    try {
      await confirmScriptVerification(batchId);
      navigate(`/assessments/${assessmentId}/scripts`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <p>Verifying scripts…</p>;
  if (!verification) {
    return (
      <div>
        <p className="sc-error">{error || "Verification data not available"}</p>
        <Link to={`/assessments/${assessmentId}/scripts`} className="sc-btn sc-btn-ghost">
          Back to Scripts
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/assessments/${assessmentId}/scripts`} className="sc-detail-back">
        ← Scripts
      </Link>
      <h1 className="sc-page-title">Script Verification</h1>
      <p className="sc-page-subtitle">
        Review automatic script splitting before processing.
      </p>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-grid-3" style={{ marginTop: "1.25rem" }}>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Total Pages Uploaded</div>
          <div className="sc-stat-value">{verification.totalPagesUploaded}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Expected Pages Per Script</div>
          <div className="sc-stat-value">{verification.expectedPagesPerScript}</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Detected Script Count</div>
          <div className="sc-stat-value">{verification.detectedScriptCount}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Complete Scripts</div>
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
          <strong>Warning:</strong> {verification.incompleteScripts} script(s) appear incomplete.
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
                <th>Script</th>
                <th>Learner</th>
                <th>Pages</th>
                <th>Expected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {verification.scripts.map((s) => (
                <tr key={s.scriptId}>
                  <td>Script {s.scriptNumber}</td>
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
        <Link
          to={`/assessments/${assessmentId}/setup`}
          className="sc-btn sc-btn-ghost"
        >
          Re-upload Scripts
        </Link>
        <button
          type="button"
          className="sc-btn sc-btn-primary"
          disabled={confirming}
          onClick={() => void handleConfirm()}
        >
          {confirming ? "Confirming…" : "Confirm & Start Marking"}
        </button>
      </div>
    </div>
  );
}
