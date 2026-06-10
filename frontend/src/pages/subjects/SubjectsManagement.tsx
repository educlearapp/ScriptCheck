import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type {
  CurriculumRef,
  GradeRef,
  PhaseRef,
  SubjectRef,
  WorkspaceSubject,
} from "../../types";

export default function SubjectsManagement() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "subjects.manage");

  const [subjects, setSubjects] = useState<WorkspaceSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [catalogSubjects, setCatalogSubjects] = useState<SubjectRef[]>([]);

  const [form, setForm] = useState({
    name: "",
    code: "",
    curriculumId: "",
    phaseId: "",
    gradeId: "",
    catalogSubjectId: "",
    department: "",
  });

  const loadSubjects = useCallback(() => {
    apiFetch<WorkspaceSubject[]>("/subjects")
      .then(setSubjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load subjects"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSubjects();
    apiFetch<CurriculumRef[]>("/curriculum").then(setCurriculums).catch(() => {});
  }, [loadSubjects]);

  useEffect(() => {
    if (!form.curriculumId) return;
    apiFetch<PhaseRef[]>(`/curriculum/${form.curriculumId}/phases`).then(setPhases);
  }, [form.curriculumId]);

  useEffect(() => {
    if (!form.phaseId) return;
    Promise.all([
      apiFetch<GradeRef[]>(`/curriculum/phases/${form.phaseId}/grades`),
      apiFetch<SubjectRef[]>(`/curriculum/phases/${form.phaseId}/subjects`),
    ]).then(([g, s]) => {
      setGrades(g);
      setCatalogSubjects(s);
    });
  }, [form.phaseId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/subjects", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          catalogSubjectId: form.catalogSubjectId || null,
          department: form.department || null,
        }),
      });
      setForm({
        name: "",
        code: "",
        curriculumId: form.curriculumId,
        phaseId: form.phaseId,
        gradeId: form.gradeId,
        catalogSubjectId: "",
        department: "",
      });
      loadSubjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create subject");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!canManage || !confirm("Archive this subject?")) return;
    try {
      await apiFetch(`/subjects/${id}/archive`, { method: "POST" });
      loadSubjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive subject");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Subject Management</h1>
      <p className="sc-page-subtitle">
        Manage school subject offerings with phase, grade, department and active status.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create subject</h2>
          <div className="sc-form-grid">
            <label>
              Subject name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Subject code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Department
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label>
              Curriculum
              <select
                value={form.curriculumId}
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value, phaseId: "", gradeId: "" })}
                required
              >
                <option value="">Select…</option>
                {curriculums.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Phase
              <select
                value={form.phaseId}
                onChange={(e) => setForm({ ...form, phaseId: e.target.value, gradeId: "" })}
                required
              >
                <option value="">Select…</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              Grade
              <select
                value={form.gradeId}
                onChange={(e) => setForm({ ...form, gradeId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label>
              Catalog subject (optional)
              <select
                value={form.catalogSubjectId}
                onChange={(e) => setForm({ ...form, catalogSubjectId: e.target.value })}
              >
                <option value="">None</option>
                {catalogSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create subject"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading subjects…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject</th>
                <th>Phase</th>
                <th>Grade</th>
                <th>Department</th>
                <th>Status</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.phase.name}</td>
                  <td>{s.grade.name}</td>
                  <td>{s.department ?? "—"}</td>
                  <td>
                    <span className={`sc-badge ${s.active ? "sc-badge-success" : "sc-badge-muted"}`}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <button type="button" className="sc-btn sc-btn-ghost" onClick={() => handleArchive(s.id)}>
                        Archive
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
