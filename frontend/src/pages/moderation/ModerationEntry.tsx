import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { canSubmitAssessment, hasPermission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import type { Assessment } from "../../types";
import { getSetupStatus, type AssessmentSetupStatus } from "../../services/assessmentSetupApi";
import DhModerationOverview from "./DhModerationOverview";
import { getModerationReviewPath } from "./shared/moderationReviewLink";
import {
  getModerationJourneyStatus,
  moderationJourneyStatusClass,
} from "./shared/moderationJourneyStatus";
import { UPLOAD_FILES_HINT } from "../../config/uploadLimits";
import ModerationSteps from "./shared/ModerationSteps";
import "../dashboard/Dashboard.css";
import "./ModerationWorkflow.css";

const TRACKED_STATUSES = new Set([
  "SUBMITTED_TO_HOD",
  "HOD_REVIEW",
  "RETURNED_TO_TEACHER",
  "APPROVED",
]);

function TeacherModerationOverview() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [setupStatus, setSetupStatus] = useState<AssessmentSetupStatus | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const all = await apiFetch<Assessment[]>("/assessments").catch(() => []);
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
      setSetupStatus(null);
      return;
    }
    getSetupStatus(selectedId)
      .then(setSetupStatus)
      .catch(() => setSetupStatus(null));
  }, [selectedId]);

  useEffect(() => {
    const submitted = assessments.filter((a) =>
      ["SUBMITTED_TO_HOD", "HOD_REVIEW"].includes(a.status)
    );
    if (!submitted.length) {
      setEscalatedIds(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      submitted.map(async (a) => {
        try {
          const trail = await apiFetch<{ approvalRequests: { status: string }[] }>(
            `/moderation-trail/assessments/${a.id}/trail`
          );
          return trail.approvalRequests.some((r) => r.status === "PENDING") ? a.id : null;
        } catch {
          return null;
        }
      })
    ).then((ids) => {
      if (!cancelled) {
        setEscalatedIds(new Set(ids.filter((id): id is string => Boolean(id))));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [assessments]);

  const setupBase = selectedId ? `/assessments/${selectedId}/setup` : "/assessments/new";
  const setupComplete = setupStatus?.setupComplete ?? false;

  const selectedAssessment = assessments.find((a) => a.id === selectedId);
  const selectedJourney = selectedAssessment
    ? getModerationJourneyStatus(
        selectedAssessment.status,
        escalatedIds.has(selectedAssessment.id)
      )
    : null;

  const canSubmitSelected =
    selectedAssessment &&
    setupComplete &&
    canSubmitAssessment(user, selectedAssessment.creatorTeacher.id, selectedAssessment.status);

  const readyToSubmit = useMemo(
    () =>
      assessments.filter((item) =>
        canSubmitAssessment(user, item.creatorTeacher.id, item.status)
      ),
    [assessments, user]
  );

  const trackedAssessments = useMemo(
    () => assessments.filter((a) => TRACKED_STATUSES.has(a.status)),
    [assessments]
  );

  const handleSubmitToHod = async (assessmentId: string) => {
    setActionError("");
    setSubmittingId(assessmentId);
    try {
      await apiFetch(`/assessments/${assessmentId}/submit-to-hod`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await reload();
      if (assessmentId === selectedId) {
        const updated = await apiFetch<Assessment[]>("/assessments").catch(() => []);
        const match = updated.find((a) => a.id === assessmentId);
        if (match) setSelectedId(match.id);
      }
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
      {
        n: 3,
        label: "Review moderation sample",
        done: setupComplete && !!selectedId,
      },
      {
        n: 4,
        label: "Send to Department Head",
        done:
          selectedJourney?.key === "submitted_to_dh" ||
          selectedJourney?.key === "approved" ||
          selectedJourney?.key === "escalated",
      },
    ],
    [selectedId, setupComplete, selectedJourney]
  );

  const activeStep = flowSteps.find((s) => !s.done)?.n ?? 4;

  return (
    <div className="sc-dash sc-mod-hub">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Moderation</h1>
          <p className="sc-page-subtitle">
            Select an assessment, upload your moderation sample, review it, then send to your Department Head.
          </p>
        </div>
        {trackedAssessments.length > 0 ? (
          <div className="sc-dash-meta">
            <span className="sc-dash-meta-pill">
              In moderation journey: <strong>{trackedAssessments.length}</strong>
            </span>
          </div>
        ) : null}
      </header>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      <ModerationSteps steps={flowSteps} activeStep={activeStep} />

      <div className="sc-card sc-card-padded sc-mod-workflow-card">
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">1</span>
          Select Assessment
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
              {assessments.map((a) => {
                const journey = getModerationJourneyStatus(a.status, escalatedIds.has(a.id));
                return (
                  <option key={a.id} value={a.id}>
                    {a.title} — {journey.label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        {selectedJourney ? (
          <p className="sc-mod-hint" style={{ marginBottom: 0 }}>
            Current status:{" "}
            <span
              className={`sc-mod-status ${moderationJourneyStatusClass(selectedJourney.key)}`}
            >
              {selectedJourney.label}
            </span>
          </p>
        ) : null}
      </div>

      <div className="sc-card sc-card-padded sc-mod-workflow-card">
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">2</span>
          Upload Moderation Sample
        </h2>
        <p className="sc-mod-hint">
          Upload question paper, memorandum, rubric and sample scripts via Assessment Setup.{" "}
          {UPLOAD_FILES_HINT}
        </p>
        <div className="sc-mod-upload-grid">
          {["Question Paper", "Memorandum", "Rubric", "Sample Marked Scripts"].map((label) => (
            <div key={label} className="sc-mod-upload-card">
              <h3>{label}</h3>
              {selectedId ? (
                <Link to={setupBase} className="sc-btn sc-btn-ghost sc-mod-table-btn">
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
        {selectedId && !setupComplete && setupStatus?.missingSteps.length ? (
          <p className="sc-mod-hint" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            Still needed: {setupStatus.missingSteps.join(" · ")}
          </p>
        ) : null}
      </div>

      <section>
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">3</span>
          Review Moderation Sample
        </h2>
        {!selectedId ? (
          <div className="sc-card sc-card-padded">
            <p className="sc-dash-empty">Select an assessment to review your moderation sample.</p>
          </div>
        ) : !setupComplete ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-dash-empty" style={{ margin: 0 }}>
              Complete uploads before reviewing your moderation sample.
            </p>
            <Link to={setupBase} className="sc-btn sc-btn-primary" style={{ marginTop: "0.75rem" }}>
              Continue Setup
            </Link>
          </div>
        ) : (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              Review uploaded documents for <strong>{selectedAssessment?.title}</strong> before
              sending to your Department Head.
            </p>
            {setupStatus ? (
              <ul className="sc-dash-list sc-dash-list-compact" style={{ margin: "0.75rem 0" }}>
                <li>Question paper: {setupStatus.masterFiles.questionPaper ? "✓" : "—"}</li>
                <li>Memorandum: {setupStatus.masterFiles.memorandum ? "✓" : "—"}</li>
                <li>Rubric: {setupStatus.masterFiles.rubric ? "✓" : "—"}</li>
                <li>Supporting docs: {setupStatus.masterFiles.supportingDocuments}</li>
              </ul>
            ) : null}
            <div className="sc-mod-empty-actions" style={{ marginTop: 0 }}>
              <Link
                to={getModerationReviewPath({ assessmentId: selectedId, sampleReview: true })}
                className="sc-btn sc-btn-primary"
              >
                Review Sample
              </Link>
              <Link
                to={getModerationReviewPath({ assessmentId: selectedId })}
                className="sc-btn sc-btn-ghost"
              >
                Open Assessment
              </Link>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="sc-mod-panel-title">
          <span className="sc-mod-panel-step">4</span>
          Send to Department Head
        </h2>

        {canSubmitSelected ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              Your moderation sample is ready. Submit <strong>{selectedAssessment?.title}</strong>{" "}
              to your department head for review.
            </p>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={submittingId === selectedId}
              onClick={() => void handleSubmitToHod(selectedId)}
            >
              {submittingId === selectedId ? "Submitting…" : "Send to Department Head"}
            </button>
          </div>
        ) : selectedJourney?.key === "submitted_to_dh" || selectedJourney?.key === "escalated" ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              <strong>{selectedAssessment?.title}</strong> is with your Department Head (
              <span
                className={`sc-mod-status ${moderationJourneyStatusClass(selectedJourney.key)}`}
              >
                {selectedJourney.label}
              </span>
              ).
            </p>
          </div>
        ) : selectedJourney?.key === "returned" ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              <strong>{selectedAssessment?.title}</strong> was returned by your Department Head. Update your
              sample and submit again.
            </p>
            {canSubmitSelected ? (
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                style={{ marginTop: "0.75rem" }}
                disabled={submittingId === selectedId}
                onClick={() => void handleSubmitToHod(selectedId)}
              >
                {submittingId === selectedId ? "Submitting…" : "Send again to Department Head"}
              </button>
            ) : (
              <Link to={setupBase} className="sc-btn sc-btn-primary" style={{ marginTop: "0.75rem" }}>
                Update Sample
              </Link>
            )}
          </div>
        ) : selectedJourney?.key === "approved" ? (
          <div className="sc-card sc-card-padded sc-mod-workflow-card">
            <p className="sc-mod-hint" style={{ marginTop: 0 }}>
              <strong>{selectedAssessment?.title}</strong> has been approved by your Department Head.
            </p>
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
                  {readyToSubmit.map((item) => {
                    const journey = getModerationJourneyStatus(
                      item.status,
                      escalatedIds.has(item.id)
                    );
                    return (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>
                          <span
                            className={`sc-mod-status ${moderationJourneyStatusClass(journey.key)}`}
                          >
                            {journey.label}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sc-btn sc-btn-primary sc-mod-table-btn"
                            disabled={submittingId === item.id}
                            onClick={() => void handleSubmitToHod(item.id)}
                          >
                            {submittingId === item.id ? "Submitting…" : "Send to Department Head"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="sc-card sc-card-padded">
            <p className="sc-dash-empty">No assessments ready to submit. Complete setup first.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="sc-mod-panel-title">Moderation Status</h2>
        {trackedAssessments.length > 0 ? (
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
                  {trackedAssessments.map((item) => {
                    const journey = getModerationJourneyStatus(
                      item.status,
                      escalatedIds.has(item.id)
                    );
                    return (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>
                          <span
                            className={`sc-mod-status ${moderationJourneyStatusClass(journey.key)}`}
                          >
                            {journey.label}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={getModerationReviewPath({ assessmentId: item.id })}
                            className="sc-btn sc-btn-ghost sc-mod-table-btn"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="sc-card sc-card-padded">
            <p className="sc-dash-empty">No assessments sent to the Department Head yet.</p>
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
