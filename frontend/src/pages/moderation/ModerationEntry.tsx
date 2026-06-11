import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { TeacherDashboardData } from "../../types";
import DhModerationOverview from "./DhModerationOverview";
import { formatStatusLabel } from "../../utils/statusLabels";
import "../dashboard/Dashboard.css";

function TeacherModerationOverview() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);

  useEffect(() => {
    apiFetch<TeacherDashboardData>("/dashboard/teacher")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Moderation</h1>
          <p className="sc-page-subtitle">Your assessments in the moderation workflow.</p>
        </div>
      </header>

      {data?.submittedToHod.length ? (
        <div className="sc-card" style={{ padding: 0 }}>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.submittedToHod.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className="sc-badge sc-badge-muted">{formatStatusLabel(item.status)}</span>
                    </td>
                    <td>
                      <Link to={`/assessments/${item.id}`} className="sc-btn sc-btn-ghost" style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="sc-card">
          <p className="sc-dash-empty">No assessments currently in moderation.</p>
        </div>
      )}
    </div>
  );
}

export default function ModerationEntry() {
  const { user } = useAuth();

  if (hasPermission(user, "moderation.queue")) {
    return <DhModerationOverview />;
  }

  return <TeacherModerationOverview />;
}
