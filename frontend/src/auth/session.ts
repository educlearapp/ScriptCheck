import type { AuthSession, AuthUser, WorkspaceSummary } from "../types";

const TOKEN_KEY = "scriptcheck_token";
const USER_KEY = "scriptcheck_user";
const WORKSPACES_KEY = "scriptcheck_workspaces";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthUser;
    return {
      ...user,
      subscriptionPlan: user.subscriptionPlan ?? "PAID",
    };
  } catch {
    return null;
  }
}

export function getWorkspaces(): WorkspaceSummary[] {
  const raw = localStorage.getItem(WORKSPACES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorkspaceSummary[];
  } catch {
    return [];
  }
}

export function setAuthSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(session.workspaces));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACES_KEY);
}

/** @deprecated Use hasPermission from auth/permissions.ts */
export function isManagementRole(_role: unknown): boolean {
  const user = getAuthUser();
  return (
    user?.roles.some((r) =>
      ["PRINCIPAL", "SCHOOL_ADMIN", "EXAM_BODY_ADMIN"].includes(r)
    ) ?? false
  );
}

/** @deprecated Use hasPermission from auth/permissions.ts */
export function isHodRole(_role: unknown): boolean {
  const user = getAuthUser();
  return (
    user?.roles.some((r) => ["HOD", "MODERATOR", "PRINCIPAL"].includes(r)) ??
    false
  );
}

/** @deprecated Use hasPermission from auth/permissions.ts */
export function isTeacherRole(_role: unknown): boolean {
  const user = getAuthUser();
  return user?.roles.includes("TEACHER") ?? false;
}
