import { useEffect, useState } from "react";
import { apiFetch } from "../../../api";
import { useAssessmentWorkflow } from "../../../hooks/useAssessmentWorkflow";

type MarkAudit = {
  id: string;
  field: string;
  previousValue: number | null;
  newValue: number | null;
  reason: string | null;
  createdAt: string;
  adjustedBy: { fullName: string };
};

type Props = {
  assessmentId: string;
};

export default function AssessmentAuditTab({ assessmentId }: Props) {
  const { auditTrail, loading: workflowLoading } = useAssessmentWorkflow(assessmentId);
  const [markAudits, setMarkAudits] = useState<MarkAudit[]>([]);
  const [loadingMarks, setLoadingMarks] = useState(true);

  useEffect(() => {
    apiFetch<{ audits: MarkAudit[] }>(
      `/moderation-trail/assessments/${assessmentId}/mark-audit`
    )
      .then((data) => setMarkAudits(data.audits))
      .catch(() => setMarkAudits([]))
      .finally(() => setLoadingMarks(false));
  }, [assessmentId]);

  return (
    <div className="sc-audit-tab">
      <div className="sc-card sc-card-padded">
        <h3 style={{ marginTop: 0 }}>Workflow Audit Trail</h3>
        {workflowLoading ? (
          <p>Loading…</p>
        ) : auditTrail.length === 0 ? (
          <p className="sc-muted">No workflow transitions recorded.</p>
        ) : (
          <ul className="sc-dash-list">
            {auditTrail.map((entry) => (
              <li key={entry.id}>
                <time>{new Date(entry.createdAt).toLocaleString()}</time> — {entry.action}:{" "}
                {entry.fromStatus} → {entry.toStatus} by {entry.performedBy.fullName}
                {entry.comment ? ` — "${entry.comment}"` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Mark Adjustment Audit</h3>
        {loadingMarks ? (
          <p>Loading…</p>
        ) : markAudits.length === 0 ? (
          <p className="sc-muted">No mark adjustments recorded.</p>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Field</th>
                  <th>From</th>
                  <th>To</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {markAudits.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.field}</td>
                    <td>{a.previousValue ?? "—"}</td>
                    <td>{a.newValue ?? "—"}</td>
                    <td>{a.adjustedBy.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
