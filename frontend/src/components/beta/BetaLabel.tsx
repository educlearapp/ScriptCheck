import "./BetaLabel.css";

type Props = {
  compact?: boolean;
  className?: string;
};

export default function BetaLabel({ compact = false, className = "" }: Props) {
  return (
    <span
      className={`sc-beta-label${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      title="ScriptCheck Beta — Testing Version"
    >
      <span className="sc-beta-label-primary">ScriptCheck Beta</span>
      {!compact ? (
        <span className="sc-beta-label-secondary">Testing Version</span>
      ) : null}
    </span>
  );
}
