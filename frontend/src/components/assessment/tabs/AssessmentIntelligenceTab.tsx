import AssessmentIntelligenceCard from "../../intelligence/AssessmentIntelligenceCard";
import AssessmentHealthReport from "../../intelligence/AssessmentHealthReport";
import { useAssessmentIntelligence } from "../../../hooks/useAssessmentIntelligence";
import { usePermissions } from "../../../hooks/usePermissions";

type Props = {
  assessmentId: string;
  workflowLabel: string;
  moderationStatus: string;
};

export default function AssessmentIntelligenceTab({
  assessmentId,
  workflowLabel,
  moderationStatus,
}: Props) {
  const { report, loading, generating, generate } = useAssessmentIntelligence(assessmentId);
  const { can } = usePermissions();

  return (
    <div className="sc-intelligence-tab">
      <AssessmentHealthReport
        report={report}
        workflowLabel={workflowLabel}
        moderationStatus={moderationStatus}
        loading={loading}
        canGenerate={can("intelligence.generate")}
        generating={generating}
        onGenerate={() => void generate()}
      />
      <AssessmentIntelligenceCard assessmentId={assessmentId} />
    </div>
  );
}
