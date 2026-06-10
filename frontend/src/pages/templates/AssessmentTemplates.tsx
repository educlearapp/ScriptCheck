import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { AssessmentTemplate, TemplatePreview } from "../../types";
import TemplatePreviewPanel from "./TemplatePreviewPanel";

export default function AssessmentTemplates() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingId, setUsingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AssessmentTemplate[]>("/assessment-templates")
      .then(setTemplates)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load templates")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!previewId) {
      setPreview(null);
      return;
    }
    apiFetch<TemplatePreview>(`/assessment-templates/${previewId}/preview`)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [previewId]);

  const handleUse = async (templateId: string, title?: string) => {
    setUsingId(templateId);
    setError("");
    try {
      const result = await apiFetch<{ assessmentId: string }>(
        `/assessment-templates/${templateId}/use`,
        {
          method: "POST",
          body: JSON.stringify({ title }),
        }
      );
      navigate(`/assessments/${result.assessmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to use template");
    } finally {
      setUsingId(null);
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm("Archive this template?")) return;
    try {
      await apiFetch(`/assessment-templates/${id}/archive`, { method: "POST" });
      if (previewId === id) setPreviewId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Assessment Templates</h1>
      <p className="sc-page-subtitle">
        Reusable assessment structures — preview before using.
      </p>

      {error ? <p className="sc-error">{error}</p> : null}

      <div className="sc-card" style={{ marginTop: "1rem", padding: "0.5rem 0" }}>
        {loading ? (
          <p style={{ padding: "1rem" }}>Loading templates…</p>
        ) : templates.length === 0 ? (
          <div className="sc-placeholder-panel">
            <h3>No templates yet</h3>
            <p>Save an assessment as a template or create one from the Create Assessment wizard.</p>
            <Link to="/assessments/new" className="sc-btn sc-btn-ghost">Create assessment</Link>
          </div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Curriculum</th>
                  <th>Grade</th>
                  <th>Subject</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                      {t.description ? (
                        <div style={{ fontSize: "0.8rem", color: "var(--sc-text-muted)" }}>
                          {t.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{t.curriculum?.code ?? "—"}</td>
                    <td>{t.grade?.name ?? "—"}</td>
                    <td>{t.subject?.name ?? "—"}</td>
                    <td>{t.questionCount}</td>
                    <td>{t.totalMarks}</td>
                    <td>{t.createdBy.fullName}</td>
                    <td>
                      <div className="sc-form-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost"
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                          onClick={() => setPreviewId(t.id)}
                        >
                          Preview
                        </button>
                        {hasPermission(user, "assessmentTemplates.use") ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-primary"
                            style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                            disabled={usingId === t.id}
                            onClick={() => handleUse(t.id, t.name)}
                          >
                            {usingId === t.id ? "Creating…" : "Use Template"}
                          </button>
                        ) : null}
                        {hasPermission(user, "assessmentTemplates.archive") ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                            onClick={() => handleArchive(t.id)}
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview ? (
        <div className="sc-card sc-card-gold" style={{ marginTop: "1.5rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>Preview — {preview.name}</h3>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setPreviewId(null)}>
              Close
            </button>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <TemplatePreviewPanel preview={preview} />
          </div>
          {hasPermission(user, "assessmentTemplates.use") ? (
            <div className="sc-form-actions">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={usingId === preview.id}
                onClick={() => handleUse(preview.id, preview.name)}
              >
                {usingId === preview.id ? "Creating…" : "Use Template"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
