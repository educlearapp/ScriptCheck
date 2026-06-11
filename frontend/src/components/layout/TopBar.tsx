import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTrialGate } from "../../trial/TrialGateContext";
import { SALES_EMAIL } from "../../trial/constants";
import "./TopBar.css";

export default function TopBar() {
  const navigate = useNavigate();
  const { user, workspaces, logout, switchWorkspace } = useAuth();
  const { isTrial, showUpgradeModal } = useTrialGate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const handleWorkspaceChange = async (workspaceId: string) => {
    if (workspaceId === user?.workspaceId) return;
    try {
      await switchWorkspace(workspaceId);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Failed to switch workspace", err);
    }
  };

  return (
    <header className="sc-topbar">
      <div>
        <div className="sc-topbar-eyebrow">South African Schools</div>
        <div className="sc-topbar-heading">
          CAPS · IEB · Cambridge
          {isTrial ? (
            <span className="sc-topbar-trial-badge">Free Trial</span>
          ) : null}
        </div>
        {isTrial ? (
          <p className="sc-topbar-trial-note">
            Trial preview mode — upgrade to print, export, send or publish.{" "}
            <button type="button" className="sc-topbar-trial-link" onClick={showUpgradeModal}>
              Upgrade
            </button>
            {" · "}
            <a href={`mailto:${SALES_EMAIL}?subject=ScriptCheck%20Sales`}>Contact sales</a>
          </p>
        ) : null}
      </div>

      <div className="sc-topbar-actions">
        {workspaces.length > 1 ? (
          <select
            className="sc-select sc-topbar-workspace-select"
            value={user?.workspaceId ?? ""}
            onChange={(e) => handleWorkspaceChange(e.target.value)}
            aria-label="Switch workspace"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        ) : null}

        <div className="sc-topbar-user">
          <div className="sc-topbar-name">{user?.fullName}</div>
          <div className="sc-topbar-email">{user?.email}</div>
        </div>
        <button type="button" className="sc-btn sc-btn-ghost" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
