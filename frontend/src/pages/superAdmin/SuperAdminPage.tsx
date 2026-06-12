import { useCallback, useEffect, useState } from "react";
import PageLoader from "../../components/loading/PageLoader";
import {
  fetchSuperAdminOverview,
  fetchSuperAdminUsers,
  fetchSuperAdminWorkspaces,
  type SuperAdminOverview,
  type SuperAdminUser,
  type SuperAdminWorkspace,
} from "../../services/superAdminApi";
import type { WorkspaceRole } from "../../types";
import { getRoleLabel } from "../../utils/roleLabels";
import "./SuperAdmin.css";

type Tab = "workspaces" | "users";

const ROLE_OPTIONS: WorkspaceRole[] = [
  "TEACHER",
  "HOD",
  "MODERATOR",
  "EXAMINATION_OFFICER",
  "PRINCIPAL",
  "SCHOOL_ADMIN",
  "SCHOOL_OWNER",
  "EXAM_BODY_ADMIN",
  "EXAMINATION_BODY",
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function planLabel(row: SuperAdminWorkspace) {
  if (row.subscriptionStatus === "EXPIRED") return "Expired trial";
  if (row.subscriptionPlan === "TRIAL") return "Trial";
  return "Paid";
}

export default function SuperAdminPage() {
  const [tab, setTab] = useState<Tab>("workspaces");
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [workspaces, setWorkspaces] = useState<SuperAdminWorkspace[]>([]);
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [trialFilter, setTrialFilter] = useState("");

  const loadOverview = useCallback(() => {
    return fetchSuperAdminOverview()
      .then(setOverview)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load overview");
      });
  }, []);

  const loadWorkspaces = useCallback(() => {
    setTableLoading(true);
    return fetchSuperAdminWorkspaces({
      search: workspaceSearch.trim() || undefined,
      trialStatus: trialFilter || undefined,
      active: activeFilter || undefined,
    })
      .then((data) => setWorkspaces(data.workspaces))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load workspaces");
        setWorkspaces([]);
      })
      .finally(() => setTableLoading(false));
  }, [workspaceSearch, trialFilter, activeFilter]);

  const loadUsers = useCallback(() => {
    setTableLoading(true);
    return fetchSuperAdminUsers({
      search: userSearch.trim() || undefined,
      workspaceSearch: schoolSearch.trim() || undefined,
      role: roleFilter || undefined,
      active: activeFilter || undefined,
      trialStatus: trialFilter || undefined,
    })
      .then((data) => setUsers(data.users))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load users");
        setUsers([]);
      })
      .finally(() => setTableLoading(false));
  }, [userSearch, schoolSearch, roleFilter, activeFilter, trialFilter]);

  useEffect(() => {
    setLoading(true);
    loadOverview().finally(() => setLoading(false));
  }, [loadOverview]);

  useEffect(() => {
    if (tab === "workspaces") loadWorkspaces();
    else loadUsers();
  }, [tab, loadWorkspaces, loadUsers]);

  if (loading && !overview) {
    return <PageLoader message="Loading platform monitor…" />;
  }

  return (
    <div className="sc-sa">
      <header className="sc-sa-header">
        <div>
          <span className="sc-sa-badge">Super Admin</span>
          <h1 className="sc-page-title" style={{ marginTop: "0.5rem" }}>
            Platform Monitor
          </h1>
          <p className="sc-page-subtitle">
            Read-only view of schools, workspaces, and users across ScriptCheck.
          </p>
        </div>
      </header>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-sa-kpi-grid">
        <div className="sc-card sc-sa-kpi sc-sa-kpi-gold">
          <div className="sc-sa-kpi-value">{overview?.totalWorkspaces ?? "—"}</div>
          <div className="sc-sa-kpi-label">Workspaces / schools</div>
        </div>
        <div className="sc-card sc-sa-kpi">
          <div className="sc-sa-kpi-value">{overview?.totalUsers ?? "—"}</div>
          <div className="sc-sa-kpi-label">Total users</div>
        </div>
        <div className="sc-card sc-sa-kpi">
          <div className="sc-sa-kpi-value">{overview?.activeUsers ?? "—"}</div>
          <div className="sc-sa-kpi-label">Active users</div>
        </div>
        <div className="sc-card sc-sa-kpi">
          <div className="sc-sa-kpi-value">{overview?.trialUsers ?? "—"}</div>
          <div className="sc-sa-kpi-label">Trial users</div>
        </div>
        <div className="sc-card sc-sa-kpi">
          <div className="sc-sa-kpi-value">{overview?.expiredTrials ?? "—"}</div>
          <div className="sc-sa-kpi-label">Expired trials</div>
        </div>
        <div className="sc-card sc-sa-kpi">
          <div className="sc-sa-kpi-value">{overview?.recentLogins.length ?? 0}</div>
          <div className="sc-sa-kpi-label">Recent logins shown</div>
        </div>
      </div>

      {(overview?.recentLogins.length ?? 0) > 0 ? (
        <section className="sc-card sc-sa-recent">
          <h2 className="sc-dash-section-title" style={{ margin: 0 }}>
            Recent logins
          </h2>
          <ul className="sc-sa-recent-list">
            {overview!.recentLogins.map((entry) => (
              <li key={entry.userId}>
                <span>
                  <strong>{entry.fullName}</strong> — {entry.email}
                </span>
                <span className="sc-muted">{formatDate(entry.lastLoginAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="sc-card sc-sa-recent">
          <h2 className="sc-dash-section-title" style={{ margin: 0 }}>
            Recent logins
          </h2>
          <p className="sc-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            No login timestamps recorded yet. Last login is captured on each staff sign-in.
          </p>
        </section>
      )}

      <div className="sc-sa-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`sc-sa-tab${tab === "workspaces" ? " is-active" : ""}`}
          onClick={() => setTab("workspaces")}
        >
          Workspaces
        </button>
        <button
          type="button"
          role="tab"
          className={`sc-sa-tab${tab === "users" ? " is-active" : ""}`}
          onClick={() => setTab("users")}
        >
          Users
        </button>
      </div>

      <section className="sc-card sc-sa-filters">
        {tab === "workspaces" ? (
          <>
            <div className="sc-sa-filter">
              <label>
                Search school
                <input
                  className="sc-input"
                  type="search"
                  placeholder="Workspace name…"
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="sc-sa-filter">
              <label>
                Search user / email
                <input
                  className="sc-input"
                  type="search"
                  placeholder="Name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="sc-sa-filter">
              <label>
                Search school
                <input
                  className="sc-input"
                  type="search"
                  placeholder="Workspace name…"
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="sc-sa-filter">
              <label>
                Role
                <select
                  className="sc-input"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <div className="sc-sa-filter">
          <label>
            Active status
            <select
              className="sc-input"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="sc-sa-filter">
          <label>
            Trial status
            <select
              className="sc-input"
              value={trialFilter}
              onChange={(e) => setTrialFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="trial">Trial</option>
              <option value="paid">Paid</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>
        <div className="sc-sa-filter" style={{ alignSelf: "end" }}>
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            onClick={() => (tab === "workspaces" ? loadWorkspaces() : loadUsers())}
          >
            Apply filters
          </button>
        </div>
      </section>

      <section className="sc-card sc-sa-table-card">
        {tableLoading ? (
          <p className="sc-muted" style={{ padding: "1rem" }}>
            Loading…
          </p>
        ) : tab === "workspaces" ? (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>School / workspace</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Trial expires</th>
                  <th>Users</th>
                  <th>Active</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="sc-muted">
                      No workspaces match your filters.
                    </td>
                  </tr>
                ) : (
                  workspaces.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="sc-muted" style={{ fontSize: "0.75rem" }}>
                          {row.slug}
                        </div>
                      </td>
                      <td>{planLabel(row)}</td>
                      <td>
                        <span
                          className={`sc-sa-status ${
                            row.subscriptionStatus === "TRIAL"
                              ? "sc-sa-status-trial"
                              : row.isActive
                                ? "sc-sa-status-active"
                                : "sc-sa-status-inactive"
                          }`}
                        >
                          {row.subscriptionStatus.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{formatDate(row.trialExpiresAt)}</td>
                      <td>{row.userCount}</td>
                      <td>
                        <span
                          className={`sc-sa-status ${
                            row.isActive ? "sc-sa-status-active" : "sc-sa-status-inactive"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role(s)</th>
                  <th>Workspace(s)</th>
                  <th>Active</th>
                  <th>Last login</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="sc-muted">
                      No users match your filters.
                    </td>
                  </tr>
                ) : (
                  users.map((row) => (
                    <tr key={row.id}>
                      <td>{row.fullName}</td>
                      <td>{row.email}</td>
                      <td>
                        {row.roles.length
                          ? row.roles.map((r) => getRoleLabel(r)).join(", ")
                          : "—"}
                      </td>
                      <td>
                        <div className="sc-sa-workspace-list">
                          {row.workspaces.length
                            ? row.workspaces.map((w) => <span key={w.id}>{w.name}</span>)
                            : "—"}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`sc-sa-status ${
                            row.isActive ? "sc-sa-status-active" : "sc-sa-status-inactive"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{formatDate(row.lastLoginAt)}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
