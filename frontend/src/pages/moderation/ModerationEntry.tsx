import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { canSubmitAssessment, hasPermission } from "../../auth/permissions";
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
  const { user } = useAuth();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const reload = useCallback(async () => {
    const [teacher, all] = await Promise.all([
      apiFetch<TeacherDashboardData>("/dashboard/teacher").catch(() => null),
      apiFetch<Assessment[]>("/assessments").catch(() => []),
    ]);
    setData(teacher);
    setAssessments(all);
    return all;
  }, []);

  useEffect(() => {
    void reload().then((all) => {
      if (all[0]) setSelectedId(all[0].id);
    });
  }, [reload]);

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
  const submittedIds = useMemo(
    () => new Set((data?.submittedToHod ?? []).map((item) => item.id)),
    [data?.submittedToHod]
  );

  const readyToSubmit = useMemo(
    () =>
      assessments.filter(
        (item) => canSubmitAssessment(user, item.creatorTeacher.id, item.status) && !submittedIds.has(item.id)
      ),
    [assessments, user, submittedIds]
  );

  const selectedAssessment = assessments.find((a) => a.id === selectedId);
  const selectedSubmitted = selectedId ? submittedIds.has(selectedId) : false;
  const canSubmitSelected =
    selectedAssessment &&
    setupComplete &&
    canSubmitAssessment(user, selectedAssessment.creatorTeacher.id, selectedAssessment.status) &&
    !selectedSubmitted;

  const handleSubmitToHod = async (assessmentId: string) => {
    setActionError("");
    setSubmittingId(assessmentId);
    try {
      await apiFetch(`/assessments/${assessmentId}/submit-to-hod`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmittingId(null);
    }
  };

  const flowSteps = useMemo(
    () => [
      { n: 1, label: "Select assessment", done: !!selectedId },
      { n: 2, label: "Upload moderation sample", done: setupComplete },
      { n: 3, label: "Submit to DH", done: selectedSubmitted || hasSubmissions },
      { n: 4, label: "Track moderation status", done: hasSubmissions },
    ],
    [selectedId, setupComplete, selectedSubmitted, hasSubmissions]
  );

  const activeStep = flowSteps.find((s) => !s.done)?.n ?? 4;

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
              With DH: <strong>{data?.submittedToHod.length}</strong>
            </span>
          </div>
        ) : null}
      </header>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

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
          Submit to DH
        </h2>

        {canSubmitSelected ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              Setup is complete for <strong>{selectedAssessment?.title}</strong>. Submit to your
              department head for moderation review.
            </p>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={submittingId === selectedId}
              onClick={() => void handleSubmitToHod(selectedId)}
            >
              {submittingId === selectedId ? "Submitting…" : "Submit to DH"}
            </button>
          </div>
        ) : selectedId && setupComplete && selectedSubmitted ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              <strong>{selectedAssessment?.title}</strong> has been submitted to your DH and is
              awaiting review.
            </p>
          </div>
        ) : selectedId && !setupComplete ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-dash-empty" style={{ margin: 0 }}>
              Complete assessment setup before submitting to DH.
            </p>
            <Link to={setupBase} className="sc-btn sc-btn-primary" style={{ marginTop: "0.75rem" }}>
              Continue Setup
            </Link>
          </div>
        ) : readyToSubmit.length > 0 ? (
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
                  {readyToSubmit.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>
                        <span className={`sc-mod-status ${moderationStatusClass(item.status)}`}>
                          {formatStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sc-btn sc-btn-primary sc-mod-table-btn"
                          disabled={submittingId === item.id}
                          onClick={() => void handleSubmitToHod(item.id)}
                        >
                          {submittingId === item.id ? "Submitting…" : "Submit to DH"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="sc-card sc-card-padded">
            <p className="sc-dash-empty">No assessments ready to submit to DH.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">4</span>
          Track Moderation Status
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
            <p className="sc-dash-empty">No assessments currently with DH.</p>
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
