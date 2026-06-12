import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { SchoolClass, SubjectRequirement, WorkspaceSubject } from "../../types";

export default function SubjectRequirementsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [requirements, setRequirements] = useState<SubjectRequirement[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<WorkspaceSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    classId: "",
    subjectId: "",
    periodsPerWeek: "5",
    doublePeriodsRequired: "0",
  });

  const loadRequirements = useCallback(() => {
    apiFetch<SubjectRequirement[]>("/timetable/subject-requirements")
      .then(setRequirements)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load requirements"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRequirements();
    if (canManage) {
      Promise.all([
        apiFetch<SchoolClass[]>("/timetable/classes?active=true"),
        apiFetch<WorkspaceSubject[]>("/subjects?active=true"),
      ]).then(([c, s]) => {
        setClasses(c);
        setSubjects(s);
      });
    }
  }, [canManage, loadRequirements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/timetable/subject-requirements", {
        method: "POST",
        body: JSON.stringify({
          classId: form.classId,
          subjectId: form.subjectId,
          periodsPerWeek: Number(form.periodsPerWeek),
          doublePeriodsRequired: Number(form.doublePeriodsRequired),
        }),
      });
      setForm({
        classId: form.classId,
        subjectId: "",
        periodsPerWeek: form.periodsPerWeek,
        doublePeriodsRequired: "0",
      });
      loadRequirements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create requirement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Subject Requirements</h1>
      <p className="sc-page-subtitle">
        Define how many periods each class needs per subject each week.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create requirement</h2>
          <div className="sc-form-grid">
            <label>
              Class
              <select
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </select>
            </label>
            <label>
              Periods per week
              <input
                type="number"
                min={1}
                value={form.periodsPerWeek}
                onChange={(e) => setForm({ ...form, periodsPerWeek: e.target.value })}
                required
              />
            </label>
            <label>
              Double periods required
              <input
                type="number"
                min={0}
                value={form.doublePeriodsRequired}
                onChange={(e) => setForm({ ...form, doublePeriodsRequired: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create requirement"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading requirements…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Subject</th>
                <th>Periods/week</th>
                <th>Double periods</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.id}>
                  <td>{r.class.code} — {r.class.name}</td>
                  <td>{r.subject.code} — {r.subject.name}</td>
                  <td>{r.periodsPerWeek}</td>
                  <td>{r.doublePeriodsRequired}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
