import "./IntelligencePanel.css";

export type IntelItem = {
  label: string;
  value: string | number;
  status: "success" | "warning" | "critical";
};

type IntelligencePanelProps = {
  complianceScore?: number | null;
  items: IntelItem[];
  recommendations?: string[];
};

function scoreTone(score: number): "success" | "warning" | "critical" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "critical";
}

export default function IntelligencePanel({
  complianceScore,
  items,
  recommendations = [],
}: IntelligencePanelProps) {
  const tone = complianceScore != null ? scoreTone(complianceScore) : "warning";

  return (
    <aside className="sc-intel-panel">
      <div className="sc-intel-panel-header">
        <div className="sc-intel-panel-icon" aria-hidden="true">
          ✦
        </div>
        <div>
          <h2 className="sc-intel-panel-title">ScriptCheck Intelligence</h2>
          <p className="sc-intel-panel-subtitle">Assessment compliance &amp; AI insights</p>
        </div>
      </div>

      {complianceScore != null ? (
        <div className={`sc-intel-score is-${tone}`}>
          <div className="sc-intel-score-ring">
            <span className="sc-intel-score-value">{complianceScore}%</span>
          </div>
          <div>
            <div className="sc-intel-score-label">Compliance Score</div>
            <div className="sc-intel-score-hint">
              {tone === "success"
                ? "Assessments meet compliance standards"
                : tone === "warning"
                  ? "Some items need attention"
                  : "Critical compliance gaps detected"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="sc-intel-panel-body sc-card">
        <div className="sc-dash-intel-list">
          {items.map((item) => (
            <div
              key={item.label}
              className={`sc-dash-intel-item is-${item.status}`}
            >
              <span className="sc-dash-intel-label">{item.label}</span>
              <span className="sc-dash-intel-value">{item.value}</span>
            </div>
          ))}
        </div>

        {recommendations.length > 0 ? (
          <div className="sc-intel-recommendations">
            <div className="sc-intel-recommendations-title">AI Recommendations</div>
            <ul className="sc-intel-recommendations-list">
              {recommendations.map((rec) => (
                <li key={rec}>{rec}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
