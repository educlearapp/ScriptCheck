import { Link, Outlet, useNavigate } from "react-router-dom";
import BrandLogo from "../components/brand/BrandLogo";
import { usePortalAuth } from "./PortalAuthContext";
import "./PortalLayout.css";

export default function PortalLayout() {
  const { session, activeLearnerId, setActiveLearnerId, logout } = usePortalAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/portal/login");
  };

  const isParent = session?.portalType === "PARENT";
  const activeLearner = session?.learners.find((l) => l.id === activeLearnerId);

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-brand">
          <BrandLogo variant="compact" showTagline={false} />
          <div>
            <div className="portal-title">ScriptCheck Portal</div>
            <div className="portal-subtitle">{session?.workspaceName}</div>
          </div>
        </div>
        <nav className="portal-nav">
          <Link to="/portal">Dashboard</Link>
          {activeLearnerId ? (
            <>
              <Link to={`/portal/learners/${activeLearnerId}/history`}>History</Link>
              <Link to={`/portal/learners/${activeLearnerId}/analytics`}>Analytics</Link>
            </>
          ) : null}
        </nav>
        <div className="portal-header-actions">
          {isParent && session && session.learners.length > 1 ? (
            <select
              className="portal-learner-select"
              value={activeLearnerId ?? ""}
              onChange={(e) => setActiveLearnerId(e.target.value)}
            >
              {session.learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName}
                </option>
              ))}
            </select>
          ) : activeLearner ? (
            <span className="portal-learner-name">{activeLearner.fullName}</span>
          ) : null}
          <button type="button" className="portal-btn portal-btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="portal-content">
        <Outlet />
      </main>
      <footer className="portal-footer">Read-only academic progress · ScriptCheck</footer>
    </div>
  );
}
