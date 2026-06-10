import type { PerformanceBand } from "../../types";

type Props = {
  bands: PerformanceBand[];
  title?: string;
};

export default function DistributionChart({ bands, title }: Props) {
  return (
    <div className="sc-distribution-chart">
      {title ? <h3 className="sc-analysis-subtitle">{title}</h3> : null}
      <div className="sc-distribution-bars">
        {bands.map((band) => (
          <div key={band.label} className="sc-distribution-row">
            <div className="sc-distribution-label">{band.label}</div>
            <div className="sc-distribution-bar-track">
              <div
                className="sc-distribution-bar-fill"
                style={{ width: `${band.barWidth}%` }}
              />
            </div>
            <div className="sc-distribution-count">
              {band.count} ({band.percentage}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
