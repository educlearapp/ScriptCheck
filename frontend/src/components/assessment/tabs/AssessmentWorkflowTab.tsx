import WorkflowPanel from "../workflow/WorkflowPanel";

type Props = {
  assessmentId: string;
  onTransition: () => void;
};

export default function AssessmentWorkflowTab({ assessmentId, onTransition }: Props) {
  return <WorkflowPanel assessmentId={assessmentId} onTransition={onTransition} />;
}
