import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { PeriodType, SchoolDayTemplate } from "../../types";

export default function TimetableSetup() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [templates, setTemplates] = useState<SchoolDayTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [templateForm, setTemplateForm] = useState({ name: "", isDefault: false });
  const [periodForm, setPeriodForm] = useState({
    periodOrder: "1",
    label: "",
    startTime: "08:00",
    endTime: "08:45",
    periodType: "TEACHING" as PeriodType,
    doublePeriodCapable: false,
  });

  const loadTemplates = useCallback(() => {
    apiFetch<SchoolDayTemplate[]>("/timetable/day-templates")
      .then((rows) => {
        setTemplates(rows);
        setSelectedId((current) => current || rows[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<SchoolDayTemplate>("/timetable/day-templates", {
        method: "POST",
        body: JSON.stringify(templateForm),
      });
      setTemplateForm({ name: "", isDefault: false });
      await loadTemplates();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/timetable/day-templates/${selectedId}/periods`, {
        method: "POST",
        body: JSON.stringify({
          periodOrder: Number(periodForm.periodOrder),
          label: periodForm.label,
          startTime: periodForm.startTime,
          endTime: periodForm.endTime,
          periodType: periodForm.periodType,
          doublePeriodCapable: periodForm.doublePeriodCapable,
        }),
      });
      setPeriodForm({
        periodOrder: String((selected?.periods.length ?? 0) + 2),
        label: "",
        startTime: periodForm.endTime,
        endTime: periodForm.endTime,
        periodType: "TEACHING",
        doublePeriodCapable: false,
      });
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create period");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePeriod = async (periodId: string) => {
    if (!canManage || !selectedId || !confirm("Delete this period?")) return;
    try {
      await apiFetch(`/timetable/day-templates/${selectedId}/periods/${periodId}`, {
        method: "DELETE",
      });
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete period");
    }
  };

  const setDefaultTemplate = async (template: SchoolDayTemplate) => {
    if (!canManage) return;
    try {
      await apiFetch(`/timetable/day-templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update template");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Timetable Setup</h1>
      <p className="sc-page-subtitle">
        Configure school day templates and period definitions.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreateTemplate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create day template</h2>
          <div className="sc-form-grid">
            <label>
              Template name
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                required
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <input
                type="checkbox"
                checked={templateForm.isDefault}
                onChange={(e) => setTemplateForm({ ...templateForm, isDefault: e.target.checked })}
              />
              Default template
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create template"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.25rem" }}>
        {loading ? (
          <p>Loading templates…</p>
        ) : templates.length === 0 ? (
          <p>No day templates yet.</p>
        ) : (
          <>
            <label>
              Day template
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {selected && canManage && !selected.isDefault ? (
              <div style={{ marginTop: "0.75rem" }}>
                <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setDefaultTemplate(selected)}>
                  Set as default
                </button>
              </div>
            ) : null}

            {selected ? (
              <table className="sc-table" style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Label</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Type</th>
                    <th>Double</th>
                    {canManage ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {selected.periods.map((period) => (
                    <tr key={period.id}>
                      <td>{period.periodOrder}</td>
                      <td>{period.label}</td>
                      <td>{period.startTime}</td>
                      <td>{period.endTime}</td>
                      <td>{period.periodType}</td>
                      <td>{period.doublePeriodCapable ? "Yes" : "No"}</td>
                      {canManage ? (
                        <td>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            onClick={() => handleDeletePeriod(period.id)}
                          >
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </div>

      {canManage && selectedId ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1.5rem" }} onSubmit={handleCreatePeriod}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Add period</h2>
          <div className="sc-form-grid">
            <label>
              Order
              <input
                type="number"
                min={1}
                value={periodForm.periodOrder}
                onChange={(e) => setPeriodForm({ ...periodForm, periodOrder: e.target.value })}
                required
              />
            </label>
            <label>
              Label
              <input
                value={periodForm.label}
                onChange={(e) => setPeriodForm({ ...periodForm, label: e.target.value })}
                required
              />
            </label>
            <label>
              Start time
              <input
                type="time"
                value={periodForm.startTime}
                onChange={(e) => setPeriodForm({ ...periodForm, startTime: e.target.value })}
                required
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={periodForm.endTime}
                onChange={(e) => setPeriodForm({ ...periodForm, endTime: e.target.value })}
                required
              />
            </label>
            <label>
              Period type
              <select
                value={periodForm.periodType}
                onChange={(e) => setPeriodForm({ ...periodForm, periodType: e.target.value as PeriodType })}
              >
                <option value="TEACHING">Teaching</option>
                <option value="BREAK">Break</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <input
                type="checkbox"
                checked={periodForm.doublePeriodCapable}
                onChange={(e) => setPeriodForm({ ...periodForm, doublePeriodCapable: e.target.checked })}
              />
              Double-period capable
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Adding…" : "Add period"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
