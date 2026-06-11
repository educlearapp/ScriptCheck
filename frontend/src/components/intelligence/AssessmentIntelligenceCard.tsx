import IntelligencePanel from "../dashboard/IntelligencePanel";
import { useAssessmentIntelligence } from "../../hooks/useAssessmentIntelligence";
import { usePermissions } from "../../hooks/usePermissions";

type Props = {
  assessmentId: string;
};

export default function AssessmentIntelligenceCard({ assessmentId }: Props) {
  const { can } = usePermissions();
  const { report, loading, generating, generate } = useAssessmentIntelligence(assessmentId);

  if (loading) {
    return <div className="sc-card sc-card-padded">Loading intelligence…</div>;
  }

  if (!report) {
    return (
      <div className="sc-card sc-card-padded">
        <h3>ScriptCheck Intelligence</h3>
        <p>No intelligence report yet.</p>
        {can("intelligence.generate") ? (
          <button type="button" className="sc-btn sc-btn-primary" onClick={() => void generate()} disabled={generating}>
            {generating ? "Analysing…" : "Generate Intelligence Report"}
          </button>
        ) : null}
      </div>
    );
  }

  const items = [
    { label: "CAPS Compliance", value: `${report.capsCompliance}%`, status: report.capsCompliance >= 70 ? "success" as const : "warning" as const },
    { label: "Cognitive Balance", value: `${report.cognitiveBalance}%`, status: report.cognitiveBalance >= 60 ? "success" as const : "warning" as const },
    { label: "Missing Rubrics", value: report.missingRubrics ? "Yes" : "No", status: report.missingRubrics ? "critical" as const : "success" as const },
    { label: "Missing Memos", value: report.missingMemorandums ? "Yes" : "No", status: report.missingMemorandums ? "critical" as const : "success" as const },
    { label: "Risk Indicators", value: report.riskIndicators.length, status: report.riskIndicators.length === 0 ? "success" as const : "warning" as const },
  ];

  return (
    <IntelligencePanel
      complianceScore={report.complianceScore}
      items={items}
      recommendations={report.recommendations.map((r) => r.message)}
    />
  );
}
