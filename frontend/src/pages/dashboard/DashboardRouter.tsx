import { useAuth } from "../../auth/AuthContext";
import {
  isHodDashboard,
  isPrincipalDashboard,
} from "../../auth/permissions";
import TeacherDashboard from "./TeacherDashboard";
import HodDashboard from "./HodDashboard";
import PrincipalDashboard from "./PrincipalDashboard";

export default function DashboardRouter() {
  const { user } = useAuth();

  if (!user) return null;

  if (isPrincipalDashboard(user)) {
    return <PrincipalDashboard />;
  }

  if (isHodDashboard(user)) {
    return <HodDashboard />;
  }

  return <TeacherDashboard />;
}
