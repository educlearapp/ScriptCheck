import { Navigate, Outlet } from "react-router-dom";
import type { Permission } from "../types";
import { hasPermission } from "./permissions";
import { useAuth } from "./AuthContext";

type RequirePermissionProps = {
  permission?: Permission;
  permissions?: Permission[];
  fallback?: string;
};

export default function RequirePermission({
  permission,
  permissions = [],
  fallback = "/dashboard",
}: RequirePermissionProps) {
  const { user } = useAuth();

  const required = permission ? [permission, ...permissions] : permissions;

  if (required.length === 0) {
    return <Outlet />;
  }

  const allowed = required.some((p) => hasPermission(user, p));

  if (!allowed) {
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
