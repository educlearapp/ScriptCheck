import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { SchoolClass } from "../../types";

export default function ClassesManagement() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    grade: "",
    learnerCount: "0",
  });

  const loadClasses = useCallback(() => {
    apiFetch<SchoolClass[]>("/timetable/classes")
      .then(setClasses)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load classes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/timetable/classes", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          grade: form.grade,
          learnerCount: Number(form.learnerCount),
        }),
      });
      setForm({ name: "", code: "", grade: form.grade, learnerCount: "0" });
      loadClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create class");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (schoolClass: SchoolClass) => {
    if (!canManage) return;
    try {
      await apiFetch(`/timetable/classes/${schoolClass.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !schoolClass.active }),
      });
      loadClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update class");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Classes</h1>
      <p className="sc-page-subtitle">
        Manage school classes used for timetable planning.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create class</h2>
          <div className="sc-form-grid">
            <label>
              Class name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Class code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Grade
              <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} required />
            </label>
            <label>
              Learner count
              <input
                type="number"
                min={0}
                value={form.learnerCount}
                onChange={(e) => setForm({ ...form, learnerCount: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create class"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading classes…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Class</th>
                <th>Grade</th>
                <th>Learners</th>
                <th>Status</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.grade}</td>
                  <td>{c.learnerCount}</td>
                  <td>
                    <span className={`sc-badge ${c.active ? "sc-badge-success" : "sc-badge-muted"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <button type="button" className="sc-btn sc-btn-ghost" onClick={() => toggleActive(c)}>
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
