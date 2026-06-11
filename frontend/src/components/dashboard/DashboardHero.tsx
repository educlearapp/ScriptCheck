import "./DashboardHero.css";

type HeroMetric = {
  label: string;
  value: string | number;
  tone?: "default" | "gold" | "success" | "warning" | "critical";
};

type DashboardHeroProps = {
  greeting: string;
  subtitle: string;
  termLabel?: string;
  metrics?: HeroMetric[];
};

export default function DashboardHero({
  greeting,
  subtitle,
  termLabel,
  metrics = [],
}: DashboardHeroProps) {
  return (
    <section className="sc-dash-hero sc-card">
      <div className="sc-dash-hero-accent" aria-hidden="true" />
      <div className="sc-dash-hero-body">
        <div className="sc-dash-hero-top">
          <div>
            <p className="sc-dash-hero-greeting">{greeting}</p>
            <h1 className="sc-dash-hero-title">{subtitle}</h1>
            {termLabel ? <p className="sc-dash-hero-term">{termLabel}</p> : null}
          </div>
        </div>
        {metrics.length > 0 ? (
          <div className="sc-dash-hero-metrics">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className={`sc-dash-hero-metric${metric.tone ? ` is-${metric.tone}` : ""}`}
              >
                <span className="sc-dash-hero-metric-value">{metric.value}</span>
                <span className="sc-dash-hero-metric-label">{metric.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
