import { useAssessmentIntelligence } from "../../hooks/useAssessmentIntelligence";
import { ratingTone } from "../../utils/healthRating";
import { deriveOverallRating } from "../../utils/healthRating";

type Props = {
  assessmentId: string;
  compact?: boolean;
};

export default function AssessmentIntelligenceBadge({ assessmentId, compact }: Props) {
  const { report, loading } = useAssessmentIntelligence(assessmentId);

  if (loading) {
    return <span className="sc-intel-badge is-loading">…</span>;
  }

  if (!report) {
    return <span className="sc-intel-badge is-muted">No data</span>;
  }

  const rating = deriveOverallRating(report);
  const tone = ratingTone(rating);

  if (compact) {
    return (
      <span className={`sc-intel-badge is-${tone}`} title={`${rating} · ${report.complianceScore}%`}>
        {report.complianceScore}%
      </span>
    );
  }

  return (
    <span className={`sc-intel-badge is-${tone}`}>
      {report.complianceScore}% · {rating}
    </span>
  );
}
