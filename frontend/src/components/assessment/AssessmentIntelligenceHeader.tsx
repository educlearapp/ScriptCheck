import IntelligenceSummaryStrip from "../intelligence/IntelligenceSummaryStrip";

type Props = {
  assessmentId: string;
};

/** Compact intelligence strip for any assessment sub-page */
export default function AssessmentIntelligenceHeader({ assessmentId }: Props) {
  return <IntelligenceSummaryStrip assessmentId={assessmentId} />;
}
