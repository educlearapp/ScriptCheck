import { useEffect } from "react";
import { Link } from "react-router-dom";
import BetaLabel from "../../components/beta/BetaLabel";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "../../components/feedback/feedbackConstants";
import { useFeedback } from "../../hooks/useFeedback";
import { betaFeedbackScreenshotUrl } from "../../services/feedbackApi";
import { getAuthToken } from "../../auth/session";
import "../dashboard/Dashboard.css";
import "./BetaSettings.css";

function labelFor<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string
): string {
  return options.find((item) => item.value === value)?.label ?? value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function BetaFeedbackPage() {
  const { items, loading, error, load, updateStatus } = useFeedback();

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = async (id: string, status: FeedbackStatus) => {
    await updateStatus(id, status);
  };

  const openScreenshot = async (id: string) => {
    const token = getAuthToken();
    const res = await fetch(betaFeedbackScreenshotUrl(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <Link to="/settings" className="sc-detail-back">
            ← Settings
          </Link>
          <h1 className="sc-page-title">Beta Feedback</h1>
          <p className="sc-page-subtitle">
            All DH beta feedback submissions — review and track status.
          </p>
          <div style={{ marginTop: "0.65rem" }}>
            <BetaLabel />
          </div>
        </div>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}
      {loading ? <p>Loading feedback…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="sc-card sc-beta-empty">
          <p>No beta feedback submitted yet.</p>
        </div>
      ) : null}

      <div className="sc-beta-feedback-list">
        {items.map((item) => (
          <article key={item.id} className="sc-card sc-beta-feedback-card">
            <div className="sc-beta-feedback-meta">
              <div>
                <strong>{item.subject}</strong>
                <div className="sc-beta-feedback-sub">
                  {formatDate(item.createdAt)} · {item.userName} ({item.userRole})
                </div>
              </div>
              <select
                className="sc-beta-status-select"
                value={item.status}
                onChange={(e) =>
                  void handleStatusChange(item.id, e.target.value as FeedbackStatus)
                }
              >
                {FEEDBACK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sc-beta-feedback-tags">
              <span>{labelFor(FEEDBACK_CATEGORIES, item.category)}</span>
              <span className={`is-severity-${item.severity.toLowerCase()}`}>
                {labelFor(FEEDBACK_SEVERITIES, item.severity)}
              </span>
              <span>{item.page}</span>
            </div>

            <p className="sc-beta-feedback-comment">{item.comment}</p>

            {item.screenshotUrl ? (
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                onClick={() => void openScreenshot(item.id)}
              >
                View screenshot
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
