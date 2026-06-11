import BrandLogo from "../brand/BrandLogo";
import "./PageLoader.css";

type PageLoaderProps = {
  message?: string;
};

export default function PageLoader({ message = "Loading…" }: PageLoaderProps) {
  return (
    <div className="sc-page-loader" role="status" aria-live="polite">
      <BrandLogo variant="loading" />
      <p className="sc-page-loader-message">{message}</p>
      <div className="sc-page-loader-bar" aria-hidden="true">
        <span className="sc-page-loader-bar-fill" />
      </div>
    </div>
  );
}
