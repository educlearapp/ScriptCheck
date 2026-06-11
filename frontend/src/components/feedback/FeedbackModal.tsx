import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { formatRoles } from "../../auth/permissions";
import BetaLabel from "../beta/BetaLabel";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  type FeedbackCategory,
  type FeedbackSeverity,
} from "./feedbackConstants";
import type { SubmitFeedbackInput } from "../../services/feedbackApi";
import "./FeedbackModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SubmitFeedbackInput) => Promise<void>;
  submitting?: boolean;
};

export default function FeedbackModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
}: Props) {
  const { user } = useAuth();
  const location = useLocation();

  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("BUG_REPORT");
  const [severity, setSeverity] = useState<FeedbackSeverity>("MEDIUM");
  const [comment, setComment] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUserName(user?.fullName ?? "");
    setUserRole(formatRoles(user?.roles ?? []));
    setPage(location.pathname);
    setSubject("");
    setCategory("BUG_REPORT");
    setSeverity("MEDIUM");
    setComment("");
    setScreenshot(null);
    setSuccess(false);
    setError("");
  }, [open, user, location.pathname]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onSubmit({
        userName: userName.trim(),
        userRole: userRole.trim(),
        subject: subject.trim(),
        page: page.trim(),
        category,
        severity,
        comment: comment.trim(),
        screenshot,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  };

  return (
    <div className="sc-feedback-overlay" role="dialog" aria-modal="true" aria-label="Beta feedback">
      <button type="button" className="sc-feedback-backdrop" onClick={onClose} aria-label="Close" />
      <div className="sc-feedback-modal sc-card">
        <header className="sc-feedback-modal-header">
          <div>
            <h2>Beta Feedback</h2>
            <BetaLabel compact />
          </div>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {success ? (
          <div className="sc-feedback-success">
            <p>Thank you — your feedback has been saved permanently.</p>
            <button type="button" className="sc-btn sc-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="sc-feedback-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="sc-feedback-grid">
              <label>
                <span>Your name</span>
                <input value={userName} onChange={(e) => setUserName(e.target.value)} required />
              </label>
              <label>
                <span>Role</span>
                <input value={userRole} onChange={(e) => setUserRole(e.target.value)} required />
              </label>
              <label>
                <span>Subject</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary"
                  required
                />
              </label>
              <label>
                <span>Page</span>
                <input value={page} onChange={(e) => setPage(e.target.value)} required />
              </label>
              <label>
                <span>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                >
                  {FEEDBACK_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Severity</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
                >
                  {FEEDBACK_SEVERITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="sc-feedback-full">
              <span>Comment</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="What happened? What did you expect?"
                required
              />
            </label>

            <label className="sc-feedback-full">
              <span>Screenshot (optional)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
              />
            </label>

            {error ? <p className="sc-error">{error}</p> : null}

            <div className="sc-feedback-actions">
              <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="sc-btn sc-btn-primary" disabled={submitting}>
                {submitting ? "Saving…" : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
