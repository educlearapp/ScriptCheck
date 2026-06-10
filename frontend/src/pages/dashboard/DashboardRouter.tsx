import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { isHodDashboard, isPrincipalDashboard } from "../../auth/permissions";
import TeacherDashboard from "./TeacherDashboard";

export default function DashboardRouter() {
  const { user } = useAuth();

  if (!user) return null;

  if (isPrincipalDashboard(user)) {
    return <Navigate to="/dashboard/principal" replace />;
  }

  if (isHodDashboard(user)) {
    return <Navigate to="/dashboard/hod" replace />;
  }

  return <TeacherDashboard />;
}
