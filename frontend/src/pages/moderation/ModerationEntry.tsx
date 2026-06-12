import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { Assessment, TeacherDashboardData } from "../../types";
import { getSetupStatus } from "../../services/assessmentSetupApi";
import DhModerationOverview from "./DhModerationOverview";
import { formatStatusLabel } from "../../utils/statusLabels";
import { UPLOAD_FILES_HINT } from "../../config/uploadLimits";
import ModerationSteps from "./shared/ModerationSteps";
import { moderationStatusClass } from "./shared/moderationStatus";
import "../dashboard/Dashboard.css";
import "./ModerationWorkflow.css";

function TeacherModerationOverview() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<TeacherDashboardData>("/dashboard/teacher").catch(() => null),
      apiFetch<Assessment[]>("/assessments").catch(() => []),
    ]).then(([teacher, all]) => {
      setData(teacher);
      setAssessments(all);
      if (all[0]) setSelectedId(all[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSetupComplete(false);
      return;
    }
    getSetupStatus(selectedId)
      .then((s) => setSetupComplete(s.setupComplete))
      .catch(() => setSetupComplete(false));
  }, [selectedId]);

  const setupBase = selectedId ? `/assessments/${selectedId}/setup` : "/assessments/new";
  const hasSubmissions = (data?.submittedToHod.length ?? 0) > 0;

  const flowSteps = useMemo(
    () => [
      { n: 1, label: "Select assessment", done: !!selectedId },
      { n: 2, label: "Upload moderation sample", done: setupComplete },
      { n: 3, label: "Review moderation data", done: hasSubmissions },
    ],
    [selectedId, setupComplete, hasSubmissions]
  );

  const activeStep = flowSteps.find((s) => !s.done)?.n ?? 3;

  return (
    <div className="sc-dash sc-mod-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Moderation</h1>
          <p className="sc-page-subtitle">Your assessments in the moderation workflow.</p>
        </div>
        {hasSubmissions ? (
          <div className="sc-dash-meta">
            <span className="sc-dash-meta-pill">
              In moderation: <strong>{data?.submittedToHod.length}</strong>
            </span>
          </div>
        ) : null}
      </header>

      <ModerationSteps steps={flowSteps} activeStep={activeStep} />

      <div className="sc-card sc-card-padded sc-mod-workflow-card">
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">1</span>
          Select Assessment &amp; Upload
        </h2>
        <div className="sc-mod-select-row">
          <label className="sc-mod-field">
            Assessment
            <select
              className="sc-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— Select assessment —</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="sc-mod-hint">
          Upload question paper, memorandum, rubric and sample scripts via Assessment Setup.{" "}
          {UPLOAD_FILES_HINT}
        </p>
        <div className="sc-mod-upload-grid">
          {["Question Paper", "Memorandum", "Rubric", "Sample Marked Scripts"].map((label) => (
            <div key={label} className="sc-mod-upload-card">
              <h3>{label}</h3>
              {selectedId ? (
                <Link to={`/assessments/${selectedId}/setup`} className="sc-btn sc-btn-ghost sc-mod-table-btn">
                  Upload
                </Link>
              ) : (
                <Link to="/assessments/new" className="sc-btn sc-btn-ghost sc-mod-table-btn">
                  Create Assessment
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">3</span>
          Review Moderation Data
        </h2>

        {hasSubmissions ? (
          <div className="sc-card sc-mod-queue">
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
                  {data!.submittedToHod.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>
                        <span className={`sc-mod-status ${moderationStatusClass(item.status)}`}>
                          {formatStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/assessments/${item.id}`}
                          className="sc-btn sc-btn-ghost sc-mod-table-btn"
                        >
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
          <div className="sc-card sc-card-padded">
            <p className="sc-dash-empty">No assessments currently in moderation.</p>
            <div className="sc-mod-empty-actions">
              <Link to={setupBase} className="sc-btn sc-btn-primary">
                Upload Assessment for Moderation
              </Link>
              <Link to="/assessments" className="sc-btn sc-btn-ghost">
                View Assessments
              </Link>
            </div>
          </div>
        )}
      </section>
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
