import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./TopBar.css";

export default function TopBar() {
  const navigate = useNavigate();
  const { user, workspaces, logout, switchWorkspace } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
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
        <div className="sc-topbar-heading">CAPS · IEB · Cambridge</div>
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
