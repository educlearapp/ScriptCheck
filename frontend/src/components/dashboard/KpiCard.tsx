import { Link } from "react-router-dom";

type KpiCardProps = {
  value: string | number;
  label: string;
  hint: string;
  icon: string;
  to?: string;
  highlight?: boolean;
};

export default function KpiCard({
  value,
  label,
  hint,
  icon,
  to,
  highlight = false,
}: KpiCardProps) {
  const className = `sc-card sc-dash-kpi-card${highlight ? " is-highlight" : ""}`;
  const content = (
    <>
      <span className="sc-dash-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sc-dash-kpi-value">{value}</span>
      <span className="sc-dash-kpi-label">{label}</span>
      <span className="sc-dash-kpi-hint">{hint}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
