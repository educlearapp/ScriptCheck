import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  isExamBodyDashboard,
  isHodDashboard,
  isModeratorDashboard,
  isPrincipalDashboard,
} from "../../auth/permissions";
import TeacherDashboard from "./TeacherDashboard";

export default function DashboardRouter() {
  const { user } = useAuth();

  if (!user) return null;

  if (isExamBodyDashboard(user)) {
    return <Navigate to="/dashboard/exam-body" replace />;
  }

  if (isPrincipalDashboard(user)) {
    return <Navigate to="/dashboard/principal" replace />;
  }

  if (isHodDashboard(user)) {
    return <Navigate to="/dashboard/hod" replace />;
  }

  if (isModeratorDashboard(user)) {
    return <Navigate to="/dashboard/moderator" replace />;
  }

  return <TeacherDashboard />;
}
