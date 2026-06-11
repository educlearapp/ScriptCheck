import { Navigate } from "react-router-dom";
import HomePage from "../pages/HomePage";
import { useAuth } from "./AuthContext";

/**
 * Public landing at /. Authenticated users go to the app; guests see the marketing home.
 */
export default function PublicHomeRoute() {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <HomePage />;
}
