import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function AuthGuard() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
