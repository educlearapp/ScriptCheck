import type { AuthUser, NavItem, NavSection, Permission } from "../types";
import { hasPermission, isSuperAdmin, usesTeacherGoldenPathNav } from "../auth/permissions";

export const TEACHER_GOLDEN_PATH_LABELS = [
  "Home",
  "Create Assessment",
  "Mark Papers",
  "Results",
  "Question Library",
  "Advanced Tools",
] as const;

const TEACHER_GOLDEN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: "◆", section: "assessment" },
  {
    to: "/assessments/new",
    label: "Create Assessment",
    icon: "▣",
    permission: "assessments.view",
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
    to: "/results",
    label: "Results",
    icon: "◉",
    permission: "results.view",
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
    to: "/advanced-tools",
    label: "Advanced Tools",
    icon: "⋯",
    section: "assessment",
  },
];

const MANAGEMENT_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: "◆", section: "assessment" },
  {
    to: "/assessments/new",
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
    label: "Department Review",
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

export const SECTION_ORDER: NavSection[] = ["assessment", "ai", "admin"];

export function getSidebarNavItems(user: AuthUser | null | undefined): NavItem[] {
  const source = usesTeacherGoldenPathNav(user) ? TEACHER_GOLDEN_NAV : MANAGEMENT_NAV;
  return source.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin(user)) return false;
    if (item.permission && !hasPermission(user, item.permission as Permission)) return false;
    return true;
  });
}

export function getSidebarLabels(user: AuthUser | null | undefined): string[] {
  return getSidebarNavItems(user).map((item) => item.label);
}
