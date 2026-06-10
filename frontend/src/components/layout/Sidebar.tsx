import { NavLink } from "react-router-dom";
import { formatRoles, hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { NavItem } from "../../types";
import "./Sidebar.css";

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "◆" },
  {
    to: "/assessments",
    label: "Assessments",
    icon: "▣",
    permission: "assessments.view",
  },
  {
    to: "/assessments/new",
    label: "Create Assessment",
    icon: "＋",
    permission: "assessments.create",
  },
  {
    to: "/assessments/generate",
    label: "AI Paper Generator",
    icon: "✦",
    permission: "assessments.create",
  },
  {
    to: "/moderation/queue",
    label: "HOD Moderation Queue",
    icon: "✓",
    permission: "moderation.queue",
  },
  {
    to: "/results",
    label: "Department Results",
    icon: "◉",
    permission: "results.view",
  },
  {
    to: "/question-bank",
    label: "Question Bank",
    icon: "◈",
    permission: "questionBank.view",
  },
  {
    to: "/assessment-templates",
    label: "Assessment Templates",
    icon: "▤",
    permission: "assessmentTemplates.view",
  },
  {
    to: "/curriculum",
    label: "Curriculum Management",
    icon: "◎",
    permission: "curriculum.view",
  },
  {
    to: "/users",
    label: "Users & Roles",
    icon: "☰",
    permission: "users.view",
  },
];

export default function Sidebar() {
  const { user } = useAuth();

  const navItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission)
  );

  return (
    <aside className="sc-sidebar">
      <div className="sc-sidebar-brand">
        <div className="sc-sidebar-logo">SC</div>
        <div>
          <div className="sc-sidebar-title">ScriptCheck</div>
          <div className="sc-sidebar-tagline">Assessment Intelligence</div>
        </div>
      </div>

      <nav className="sc-sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sc-sidebar-link${isActive ? " is-active" : ""}`
            }
          >
            <span className="sc-sidebar-link-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sc-sidebar-footer">
        <div className="sc-sidebar-school">
          {user?.workspaceName || "Workspace"}
        </div>
        <div className="sc-sidebar-role">
          {user ? formatRoles(user.roles) : ""}
        </div>
      </div>
    </aside>
  );
}
