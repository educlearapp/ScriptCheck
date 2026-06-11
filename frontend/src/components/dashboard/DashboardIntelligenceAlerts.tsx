import { Link } from "react-router-dom";
import AssessmentIntelligenceBadge from "../intelligence/AssessmentIntelligenceBadge";
import { useAssessmentIntelligence } from "../../hooks/useAssessmentIntelligence";
import { deriveOverallRating } from "../../utils/healthRating";

type Item = { id: string; title: string; subtitle?: string };

function IntelligenceAlertRow({ item }: { item: Item }) {
  const { report, loading } = useAssessmentIntelligence(item.id);

  if (loading) return null;

  const needsAttention =
    !report ||
    report.complianceScore < 70 ||
    report.missingMemorandums ||
    report.missingRubrics ||
    report.riskIndicators.some((r) => r.severity === "high");

  if (!needsAttention) return null;

  const rating = report ? deriveOverallRating(report) : "Needs Attention";

  return (
    <li className="sc-dash-intel-alert">
      <Link to={`/assessments/${item.id}`}>{item.title}</Link>
      {item.subtitle ? <span className="sc-muted"> · {item.subtitle}</span> : null}
      <AssessmentIntelligenceBadge assessmentId={item.id} compact />
      <span className="sc-muted"> — {rating}</span>
    </li>
  );
}

type Props = {
  title: string;
  items: Item[];
  emptyMessage?: string;
};

export default function DashboardIntelligenceAlerts({
  title,
  items,
  emptyMessage = "No compliance warnings.",
}: Props) {
  if (items.length === 0) {
    return (
      <section className="sc-card sc-card-padded">
        <h2 className="sc-dash-section-title">{title}</h2>
        <p className="sc-muted">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="sc-card sc-card-padded">
      <h2 className="sc-dash-section-title">{title}</h2>
      <ul className="sc-dash-list">
        {items.slice(0, 8).map((item) => (
          <IntelligenceAlertRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
