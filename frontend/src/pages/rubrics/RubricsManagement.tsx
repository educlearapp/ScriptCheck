import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { RubricCriterion, RubricTemplate, RubricTemplateScope } from "../../types";

const SCOPES: RubricTemplateScope[] = ["REUSABLE", "SUBJECT_SPECIFIC", "TEACHER_CREATED"];

const SCOPE_LABELS: Record<RubricTemplateScope, string> = {
  REUSABLE: "Reusable",
  SUBJECT_SPECIFIC: "Subject-specific",
  TEACHER_CREATED: "Teacher-created",
};

function emptyCriterion(orderIndex: number): RubricCriterion {
  return { name: "", description: null, maxMarks: 0, orderIndex };
}

export default function RubricsManagement() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, "rubrics.create");
  const canApprove = hasPermission(user, "rubrics.approve");

  const [templates, setTemplates] = useState<RubricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<RubricTemplateScope>("TEACHER_CREATED");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([
    emptyCriterion(0),
    emptyCriterion(1),
  ]);

  const totalMarks = criteria.reduce((sum, c) => sum + (Number(c.maxMarks) || 0), 0);

  const loadTemplates = useCallback(() => {
    apiFetch<RubricTemplate[]>("/rubrics")
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rubrics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const updateCriterion = (index: number, patch: Partial<RubricCriterion>) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/rubrics", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || null,
          scope,
          criteria: criteria.map((c, i) => ({ ...c, orderIndex: i })),
        }),
      });
      setName("");
      setDescription("");
      setCriteria([emptyCriterion(0), emptyCriterion(1)]);
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rubric");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiFetch(`/rubrics/${id}/approve`, { method: "POST" });
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve rubric");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Rubric Templates</h1>
      <p className="sc-page-subtitle">
        Structured marking criteria with automatic total calculation.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canCreate ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>New rubric template</h2>
          <div className="sc-form-grid">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Scope
              <select value={scope} onChange={(e) => setScope(e.target.value as RubricTemplateScope)}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>

          <table className="sc-table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Criteria</th>
                <th>Max marks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={c.name}
                      onChange={(e) => updateCriterion(i, { name: e.target.value })}
                      placeholder="e.g. Content"
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={c.maxMarks || ""}
                      onChange={(e) => updateCriterion(i, { maxMarks: Number(e.target.value) })}
                      required
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      onClick={() => setCriteria((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={criteria.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>{totalMarks}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>

          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setCriteria((prev) => [...prev, emptyCriterion(prev.length)])}
            >
              Add criterion
            </button>
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create rubric"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading rubrics…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scope</th>
                <th>Total</th>
                <th>Status</th>
                <th>Criteria</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{SCOPE_LABELS[t.scope]}</td>
                  <td>{t.totalMarks}</td>
                  <td><span className="sc-badge sc-badge-muted">{t.status}</span></td>
                  <td>
                    {t.criteria.map((c) => `${c.name} (${c.maxMarks})`).join(", ")}
                  </td>
                  <td>
                    {canApprove && t.status !== "APPROVED" ? (
                      <button type="button" className="sc-btn sc-btn-primary" onClick={() => handleApprove(t.id)}>
                        Approve
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
