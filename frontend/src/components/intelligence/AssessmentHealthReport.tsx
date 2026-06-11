import type { IntelligenceReport } from "../../types/phase2";
import {
  buildHealthSummary,
  ratingTone,
  type AssessmentHealthSummary,
} from "../../utils/healthRating";
import "./AssessmentHealthReport.css";

type Props = {
  report: IntelligenceReport | null;
  workflowLabel: string;
  moderationStatus: string;
  loading?: boolean;
  onGenerate?: () => void;
  canGenerate?: boolean;
  generating?: boolean;
};

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "critical";
}) {
  return (
    <div className={`sc-health-metric is-${tone}`}>
      <span className="sc-health-metric-label">{label}</span>
      <span className="sc-health-metric-value">{value}</span>
    </div>
  );
}

export default function AssessmentHealthReport({
  report,
  workflowLabel,
  moderationStatus,
  loading,
  onGenerate,
  canGenerate,
  generating,
}: Props) {
  if (loading) {
    return <div className="sc-health-report sc-card sc-card-padded">Loading health report…</div>;
  }

  const summary: AssessmentHealthSummary = buildHealthSummary(
    report,
    workflowLabel,
    moderationStatus
  );
  const tone = ratingTone(summary.overallRating);

  return (
    <section className={`sc-health-report sc-card is-${tone}`}>
      <div className="sc-health-report-header">
        <div>
          <h2 className="sc-health-report-title">Assessment Health Report</h2>
          <p className="sc-health-report-subtitle">
            ScriptCheck flagship compliance and readiness summary
          </p>
        </div>
        <div className={`sc-health-rating is-${tone}`}>
          <span className="sc-health-rating-label">Overall Rating</span>
          <span className="sc-health-rating-value">{summary.overallRating}</span>
        </div>
      </div>

      <div className="sc-health-metrics">
        <Metric
          label="Compliance Score"
          value={summary.complianceScore != null ? `${summary.complianceScore}%` : "—"}
          tone={
            summary.complianceScore != null && summary.complianceScore >= 70
              ? "success"
              : summary.complianceScore != null && summary.complianceScore >= 50
                ? "warning"
                : "critical"
          }
        />
        <Metric
          label="CAPS Alignment"
          value={summary.capsCompliance != null ? `${summary.capsCompliance}%` : "—"}
        />
        <Metric
          label="Cognitive Balance"
          value={summary.cognitiveBalance != null ? `${summary.cognitiveBalance}%` : "—"}
        />
        <Metric label="Rubric Status" value={summary.rubricStatus} tone={summary.rubricStatus === "Complete" ? "success" : "warning"} />
        <Metric label="Memorandum Status" value={summary.memorandumStatus} tone={summary.memorandumStatus === "Complete" ? "success" : "critical"} />
        <Metric label="Moderation Status" value={summary.moderationStatus} />
        <Metric label="Workflow Status" value={summary.workflowStatus} />
        <Metric
          label="Risk Level"
          value={summary.riskLevel}
          tone={
            summary.riskLevel === "Low"
              ? "success"
              : summary.riskLevel === "Medium"
                ? "warning"
                : "critical"
          }
        />
      </div>

      {report && report.riskIndicators.length > 0 ? (
        <div className="sc-health-risks">
          <h3>Risk Indicators</h3>
          <ul>
            {report.riskIndicators.map((risk) => (
              <li key={risk.code} className={`is-${risk.severity}`}>
                {risk.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report && report.recommendations.length > 0 ? (
        <div className="sc-health-recommendations">
          <h3>AI Recommendations</h3>
          <ul>
            {report.recommendations.map((rec, i) => (
              <li key={`${rec.category}-${i}`}>{rec.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!report && canGenerate ? (
        <div className="sc-health-empty">
          <p>Generate intelligence to unlock the full health report.</p>
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? "Analysing…" : "Generate Intelligence"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
