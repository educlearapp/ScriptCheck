import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  hasAnyRole,
  hasPermission,
  hasRole,
  isExamBodyDashboard,
  isHodDashboard,
  isModeratorDashboard,
  isPrincipalDashboard,
} from "../auth/permissions";
import type { Permission, WorkspaceRole } from "../types";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(
    () => ({
      user,
      hasRole: (role: WorkspaceRole) => hasRole(user, role),
      hasAnyRole: (roles: WorkspaceRole[]) => hasAnyRole(user, roles),
      hasPermission: (permission: Permission) => hasPermission(user, permission),
      can: (permission: Permission) => hasPermission(user, permission),
      dashboard: {
        isTeacher: !isExamBodyDashboard(user) && !isPrincipalDashboard(user) && !isHodDashboard(user) && !isModeratorDashboard(user),
        isHod: isHodDashboard(user),
        isModerator: isModeratorDashboard(user),
        isPrincipal: isPrincipalDashboard(user),
        isExamBody: isExamBodyDashboard(user),
      },
      permissions: user?.permissions ?? [],
      roles: user?.roles ?? [],
    }),
    [user]
  );
}
