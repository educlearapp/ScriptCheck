import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { SchoolClass, TeacherAssignment, WorkspaceSubject, WorkspaceUser } from "../../types";

export default function TeacherAssignmentsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<WorkspaceUser[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<WorkspaceSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ teacherId: "", classId: "", subjectId: "" });

  const loadAssignments = useCallback(() => {
    apiFetch<TeacherAssignment[]>("/timetable/teacher-assignments")
      .then(setAssignments)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load assignments"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAssignments();
    if (canManage) {
      Promise.all([
        apiFetch<WorkspaceUser[]>("/users").catch(() => [] as WorkspaceUser[]),
        apiFetch<SchoolClass[]>("/timetable/classes?active=true"),
        apiFetch<WorkspaceSubject[]>("/subjects?active=true"),
      ]).then(([u, c, s]) => {
        setTeachers(u);
        setClasses(c);
        setSubjects(s);
      });
    }
  }, [canManage, loadAssignments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/timetable/teacher-assignments", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ teacherId: form.teacherId, classId: form.classId, subjectId: "" });
      loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (assignment: TeacherAssignment) => {
    if (!canManage) return;
    try {
      await apiFetch(`/timetable/teacher-assignments/${assignment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !assignment.active }),
      });
      loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assignment");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Teacher Assignments</h1>
      <p className="sc-page-subtitle">
        Link teachers to classes and subjects for timetable generation.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create assignment</h2>
          <div className="sc-form-grid">
            <label>
              Teacher
              <select
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
            </label>
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
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create assignment"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading assignments…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Status</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.teacher.fullName}</td>
                  <td>{a.class.code} — {a.class.name}</td>
                  <td>{a.subject.code} — {a.subject.name}</td>
                  <td>
                    <span className={`sc-badge ${a.active ? "sc-badge-success" : "sc-badge-muted"}`}>
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <button type="button" className="sc-btn sc-btn-ghost" onClick={() => toggleActive(a)}>
                        {a.active ? "Deactivate" : "Activate"}
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
