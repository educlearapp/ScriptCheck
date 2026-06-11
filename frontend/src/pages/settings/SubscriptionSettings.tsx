import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  downgradeSubscription,
  fetchSubscriptionInfo,
  upgradeSubscription,
} from "../../services/subscriptionApi";
import type { SubscriptionInfo } from "../../types/phase2";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuth } from "../../auth/AuthContext";
import "../dashboard/Dashboard.css";

const PAID_FEATURES = [
  "Export assessment packs (PDF)",
  "Publish official results",
  "Print without trial watermark",
  "Principal & governing body reports",
  "Unlimited assessments",
];

const TRIAL_FEATURES = [
  "Full assessment builder",
  "ScriptCheck Intelligence",
  "Digital marking (trial)",
  "Moderation workflow (trial)",
  "14-day evaluation period",
];

export default function SubscriptionSettings() {
  const { user, refreshUser } = useAuth();
  const { can } = usePermissions();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    fetchSubscriptionInfo()
      .then(setInfo)
      .catch(() => setError("Failed to load subscription"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  async function handleUpgrade() {
    setActing(true);
    setError("");
    try {
      const next = await upgradeSubscription();
      setInfo(next);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setActing(false);
    }
  }

  async function handleDowngrade() {
    if (!window.confirm("Downgrade to trial? Export and publish will be restricted.")) return;
    setActing(true);
    setError("");
    try {
      const next = await downgradeSubscription();
      setInfo(next);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Downgrade failed");
    } finally {
      setActing(false);
    }
  }

  const planLabel = info?.plan === "PAID" ? "Paid Plan" : "Trial Plan";
  const statusLabel = info?.isExpired
    ? "Expired"
    : info?.isTrial
      ? `Trial · ${info.daysRemaining ?? 0} days remaining`
      : info?.status ?? "Active";

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <Link to="/settings" className="sc-detail-back">← Settings</Link>
          <h1 className="sc-page-title">Subscription</h1>
          <p className="sc-page-subtitle">{user?.workspaceName}</p>
        </div>
      </header>

      {loading ? <p>Loading subscription…</p> : null}
      {error ? <p className="sc-error">{error}</p> : null}

      {info ? (
        <>
          <div className="sc-dash-kpi-grid">
            <div className="sc-card sc-card-padded">
              <div className="sc-detail-label">Current Plan</div>
              <div className="sc-stat-value" style={{ fontSize: "1.25rem" }}>{planLabel}</div>
            </div>
            <div className="sc-card sc-card-padded">
              <div className="sc-detail-label">Status</div>
              <div>{statusLabel}</div>
            </div>
            <div className="sc-card sc-card-padded">
              <div className="sc-detail-label">Trial Expires</div>
              <div>
                {info.trialExpiresAt
                  ? new Date(info.trialExpiresAt).toLocaleDateString()
                  : "—"}
              </div>
            </div>
            <div className="sc-card sc-card-padded">
              <div className="sc-detail-label">Renewal</div>
              <div>{info.plan === "PAID" ? "Active subscription" : "Upgrade to continue"}</div>
            </div>
          </div>

          <div className="sc-dash-two-col" style={{ marginTop: "1rem" }}>
            <section className="sc-card sc-card-padded">
              <h2 className="sc-dash-section-title">Trial Features</h2>
              <ul>
                {TRIAL_FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
            <section className="sc-card sc-card-padded">
              <h2 className="sc-dash-section-title">Paid Features</h2>
              <ul>
                {PAID_FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          </div>

          {can("subscription.manage") ? (
            <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
              {info.isTrial || info.isExpired ? (
                <button type="button" className="sc-btn sc-btn-primary" disabled={acting} onClick={() => void handleUpgrade()}>
                  {acting ? "Upgrading…" : "Upgrade to Paid"}
                </button>
              ) : (
                <button type="button" className="sc-btn sc-btn-ghost" disabled={acting} onClick={() => void handleDowngrade()}>
                  {acting ? "Processing…" : "Downgrade to Trial"}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
