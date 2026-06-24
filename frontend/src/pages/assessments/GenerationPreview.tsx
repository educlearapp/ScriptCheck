import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { GenerationRequest } from "../../types";
import "./GenerateAssessment.css";

export default function GenerationPreview() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [request, setRequest] = useState<GenerationRequest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const load = useCallback(() => {
    if (!requestId) return;
    setLoading(true);
    apiFetch<GenerationRequest>(`/assessment-generation/${requestId}`)
      .then(setRequest)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load preview")
      )
      .finally(() => setLoading(false));
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRegenerate = async () => {
    if (!requestId) return;
    setActionLoading("regenerate");
    setError("");
    try {
      const updated = await apiFetch<GenerationRequest>(
        `/assessment-generation/${requestId}/regenerate`,
        { method: "POST" }
      );
      setRequest(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setActionLoading("");
    }
  };

  const handleApprove = async () => {
    if (!requestId) return;
    setActionLoading("approve");
    setError("");
    try {
      const result = await apiFetch<{ assessmentId: string }>(
        `/assessment-generation/${requestId}/approve`,
        { method: "POST" }
      );
      navigate(`/assessments/${result.assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading("");
    }
  };

  const handleDiscard = async () => {
    if (!requestId) return;
    if (!window.confirm("Discard this generated assessment?")) return;
    setActionLoading("discard");
    setError("");
    try {
      await apiFetch(`/assessment-generation/${requestId}`, { method: "DELETE" });
      navigate("/assessments/generate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard failed");
    } finally {
      setActionLoading("");
    }
  };

  const handleSaveToBank = async () => {
    if (!requestId) return;
    setActionLoading("bank");
    setError("");
    try {
      const result = await apiFetch<{ saved: number; skipped: number }>(
        `/question-bank/from-generation/${requestId}`,
        { method: "POST" }
      );
      if (result.saved === 0 && result.skipped > 0) {
        setError("All generated questions were already saved to the bank.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save to bank failed");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return <p className="sc-page-subtitle">Loading generated preview…</p>;
  }

  if (!request || !request.preview) {
    return (
      <div>
        <p className="sc-error">{error || "No preview available"}</p>
        <Link to="/assessments/generate" className="sc-btn sc-btn-ghost">
          Back to generator
        </Link>
      </div>
    );
  }

  const { preview } = request;
  const isApproved = Boolean(request.approvedAssessmentId);

  return (
    <div>
      <Link to="/assessments/generate" className="sc-detail-back">
        ← AI Generator
      </Link>
      <h1 className="sc-page-title">Generated Preview</h1>
      <p className="sc-page-subtitle">
        {request.title} · {request.subject?.name} · {request.grade?.name} ·{" "}
        {request.curriculum?.code}
        {preview.mock ? (
          <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
            Mock AI
          </span>
        ) : null}
      </p>

      <div className="sc-card sc-card-gold" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 0.5rem", color: "var(--sc-gold-light)" }}>
          Generation Summary
        </h3>
        <div className="sc-gen-summary-grid">
          <div className="sc-gen-summary-item">
            <div className="sc-gen-summary-value">{preview.summary.questionCount}</div>
            <div className="sc-gen-summary-label">Questions</div>
          </div>
          <div className="sc-gen-summary-item">
            <div className="sc-gen-summary-value">{preview.summary.totalMarks}</div>
            <div className="sc-gen-summary-label">Total Marks</div>
          </div>
          <div className="sc-gen-summary-item">
            <div className="sc-gen-summary-value">
              {preview.summary.difficulty.replaceAll("_", " ")}
            </div>
            <div className="sc-gen-summary-label">Difficulty</div>
          </div>
          <div className="sc-gen-summary-item">
            <div className="sc-gen-summary-value">v{request.latestVersion}</div>
            <div className="sc-gen-summary-label">Version</div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
          Topics: {preview.summary.topicsUsed.join(", ")}
        </p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
          Cognitive levels: {preview.summary.cognitiveLevels.join(", ")}
        </p>
      </div>

      <div className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 1rem", color: "var(--sc-gold-light)" }}>
          Generated Questions
        </h3>
        {preview.questions.map((q) => (
          <div key={q.questionNumber} className="sc-preview-question">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <strong>Question {q.questionNumber}</strong>
              <span className="sc-badge sc-badge-gold">{q.marks} marks</span>
            </div>
            <p style={{ margin: "0.5rem 0" }}>{q.questionText}</p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--sc-text-muted)" }}>
              Topic: {q.topic} · {q.cognitiveLevel} · {q.difficulty}
            </p>
          </div>
        ))}
      </div>

      {preview.memo ? (
        <div className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
          <h3 style={{ margin: "0 0 1rem", color: "var(--sc-gold-light)" }}>
            Generated Memo & Mark Allocation
          </h3>
          {preview.memo.entries.map((entry) => (
            <div key={entry.questionNumber} className="sc-preview-memo">
              <strong>Q{entry.questionNumber}</strong> — {entry.markAllocation} marks
              <p style={{ margin: "0.35rem 0 0" }}>
                <em>Answer:</em> {entry.expectedAnswer}
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                {entry.memoNotes}
              </p>
            </div>
          ))}
          <div style={{ marginTop: "1rem" }}>
            <strong>Mark allocation</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {preview.memo.markAllocation.map((row) => (
                <li key={row.questionNumber}>
                  Question {row.questionNumber}: {row.marks} marks
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {error ? <div className="sc-error" style={{ marginTop: "1rem" }}>{error}</div> : null}

      <div className="sc-form-actions" style={{ marginTop: "1.5rem" }}>
        {hasPermission(user, "questionBank.create") && request.status === "GENERATED" ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            disabled={!!actionLoading}
            onClick={handleSaveToBank}
          >
            {actionLoading === "bank" ? "Saving…" : "Save Generated Questions to Question Library"}
          </button>
        ) : null}
        {isApproved ? (
          <Link
            to={`/assessments/${request.approvedAssessmentId}`}
            className="sc-btn sc-btn-primary"
          >
            Open Assessment
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!!actionLoading || request.status !== "GENERATED"}
              onClick={handleApprove}
            >
              {actionLoading === "approve" ? "Approving…" : "Approve & Create Assessment"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={!!actionLoading}
              onClick={handleRegenerate}
            >
              {actionLoading === "regenerate" ? "Regenerating…" : "Regenerate"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={!!actionLoading}
              onClick={handleDiscard}
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
