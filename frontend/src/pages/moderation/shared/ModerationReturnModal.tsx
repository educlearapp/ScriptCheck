type Props = {
  open: boolean;
  itemName: string;
  comment: string;
  onCommentChange: (value: string) => void;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
  placeholder?: string;
};

export default function ModerationReturnModal({
  open,
  itemName,
  comment,
  onCommentChange,
  busy,
  onConfirm,
  onCancel,
  title = "Return to Teacher",
  confirmLabel = "Return with Comments",
  placeholder = "Comments for teacher…",
}: Props) {
  if (!open) return null;

  return (
    <div className="sc-mod-modal-overlay" onClick={onCancel}>
      <div className="sc-mod-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="sc-mod-hint sc-mod-modal-subtitle">{itemName}</p>
        <label className="sc-mod-field">
          Comment (required)
          <textarea
            className="sc-input"
            rows={4}
            placeholder={placeholder}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            autoFocus
          />
        </label>
        <div className="sc-mod-modal-actions">
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={!comment.trim() || busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
