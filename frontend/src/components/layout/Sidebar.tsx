import { NavLink } from "react-router-dom";
import BrandLogo from "../brand/BrandLogo";
import { formatRoles, hasPermission, isSuperAdmin } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { NavItem, NavSection } from "../../types";
import { NAV_SECTION_LABELS } from "../../types";
import "./Sidebar.css";

const MAIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: "◆", section: "assessment" },
  {
    to: "/assessments",
    label: "Create Assessment",
    icon: "▣",
    permission: "assessments.view",
    section: "assessment",
  },
  {
    to: "/question-bank",
    label: "Question Library",
    icon: "□",
    permission: "questionBank.view",
    section: "assessment",
  },
  {
    to: "/marking",
    label: "Mark Papers",
    icon: "✎",
    permission: "assessments.view",
    section: "assessment",
  },
  {
    to: "/moderation",
    label: "DH Review",
    icon: "⚖",
    section: "assessment",
  },
  {
    to: "/results",
    label: "Results",
    icon: "◉",
    permission: "results.view",
    section: "assessment",
  },
  {
    to: "/ai-assessment-builder",
    label: "Assessment Builder",
    icon: "✦",
    permission: "assessments.create",
    section: "ai",
  },
  {
    to: "/assessments/generate",
    label: "Create Paper",
    icon: "◇",
    permission: "assessments.create",
    section: "ai",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: "⚙",
    section: "admin",
  },
  {
    to: "/super-admin",
    label: "Super Admin",
    icon: "⬡",
    superAdminOnly: true,
    section: "admin",
  },
];

const SECTION_ORDER: NavSection[] = ["assessment", "ai", "admin"];

export default function Sidebar() {
  const { user } = useAuth();

  const navItems = MAIN_NAV.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin(user)) return false;
    if (item.permission && !hasPermission(user, item.permission)) return false;
    return true;
  });

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    label: NAV_SECTION_LABELS[section],
    items: navItems.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="sc-sidebar">
      <div className="sc-sidebar-brand">
        <BrandLogo variant="sidebar" showGroup />
      </div>

      <nav className="sc-sidebar-nav">
        {grouped.map((group) => (
          <div key={group.section} className="sc-sidebar-section">
            <div className="sc-sidebar-section-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                className={({ isActive }) =>
                  `sc-sidebar-link${isActive ? " is-active" : ""}`
                }
              >
                <span className="sc-sidebar-link-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sc-sidebar-footer">
        <div className="sc-sidebar-school">
          {user?.workspaceName || "School"}
        </div>
        <div className="sc-sidebar-role">
          {user ? formatRoles(user.roles) : ""}
        </div>
      </div>
    </aside>
  );
}
