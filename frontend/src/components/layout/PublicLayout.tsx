import { Link, Outlet } from "react-router-dom";
import BrandLogo from "../brand/BrandLogo";
import "./PublicLayout.css";

export default function PublicLayout() {
  return (
    <div className="sc-public-shell">
      <header className="sc-public-header">
        <Link to="/" className="sc-public-brand-link">
          <BrandLogo variant="compact" showTagline={false} />
          <span className="sc-public-brand-text">ScriptCheck</span>
        </Link>
        <nav className="sc-public-nav" aria-label="Main navigation">
          <Link to="/login" className="sc-public-nav-link">
            Log In
          </Link>
          <Link to="/register" className="sc-public-nav-link">
            Register
          </Link>
          <Link to="/trial" className="sc-btn sc-btn-primary sc-public-nav-cta">
            Free Trial
          </Link>
        </nav>
      </header>
      <Outlet />
      <footer className="sc-public-footer">
        <p>ScriptCheck — Assessment Intelligence</p>
        <p className="sc-public-footer-group">An EduClear Group Product</p>
      </footer>
    </div>
  );
}
