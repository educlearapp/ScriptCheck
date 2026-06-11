import { useAssessmentWorkflow } from "../../../hooks/useAssessmentWorkflow";
import WorkflowActions from "./WorkflowActions";
import WorkflowStageBadge from "./WorkflowStageBadge";

type Props = {
  assessmentId: string;
  onTransition?: () => void;
};

export default function WorkflowPanel({ assessmentId, onTransition }: Props) {
  const {
    currentStage,
    nextStage,
    stages,
    availableActions,
    auditTrail,
    loading,
    transitioning,
    error,
    transition,
  } = useAssessmentWorkflow(assessmentId);

  if (loading) {
    return <p>Loading workflow…</p>;
  }

  return (
    <div className="sc-workflow-panel">
      <div className="sc-card sc-card-padded">
        <h3 style={{ marginTop: 0 }}>Current Stage</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <WorkflowStageBadge stage={currentStage} />
          {nextStage ? (
            <span className="sc-muted" style={{ fontSize: "0.9rem" }}>
              Next: {nextStage.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Actions</h3>
        <WorkflowActions
          availableActions={availableActions}
          transitioning={transitioning}
          error={error}
          onAction={transition}
          onSuccess={onTransition}
        />
      </div>

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Workflow Stages</h3>
        <ol className="sc-workflow-stages">
          {stages.map((stage) => (
            <li
              key={stage.key}
              className={currentStage?.key === stage.key ? "is-current" : ""}
            >
              <strong>{stage.label}</strong>
              <span className="sc-muted">
                {" "}
                — {stage.responsibleRoles.map((r) => r.replaceAll("_", " ")).join(", ")}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {auditTrail.length > 0 ? (
        <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Recent Transitions</h3>
          <ul className="sc-dash-list">
            {auditTrail.slice(-5).reverse().map((entry) => (
              <li key={entry.id}>
                {entry.action}: {entry.fromStatus} → {entry.toStatus} by{" "}
                {entry.performedBy.fullName}
                {entry.comment ? ` — "${entry.comment}"` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
