import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import BetaBanner from "../../components/beta/BetaBanner";
import { firstName, greeting } from "../../components/dashboard/dashboardUtils";
import "./Dashboard.css";

const HOME_ACTIONS = [
  {
    title: "Create Assessment",
    text: "Set up a test, task, or exam for your class.",
    to: "/assessments/new",
    main: true,
  },
  {
    title: "Question Bank",
    text: "Find and reuse questions you already trust.",
    to: "/question-bank",
  },
  {
    title: "Mark Papers",
    text: "Upload learner papers and review the marks before anything is sent.",
    to: "/marking",
  },
  {
    title: "Results",
    text: "See class marks and prepare reports.",
    to: "/results",
  },
];

export default function TeacherDashboard() {
  const { user } = useAuth();

  return (
    <div className="sc-teacher-home">
      <BetaBanner />

      <header className="sc-teacher-home-hero">
        <p className="sc-teacher-home-eyebrow">
          {greeting()}, {user ? firstName(user.fullName) : "there"}
        </p>
        <h1>What would you like to do today?</h1>
        <p>
          Choose one job. ScriptCheck will guide you step by step, and you stay
          in charge of the final marks.
        </p>
      </header>

      <section className="sc-teacher-home-actions" aria-label="Teacher home choices">
        {HOME_ACTIONS.map((action) => (
          <Link
            key={action.title}
            to={action.to}
            className={`sc-teacher-home-card${action.main ? " is-main" : ""}`}
          >
            <span>{action.title}</span>
            <p>{action.text}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
