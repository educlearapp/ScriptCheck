import { TRIAL_UPGRADE_MESSAGE, SALES_EMAIL } from "./constants";
import "./UpgradeModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function UpgradeModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="sc-upgrade-overlay" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="sc-upgrade-modal sc-card sc-card-gold">
        <div className="sc-upgrade-badge">Free Trial</div>
        <h2 id="upgrade-title" className="sc-upgrade-title">
          Upgrade to unlock production outputs
        </h2>
        <p className="sc-upgrade-message">{TRIAL_UPGRADE_MESSAGE}</p>
        <div className="sc-upgrade-actions">
          <a
            href={`mailto:${SALES_EMAIL}?subject=ScriptCheck%20Plan%20Upgrade`}
            className="sc-btn sc-btn-primary"
          >
            Upgrade Plan
          </a>
          <a
            href={`mailto:${SALES_EMAIL}?subject=ScriptCheck%20Sales%20Enquiry`}
            className="sc-btn sc-btn-ghost"
          >
            Contact Sales
          </a>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose}>
            Continue Trial
          </button>
        </div>
      </div>
    </div>
  );
}
