import { Navigate, Outlet } from "react-router-dom";
import { usePortalAuth } from "./PortalAuthContext";

export default function PortalGuard() {
  const { isAuthenticated } = usePortalAuth();
  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }
  return <Outlet />;
}

export function PortalGuestGuard() {
  const { isAuthenticated } = usePortalAuth();
  if (isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }
  return <Outlet />;
}
