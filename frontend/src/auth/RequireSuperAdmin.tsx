import { Navigate, Outlet } from "react-router-dom";
import { isSuperAdmin } from "./permissions";
import { useAuth } from "./AuthContext";

export default function RequireSuperAdmin() {
  const { user } = useAuth();

  if (!isSuperAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
