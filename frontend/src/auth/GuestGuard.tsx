import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * For login/register/trial — redirect authenticated users into the app.
 */
export default function GuestGuard() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
