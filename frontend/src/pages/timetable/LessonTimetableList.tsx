import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { LessonTimetable, SchoolDayTemplate } from "../../types";

export default function LessonTimetableList() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [timetables, setTimetables] = useState<LessonTimetable[]>([]);
  const [templates, setTemplates] = useState<SchoolDayTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    academicYear: new Date().getFullYear().toString(),
    term: "1",
    templateId: "",
  });

  const load = useCallback(() => {
    apiFetch<LessonTimetable[]>("/timetable/lessons")
      .then(setTimetables)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load timetables"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    apiFetch<SchoolDayTemplate[]>("/timetable/day-templates?active=true")
      .then((rows) => {
        setTemplates(rows);
        const defaultTpl = rows.find((t) => t.isDefault) ?? rows[0];
        if (defaultTpl) {
          setForm((f) => ({ ...f, templateId: defaultTpl.id }));
        }
      })
      .catch(() => {});
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/timetable/lessons", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm((f) => ({ ...f, title: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create timetable");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!canManage || !confirm("Archive this timetable?")) return;
    try {
      await apiFetch(`/timetable/lessons/${id}/archive`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Lesson Timetables</h1>
      <p className="sc-page-subtitle">
        Create and manage school lesson timetables manually.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>
            New timetable
          </h2>
          <div className="sc-form-grid">
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Academic year
              <input
                value={form.academicYear}
                onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                required
              />
            </label>
            <label>
              Term
              <input
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
                required
              />
            </label>
            <label>
              Day template
              <select
                value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create timetable"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading timetables…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Year</th>
                <th>Term</th>
                <th>Template</th>
                <th>Status</th>
                <th>Entries</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {timetables.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.academicYear}</td>
                  <td>{t.term}</td>
                  <td>{t.template.name}</td>
                  <td>
                    <span
                      className={`sc-badge ${
                        t.status === "PUBLISHED"
                          ? "sc-badge-success"
                          : t.status === "ARCHIVED"
                            ? "sc-badge-muted"
                            : ""
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td>{t.entryCount}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <Link to={`/timetable/lessons/${t.id}/builder`} className="sc-btn sc-btn-ghost">
                        Builder
                      </Link>
                      {t.status !== "ARCHIVED" && canManage ? (
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost"
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
        )}
      </div>
    </div>
  );
}
