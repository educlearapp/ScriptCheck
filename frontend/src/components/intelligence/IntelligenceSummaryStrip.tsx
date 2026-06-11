import { useAssessmentIntelligence } from "../../hooks/useAssessmentIntelligence";
import { deriveOverallRating, ratingTone } from "../../utils/healthRating";

type Props = {
  assessmentId: string;
};

export default function IntelligenceSummaryStrip({ assessmentId }: Props) {
  const { report, loading } = useAssessmentIntelligence(assessmentId);

  if (loading) return <span className="sc-intel-strip is-loading">Analysing…</span>;
  if (!report) return <span className="sc-intel-strip is-muted">Intelligence pending</span>;

  const rating = deriveOverallRating(report);
  const tone = ratingTone(rating);

  return (
    <div className={`sc-intel-strip is-${tone}`}>
      <span>{report.complianceScore}% compliance</span>
      <span>CAPS {report.capsCompliance}%</span>
      <span>Cognitive {report.cognitiveBalance}%</span>
      <span>{report.missingRubrics ? "⚠ Rubric" : "✓ Rubric"}</span>
      <span>{report.missingMemorandums ? "⚠ Memo" : "✓ Memo"}</span>
      <span>{report.riskIndicators.length} risks</span>
      <span className="sc-intel-strip-rating">{rating}</span>
    </div>
  );
}
