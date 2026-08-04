import { NavLink } from "react-router-dom";
import BrandLogo from "../brand/BrandLogo";
import { formatRoles } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { NAV_SECTION_LABELS } from "../../types";
import { SECTION_ORDER, getSidebarNavItems } from "../../nav/sidebarNav";
import "./Sidebar.css";

export default function Sidebar() {
  const { user } = useAuth();
  const navItems = getSidebarNavItems(user);

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

      <nav className="sc-sidebar-nav" aria-label="Main">
        {grouped.map((group) => (
          <div key={group.section} className="sc-sidebar-section">
            {grouped.length > 1 ? (
              <div className="sc-sidebar-section-label">{group.label}</div>
            ) : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                className={({ isActive }) =>
                  `sc-sidebar-link${isActive ? " is-active" : ""}`
                }
              >
                <span className="sc-sidebar-link-icon" aria-hidden>
                  {item.icon}
                </span>
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
