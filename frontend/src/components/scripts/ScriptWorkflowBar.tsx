import type { ScriptWorkflowInfo, WorkflowDisplayStatus } from "../../types";

const STATUS_LABELS: Record<WorkflowDisplayStatus, string> = {
  UPLOADED: "Uploaded",
  MARKING: "Marking",
  MARKED: "Marked",
  MODERATION: "Moderation",
  MODERATED: "Moderated",
  FINALISED: "Finalised",
  RETURNED: "Returned",
};

type Props = {
  workflow: ScriptWorkflowInfo | null;
  busy?: boolean;
  onComplete?: () => void;
  onSubmitModeration?: () => void;
  onStartReview?: () => void;
  onApprove?: () => void;
  onReturn?: () => void;
  onFinalise?: () => void;
};

export default function ScriptWorkflowBar({
  workflow,
  busy,
  onComplete,
  onSubmitModeration,
  onStartReview,
  onApprove,
  onReturn,
  onFinalise,
}: Props) {
  if (!workflow) return null;

  const status = workflow.workflowStatus;
  const actions = new Set(workflow.availableActions);

  return (
    <div className="sc-workflow-bar">
      <div className="sc-workflow-status-group">
        <span className={`sc-workflow-badge sc-workflow-badge-${status.toLowerCase()}`}>
          {STATUS_LABELS[status]}
        </span>
        {workflow.isReadOnly ? (
          <span className="sc-lock-badge sc-lock-badge-readonly">Read-only</span>
        ) : null}
        {workflow.teacherLayerLocked ? (
          <span className="sc-lock-badge sc-lock-badge-teacher">Teacher layer locked</span>
        ) : null}
        {workflow.hodLayerLocked ? (
          <span className="sc-lock-badge sc-lock-badge-hod">HOD layer locked</span>
        ) : null}
        {workflow.examSessionMode ? (
          <span className="sc-lock-badge sc-lock-badge-exam">Exam session mode</span>
        ) : null}
      </div>

      <div className="sc-workflow-actions">
        {actions.has("complete") && onComplete ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-btn-sm"
            disabled={busy}
            onClick={onComplete}
          >
            Mark complete
          </button>
        ) : null}
        {actions.has("submit_moderation") && onSubmitModeration ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-btn-sm"
            disabled={busy}
            onClick={onSubmitModeration}
          >
            Submit for moderation
          </button>
        ) : null}
        {actions.has("start_review") && onStartReview ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-btn-sm"
            disabled={busy}
            onClick={onStartReview}
          >
            Start review
          </button>
        ) : null}
        {actions.has("approve") && onApprove ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-btn-sm"
            disabled={busy}
            onClick={onApprove}
          >
            Approve moderation
          </button>
        ) : null}
        {actions.has("return_to_teacher") && onReturn ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-btn-sm"
            disabled={busy}
            onClick={onReturn}
          >
            Return to teacher
          </button>
        ) : null}
        {actions.has("finalise") && onFinalise ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-btn-sm"
            disabled={busy}
            onClick={onFinalise}
          >
            Finalise script
          </button>
        ) : null}
      </div>
    </div>
  );
}
