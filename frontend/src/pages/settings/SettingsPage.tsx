import { Link } from "react-router-dom";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import BetaLabel from "../../components/beta/BetaLabel";
import "../dashboard/Dashboard.css";

const ADMIN_LINKS = [
  { to: "/users", label: "Users & Roles", permission: "users.view" as const },
  { to: "/subjects", label: "Subjects", permission: "subjects.view" as const },
  { to: "/curriculum", label: "Curriculum Management", permission: "curriculum.view" as const },
  { to: "/question-bank", label: "Question Library", permission: "questionBank.view" as const },
  { to: "/assessment-templates", label: "Assessment Templates", permission: "assessmentTemplates.view" as const },
  { to: "/rubrics", label: "Rubrics", permission: "rubrics.view" as const },
  { to: "/concessions", label: "Concessions", permission: "concessions.view" as const },
  { to: "/schedule", label: "Assessment Schedule", permission: "schedule.view" as const },
  { to: "/dashboard/examinations", label: "Examination Dashboard", permission: "examinations.view" as const },
  { to: "/examinations/timetable", label: "Exam Timetable", permission: "examinations.view" as const },
  { to: "/timetable/classes", label: "Classes", permission: "timetable.view" as const },
  { to: "/timetable/rooms", label: "Rooms", permission: "timetable.view" as const },
  { to: "/timetable/setup", label: "Timetable Setup", permission: "timetable.view" as const },
  { to: "/timetable/teacher-assignments", label: "Teacher Assignments", permission: "timetable.view" as const },
  { to: "/timetable/subject-requirements", label: "Subject Requirements", permission: "timetable.view" as const },
  { to: "/timetable/lessons", label: "Lesson Timetables", permission: "timetable.view" as const },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const links = ADMIN_LINKS.filter(
    (item) => !item.permission || hasPermission(user, item.permission)
  );

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Settings</h1>
          <p className="sc-page-subtitle">
            Workspace configuration and administration tools.
          </p>
          <div style={{ marginTop: "0.65rem" }}>
            <BetaLabel />
          </div>
        </div>
      </header>

      <section>
        <h2 className="sc-dash-section-title">Workspace</h2>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Workspace</div>
          <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>{user?.workspaceName}</div>
          <div className="sc-detail-label">Signed in as</div>
          <div>{user?.fullName} · {user?.email}</div>
        </div>
      </section>

      <section>
        <h2 className="sc-dash-section-title">Beta Testing</h2>
        <div className="sc-dash-quick-actions">
          <Link to="/settings/beta-checklist" className="sc-dash-quick-btn is-secondary">
            Beta Test Checklist
          </Link>
          {hasPermission(user, "betaFeedback.view") ? (
            <Link to="/settings/beta-feedback" className="sc-dash-quick-btn is-secondary">
              Beta Feedback
            </Link>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="sc-dash-section-title">Subscription & Workflow</h2>
        <div className="sc-dash-quick-actions">
          <Link to="/settings/subscription" className="sc-dash-quick-btn is-secondary">
            Subscription
          </Link>
          {hasPermission(user, "workflow.configure") ? (
            <Link to="/settings/workflow" className="sc-dash-quick-btn is-secondary">
              Workflow Configuration
            </Link>
          ) : null}
        </div>
      </section>

      {links.length ? (
        <section>
          <h2 className="sc-dash-section-title">Administration</h2>
          <div className="sc-dash-quick-actions">
            {links.map((item) => (
              <Link key={item.to} to={item.to} className="sc-dash-quick-btn is-secondary">
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
