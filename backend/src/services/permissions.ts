import { WorkspaceRole } from "@prisma/client";
import {
  P,
  Permission,
  ROLE_PERMISSIONS,
  WORKSPACE_ROLE_LABELS,
  getRolesForWorkspaceType,
  resolveEffectivePermissions,
} from "../core/permissions/permissionRegistry";

export { Permission, WORKSPACE_ROLE_LABELS, getRolesForWorkspaceType };
export const PERMISSIONS = P;

export type WorkspaceAccess = {
  workspaceId: string;
  roles: WorkspaceRole[];
};

export type UserAccessContext = {
  userId: string;
  memberships: WorkspaceAccess[];
};

function getMembershipRoles(
  user: UserAccessContext,
  workspaceId: string
): WorkspaceRole[] {
  const membership = user.memberships.find((m) => m.workspaceId === workspaceId);
  return membership?.roles ?? [];
}

export function hasRole(
  user: UserAccessContext,
  workspaceId: string,
  role: WorkspaceRole
): boolean {
  return getMembershipRoles(user, workspaceId).includes(role);
}

export function hasAnyRole(
  user: UserAccessContext,
  workspaceId: string,
  roles: WorkspaceRole[]
): boolean {
  const memberRoles = getMembershipRoles(user, workspaceId);
  return roles.some((role) => memberRoles.includes(role));
}

export function getEffectivePermissions(
  user: UserAccessContext,
  workspaceId: string
): Permission[] {
  const roles = getMembershipRoles(user, workspaceId);
  return resolveEffectivePermissions(roles);
}

export function hasPermission(
  user: UserAccessContext,
  workspaceId: string,
  permission: Permission
): boolean {
  return getEffectivePermissions(user, workspaceId).includes(permission);
}

export { ROLE_PERMISSIONS };
