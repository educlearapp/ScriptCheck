import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { WorkspaceRole } from "../../types";

export default function UsersRolesPlaceholder() {
  const { user } = useAuth();

  const roles: WorkspaceRole[] = [
    "TEACHER",
    "HOD",
    "MODERATOR",
    "EXAMINATION_OFFICER",
    "PRINCIPAL",
    "SCHOOL_ADMIN",
    "EXAM_BODY_ADMIN",
  ];

  return (
    <div>
      <h1 className="sc-page-title">Users & Roles</h1>
      <p className="sc-page-subtitle">
        Workspace-scoped access — roles are additive per membership.
      </p>

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
        <div className="sc-placeholder-panel" style={{ padding: "1rem 0" }}>
          <h3>Access foundation</h3>
          <p>
            Users can belong to multiple workspaces with multiple roles each.
            Backend endpoints: <code>/users</code>, <code>/users/invite</code>,
            and <code>/users/:membershipId/roles</code>.
          </p>
          {user ? (
            <p style={{ marginTop: "0.75rem" }}>
              Your effective permissions:{" "}
              {user.permissions.join(", ") || "none"}
            </p>
          ) : null}
        </div>

        <div className="sc-grid-3">
          {roles.map((role) => (
            <div
              key={role}
              className="sc-card sc-card-gold"
              style={{ padding: "1rem" }}
            >
              <span className="sc-badge sc-badge-gold">{role}</span>
              <p
                style={{
                  margin: "0.75rem 0 0",
                  color: "var(--sc-text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                {user?.roles.includes(role)
                  ? "Assigned to you in this workspace"
                  : "Available for assignment"}
              </p>
            </div>
          ))}
        </div>

        {hasPermission(user, "users.invite") ? (
          <p style={{ marginTop: "1.25rem", color: "var(--sc-text-muted)" }}>
            Invite UI coming next — API is ready.
          </p>
        ) : null}
      </div>
    </div>
  );
}
