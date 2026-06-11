import { Link } from "react-router-dom";
import { hasPermission } from "../../../auth/permissions";
import type { AuthUser } from "../../../types";

type Props = {
  assessmentId: string;
  user: AuthUser | null;
  creatorTeacherId: string;
};

export default function AssessmentMarkingTab({ assessmentId, user, creatorTeacherId }: Props) {
  const canViewResults =
    hasPermission(user, "results.view") &&
    (hasPermission(user, "assessments.edit") ||
      hasPermission(user, "moderation.queue") ||
      creatorTeacherId === user?.id);

  return (
    <div className="sc-marking-tab">
      <div className="sc-card sc-card-padded">
        <h3 style={{ marginTop: 0 }}>Digital Marking</h3>
        <p className="sc-muted">
          Upload learner scripts, mark digitally with memo assistance, and submit for moderation.
        </p>
        <div className="sc-dash-quick-actions">
          {hasPermission(user, "scripts.view") ? (
            <Link to={`/assessments/${assessmentId}/scripts`} className="sc-dash-quick-btn is-primary">
              Learner Scripts
            </Link>
          ) : null}
          {hasPermission(user, "marks.import") ? (
            <>
              <Link to={`/assessments/${assessmentId}/capture`} className="sc-dash-quick-btn is-secondary">
                Bulk Capture
              </Link>
              <Link to={`/assessments/${assessmentId}/import`} className="sc-dash-quick-btn is-secondary">
                Import Marks
              </Link>
            </>
          ) : null}
          {canViewResults ? (
            <Link to={`/assessments/${assessmentId}/results`} className="sc-dash-quick-btn is-secondary">
              View Results
            </Link>
          ) : null}
          <Link to="/marking" className="sc-dash-quick-btn is-secondary">
            Marking Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
