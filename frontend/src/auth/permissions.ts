import type { AuthUser, Permission, WorkspaceRole } from "../types";
import { getRoleLabel } from "../utils/roleLabels";

export function hasRole(
  user: AuthUser | null | undefined,
  role: WorkspaceRole
): boolean {
  return user?.roles.includes(role) ?? false;
}

export function hasAnyRole(
  user: AuthUser | null | undefined,
  roles: WorkspaceRole[]
): boolean {
  if (!user) return false;
  return roles.some((role) => user.roles.includes(role));
}

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: Permission
): boolean {
  return user?.permissions.includes(permission) ?? false;
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return user?.isSuperAdmin === true;
}

export function getEffectivePermissions(
  user: AuthUser | null | undefined
): Permission[] {
  return user?.permissions ?? [];
}

export function formatRoles(roles: WorkspaceRole[]): string {
  if (roles.length === 0) return "No roles";
  return roles.map((r) => getRoleLabel(r)).join(" · ");
}

export function isExamBodyDashboard(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, ["EXAMINATION_BODY", "EXAM_BODY_ADMIN"]);
}

export function isPrincipalDashboard(user: AuthUser | null | undefined): boolean {
  if (isExamBodyDashboard(user)) return false;
  return (
    hasAnyRole(user, ["PRINCIPAL", "SCHOOL_ADMIN", "SCHOOL_OWNER"]) ||
    hasPermission(user, "workspace.manage")
  );
}

export function isModeratorDashboard(user: AuthUser | null | undefined): boolean {
  if (isExamBodyDashboard(user) || isPrincipalDashboard(user)) return false;
  return (
    hasRole(user, "MODERATOR") &&
    !hasRole(user, "HOD")
  );
}

export function isHodDashboard(user: AuthUser | null | undefined): boolean {
  if (isExamBodyDashboard(user) || isPrincipalDashboard(user)) return false;
  return hasRole(user, "HOD") || (
    hasAnyRole(user, ["MODERATOR"]) &&
    hasPermission(user, "moderation.queue") &&
    !isModeratorDashboard(user)
  );
}

export function canSubmitAssessment(
  user: AuthUser | null | undefined,
  creatorTeacherId: string,
  status: string
): boolean {
  if (!user) return false;
  if (!["DRAFT", "RETURNED_TO_TEACHER"].includes(status)) return false;

  if (!hasPermission(user, "assessments.submit")) return false;

  const teacherOnly =
    hasRole(user, "TEACHER") && !hasPermission(user, "assessments.edit");

  if (teacherOnly) {
    return creatorTeacherId === user.id;
  }

  return true;
}

export function canEditAssessment(
  user: AuthUser | null | undefined,
  creatorTeacherId: string,
  status: string
): boolean {
  if (!user) return false;
  if (!["DRAFT", "RETURNED_TO_TEACHER"].includes(status)) return false;

  if (hasPermission(user, "assessments.edit")) return true;

  if (hasPermission(user, "assessments.edit_own")) {
    return creatorTeacherId === user.id;
  }

  return false;
}

export function isAssessmentReadOnly(
  user: AuthUser | null | undefined,
  creatorTeacherId: string,
  status: string
): boolean {
  if (hasPermission(user, "moderation.queue") && status === "SUBMITTED_TO_HOD") {
    return true;
  }
  return !canEditAssessment(user, creatorTeacherId, status);
}

function hasBroadResultsAccess(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "assessments.edit") ||
    hasPermission(user, "moderation.queue") ||
    hasPermission(user, "workspace.manage") ||
    hasAnyRole(user, ["HOD", "MODERATOR", "PRINCIPAL", "SCHOOL_ADMIN", "SCHOOL_OWNER", "EXAM_BODY_ADMIN", "EXAMINATION_BODY"])
  );
}

export function canViewResults(
  user: AuthUser | null | undefined,
  creatorTeacherId: string
): boolean {
  if (!user || !hasPermission(user, "results.view")) return false;
  if (hasBroadResultsAccess(user)) return true;
  return creatorTeacherId === user.id;
}

export function canExportResults(
  user: AuthUser | null | undefined,
  creatorTeacherId: string
): boolean {
  if (!user || !hasPermission(user, "results.export")) return false;
  if (hasBroadResultsAccess(user)) return true;
  return creatorTeacherId === user.id;
}

export function canPublishResults(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, "results.publish");
}

export function canReopenResults(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, "results.reopen");
}
