import "./BrandLogo.css";

const LOGO_SRC = "/scriptcheck-logo.png";

type BrandLogoProps = {
  variant?: "sidebar" | "auth" | "compact" | "loading";
  showTagline?: boolean;
  showGroup?: boolean;
};

export default function BrandLogo({
  variant = "sidebar",
  showTagline = true,
  showGroup = false,
}: BrandLogoProps) {
  return (
    <div className={`sc-brand sc-brand--${variant}`}>
      <img
        src={LOGO_SRC}
        alt="ScriptCheck"
        className="sc-brand-image"
        width={variant === "compact" ? 40 : variant === "auth" ? 120 : 72}
        height={variant === "compact" ? 40 : variant === "auth" ? 120 : 72}
      />
      {variant !== "compact" && variant !== "loading" ? (
        <div className="sc-brand-text">
          <div className="sc-brand-title">ScriptCheck</div>
          {showTagline ? (
            <div className="sc-brand-tagline">Assessment Intelligence</div>
          ) : null}
          {showGroup ? (
            <div className="sc-brand-group">An EduClear Group Product</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
