import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWorkflowStages, saveWorkflowStages } from "../../services/workflowApi";
import type { WorkflowStage } from "../../types/phase2";
import { usePermissions } from "../../hooks/usePermissions";
import "../dashboard/Dashboard.css";

export default function WorkflowSettings() {
  const { can } = usePermissions();
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWorkflowStages()
      .then((data) => setStages(data.stages))
      .catch(() => setError("Failed to load workflow configuration"))
      .finally(() => setLoading(false));
  }, []);

  if (!can("workflow.configure")) {
    return (
      <div className="sc-dash">
        <p className="sc-error">You do not have permission to configure workflow.</p>
        <Link to="/settings" className="sc-btn sc-btn-ghost">Back to Settings</Link>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveWorkflowStages(stages);
      setMessage("Workflow configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <Link to="/settings" className="sc-detail-back">← Settings</Link>
          <h1 className="sc-page-title">Workflow Configuration</h1>
          <p className="sc-page-subtitle">
            Configure assessment approval stages and responsible roles for your school.
          </p>
        </div>
      </header>

      {loading ? <p>Loading workflow…</p> : null}
      {error ? <p className="sc-error">{error}</p> : null}
      {message ? <p className="sc-muted">{message}</p> : null}

      {!loading ? (
        <div className="sc-card" style={{ padding: 0 }}>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Stage</th>
                  <th>Status Mapping</th>
                  <th>Responsible Roles</th>
                  <th>Allowed Actions</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.key}>
                    <td>{stage.orderIndex + 1}</td>
                    <td><strong>{stage.label}</strong></td>
                    <td>{stage.mappedStatus.replaceAll("_", " ")}</td>
                    <td>{stage.responsibleRoles.map((r) => r.replaceAll("_", " ")).join(", ")}</td>
                    <td>{stage.allowedActions.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <section className="sc-card sc-card-padded" style={{ marginTop: "1rem" }}>
        <h2 className="sc-dash-section-title">Approval Chain</h2>
        <p className="sc-muted">
          Default flow: Teacher → DH (Under Review) → Moderator → Examination Body → Published → Archived.
          Stage configuration is managed per workspace. Contact support for custom approval chains beyond the default stages.
        </p>
        <ul>
          <li><strong>Submit for Review</strong> — Teacher</li>
          <li><strong>Approve / Return</strong> — DH and Moderator</li>
          <li><strong>Publish</strong> — Examination Body, Principal</li>
          <li><strong>Archive</strong> — School Owner, Principal</li>
        </ul>
        <button type="button" className="sc-btn sc-btn-primary" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </section>
    </div>
  );
}
