import { Link } from "react-router-dom";

type Props = {
  reviewTo: string;
  onApprove?: () => void;
  onReturn: () => void;
  onEscalate?: () => void;
  busy?: boolean;
  approveLabel?: string;
};

export default function ModerationRowActions({
  reviewTo,
  onApprove,
  onReturn,
  onEscalate,
  busy,
  approveLabel = "Approve",
}: Props) {
  return (
    <div className="sc-mod-table-actions">
      <Link to={reviewTo} className="sc-btn sc-btn-ghost sc-mod-table-btn">
        Review
      </Link>
      {onApprove ? (
        <button
          type="button"
          className="sc-btn sc-btn-primary sc-mod-table-btn"
          disabled={busy}
          onClick={onApprove}
        >
          {approveLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="sc-btn sc-btn-ghost sc-mod-table-btn"
        disabled={busy}
        onClick={onReturn}
      >
        Return
      </button>
      {onEscalate ? (
        <button
          type="button"
          className="sc-btn sc-btn-ghost sc-mod-table-btn sc-mod-table-btn-escalate"
          disabled={busy}
          onClick={onEscalate}
        >
          Escalate
        </button>
      ) : null}
    </div>
  );
}
