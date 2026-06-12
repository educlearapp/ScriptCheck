import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type {
  DayOfWeek,
  LessonEntry,
  LessonTimetable,
  PeriodDefinition,
  SchoolClass,
  TimetableRoom,
  TimetableReadiness,
  TimetableGenerateResult,
  TeacherAssignment,
  WorkspaceSubject,
  WorkspaceUser,
} from "../../types";
import LessonTimetableGrid from "./LessonTimetableGrid";
import ReadinessPanel from "./ReadinessPanel";
import { formatRoomType, getPreferredRoomType, getRoomSelectionWarnings } from "./roomIntelligence";
import { getTeacherSelectionWorkloadWarnings } from "./teacherWorkload";
import "./timetable-grid.css";

type CellSelection = {
  day: DayOfWeek;
  period: PeriodDefinition;
  entry?: LessonEntry;
};

export default function LessonTimetableBuilder() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");
  const canPublish = hasPermission(user, "timetable.publish");

  const [timetable, setTimetable] = useState<LessonTimetable | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [entries, setEntries] = useState<LessonEntry[]>([]);
  const [readiness, setReadiness] = useState<TimetableReadiness | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
  const [subjects, setSubjects] = useState<WorkspaceSubject[]>([]);
  const [rooms, setRooms] = useState<TimetableRoom[]>([]);
  const [teachers, setTeachers] = useState<WorkspaceUser[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<TimetableGenerateResult | null>(null);
  const [cell, setCell] = useState<CellSelection | null>(null);
  const [teacherEntriesForWorkload, setTeacherEntriesForWorkload] = useState<LessonEntry[]>([]);
  const [form, setForm] = useState({
    subjectId: "",
    teacherUserId: "",
    roomId: "",
    isDoublePeriod: false,
    locked: false,
    notes: "",
  });

  const isDraft = timetable?.status === "DRAFT";
  const readonly = !canManage || !isDraft;

  const loadTimetable = useCallback(() => {
    if (!id) return;
    apiFetch<LessonTimetable>(`/timetable/lessons/${id}`)
      .then(setTimetable)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load timetable"));
  }, [id]);

  const loadEntries = useCallback(() => {
    if (!id || !selectedClassId) return;
    apiFetch<LessonEntry[]>(
      `/timetable/lessons/${id}/entries?schoolClassId=${selectedClassId}`
    ).then(setEntries);
  }, [id, selectedClassId]);

  const loadReadiness = useCallback(() => {
    if (!id) return;
    apiFetch<TimetableReadiness>(`/timetable/lessons/${id}/readiness`)
      .then(setReadiness)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load readiness"));
  }, [id]);

  const runValidate = useCallback(() => {
    if (!id) return;
    apiFetch<TimetableReadiness>(`/timetable/lessons/${id}/validate`, { method: "POST" })
      .then(setReadiness)
      .catch((err) => setError(err instanceof Error ? err.message : "Validation failed"));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch<LessonTimetable>(`/timetable/lessons/${id}`),
      apiFetch<SchoolClass[]>("/timetable/classes?active=true"),
      apiFetch<WorkspaceSubject[]>("/subjects?active=true"),
      apiFetch<TimetableRoom[]>("/timetable/rooms?active=true"),
      apiFetch<TeacherAssignment[]>("/timetable/teacher-assignments?active=true"),
      hasPermission(user, "users.view")
        ? apiFetch<WorkspaceUser[]>("/users").catch(() => [] as WorkspaceUser[])
        : Promise.resolve([] as WorkspaceUser[]),
    ])
      .then(([tt, cls, subs, rms, asg, usrs]) => {
        setTimetable(tt);
        setClasses(cls);
        setSubjects(subs);
        setRooms(rms);
        setAssignments(asg);
        setTeachers(usrs);
        if (cls[0]) setSelectedClassId(cls[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id, user]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness, entries.length]);

  useEffect(() => {
    if (!id || !cell || !form.teacherUserId) {
      setTeacherEntriesForWorkload([]);
      return;
    }
    apiFetch<LessonEntry[]>(
      `/timetable/lessons/${id}/entries?teacherUserId=${form.teacherUserId}`
    )
      .then(setTeacherEntriesForWorkload)
      .catch(() => setTeacherEntriesForWorkload([]));
  }, [id, cell, form.teacherUserId]);

  const openCell = (day: DayOfWeek, period: PeriodDefinition, entry?: LessonEntry) => {
    if (readonly) return;
    setCell({ day, period, entry });
    if (entry) {
      setForm({
        subjectId: entry.subjectId,
        teacherUserId: entry.teacherUserId,
        roomId: entry.roomId ?? "",
        isDoublePeriod: entry.isDoublePeriod,
        locked: entry.locked,
        notes: entry.notes ?? "",
      });
    } else {
      const classAssignments = assignments.filter((a) => a.class.id === selectedClassId);
      const first = classAssignments[0];
      setForm({
        subjectId: first?.subject.id ?? "",
        teacherUserId: first?.teacher.id ?? "",
        roomId: "",
        isDoublePeriod: false,
        locked: false,
        notes: "",
      });
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    const classAssignments = assignments.filter((a) => a.class.id === selectedClassId);
    if (classAssignments.length === 0) return true;
    return classAssignments.some((a) => a.subject.id === s.id);
  });

  const onSubjectChange = (subjectId: string) => {
    const match = assignments.find(
      (a) => a.class.id === selectedClassId && a.subject.id === subjectId
    );
    setForm((f) => ({
      ...f,
      subjectId,
      teacherUserId: match?.teacher.id ?? f.teacherUserId,
    }));
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedSubject = subjects.find((s) => s.id === form.subjectId);
  const selectedRoom = rooms.find((r) => r.id === form.roomId);

  const roomSelectionWarnings = getRoomSelectionWarnings({
    room: selectedRoom,
    subject: selectedSubject,
    learnerCount: selectedClass?.learnerCount ?? 0,
  });

  const preferredRoomType = selectedSubject ? getPreferredRoomType(selectedSubject) : null;

  const teacherWorkloadWarnings =
    cell && form.teacherUserId && timetable
      ? getTeacherSelectionWorkloadWarnings({
          periods: timetable.template.periods,
          teacherEntries: teacherEntriesForWorkload,
          dayOfWeek: cell.day,
          periodId: cell.period.id,
          teacherUserId: form.teacherUserId,
          isDoublePeriod: form.isDoublePeriod,
          excludeEntryId: cell.entry?.id,
        })
      : [];

  const teacherAssignmentWarning = (() => {
    if (!form.teacherUserId || !form.subjectId || !selectedClassId) return "";
    const key = `${form.teacherUserId}:${selectedClassId}:${form.subjectId}`;
    const assigned = assignments.some(
      (a) => `${a.teacher.id}:${a.class.id}:${a.subject.id}` === key
    );
    if (assigned) return "";
    const teacher = teachers.find((t) => t.id === form.teacherUserId);
    const subject = subjects.find((s) => s.id === form.subjectId);
    const schoolClass = classes.find((c) => c.id === selectedClassId);
    return `${teacher?.fullName ?? "Teacher"} is not assigned to teach ${subject?.code ?? "subject"} for ${schoolClass?.code ?? "class"}. This will block publishing.`;
  })();

  const handleSave = async () => {
    if (!id || !cell || !selectedClassId) return;
    setSaving(true);
    setError("");
    setSaveWarning("");
    try {
      const payload = {
        dayOfWeek: cell.day,
        periodId: cell.period.id,
        schoolClassId: selectedClassId,
        subjectId: form.subjectId,
        teacherUserId: form.teacherUserId,
        roomId: form.roomId || null,
        isDoublePeriod: form.isDoublePeriod,
        locked: form.locked,
        notes: form.notes || null,
      };

      type SaveResult = {
        teacherAssignmentWarning?: string | null;
        workloadWarnings?: string[];
      };
      let result: SaveResult;
      if (cell.entry) {
        result = await apiFetch<SaveResult>(`/timetable/lessons/${id}/entries/${cell.entry.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        result = await apiFetch<SaveResult>(`/timetable/lessons/${id}/entries`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      const warnings = [
        result.teacherAssignmentWarning,
        ...(result.workloadWarnings ?? []),
      ].filter(Boolean) as string[];
      if (warnings.length > 0) {
        setSaveWarning(warnings.join(" "));
      } else {
        setCell(null);
      }
      loadEntries();
      loadReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !cell?.entry || !confirm("Delete this lesson?")) return;
    setSaving(true);
    try {
      await apiFetch(`/timetable/lessons/${id}/entries/${cell.entry.id}`, {
        method: "DELETE",
      });
      setCell(null);
      loadEntries();
      runValidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete lesson");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id || !confirm("Publish this timetable? All blocking readiness checks must pass.")) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/timetable/lessons/${id}/publish`, { method: "POST" });
      loadTimetable();
      runValidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
      runValidate();
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    if (
      !confirm(
        "Auto-fill missing lessons? This adds new entries to empty slots only. Locked and existing entries will not be changed."
      )
    ) {
      return;
    }
    setGenerating(true);
    setError("");
    setGenerateResult(null);
    try {
      const result = await apiFetch<TimetableGenerateResult>(
        `/timetable/lessons/${id}/generate`,
        { method: "POST" }
      );
      setGenerateResult(result);
      setReadiness(result.readiness);
      loadEntries();
      loadReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fill failed");
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !timetable) {
    return <p style={{ padding: "1.25rem" }}>Loading builder…</p>;
  }

  return (
    <div>
      <div style={{ marginBottom: "0.5rem" }}>
        <Link to="/timetable/lessons" className="sc-btn sc-btn-ghost">
          ← Timetables
        </Link>
      </div>

      <h1 className="sc-page-title">{timetable.title}</h1>
      <p className="sc-page-subtitle">
        {timetable.academicYear} · Term {timetable.term} · {timetable.template.name} ·{" "}
        <span className={`sc-badge ${timetable.status === "PUBLISHED" ? "sc-badge-success" : ""}`}>
          {timetable.status}
        </span>
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}
      {saveWarning ? (
        <div className="sc-alert sc-alert-warning" style={{ marginTop: "0.75rem" }}>
          {saveWarning}
        </div>
      ) : null}

      {generateResult ? (
        <div className="sc-card" style={{ padding: "1rem", marginTop: "0.75rem" }}>
          <h3 style={{ marginTop: 0 }}>Auto-fill result</h3>
          <p>
            Generated <strong>{generateResult.generatedCount}</strong> lesson
            {generateResult.generatedCount === 1 ? "" : "s"}
            {generateResult.skippedCount > 0 ? (
              <> · {generateResult.skippedCount} period slot(s) could not be placed</>
            ) : null}
          </p>
          {generateResult.warnings.length > 0 ? (
            <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
              {generateResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          {generateResult.unplacedRequirements.length > 0 ? (
            <>
              <p style={{ marginBottom: "0.5rem" }}>
                <strong>{generateResult.unplacedRequirements.length}</strong> requirement
                {generateResult.unplacedRequirements.length === 1 ? "" : "s"} still incomplete:
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {generateResult.unplacedRequirements.map((u) => (
                  <li key={`${u.classId}:${u.subjectId}`}>
                    {u.classCode} {u.subjectCode}: {u.reason}
                    {u.missingPeriods > 0 ? ` (${u.missingPeriods} period(s) short` : ""}
                    {u.missingDoublePeriods > 0
                      ? `, ${u.missingDoublePeriods} double(s) short`
                      : ""}
                    {u.missingPeriods > 0 ? ")" : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : generateResult.generatedCount > 0 ? (
            <p style={{ margin: 0, color: "var(--sc-success, #15803d)" }}>
              All requirements are now fully scheduled.
            </p>
          ) : (
            <p style={{ margin: 0 }}>No missing lessons to fill.</p>
          )}
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            style={{ marginTop: "0.75rem" }}
            onClick={() => setGenerateResult(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="tt-toolbar sc-card" style={{ padding: "1rem" }}>
        <label>
          Class
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{ marginLeft: "0.5rem" }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="sc-btn sc-btn-secondary" onClick={runValidate}>
          Validate
        </button>

        {canManage && isDraft ? (
          <button
            type="button"
            className="sc-btn sc-btn-secondary"
            onClick={handleGenerate}
            disabled={generating || saving}
          >
            {generating ? "Generating…" : "Auto Fill Missing Lessons"}
          </button>
        ) : null}

        {canPublish && isDraft ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            onClick={handlePublish}
            disabled={saving || (readiness != null && !readiness.canPublish)}
            title={readiness && !readiness.canPublish ? readiness.blockingReasons.join("; ") : undefined}
          >
            {readiness?.canPublish ? "Publish" : "Publish blocked"}
          </button>
        ) : null}

        <Link
          to={`/timetable/lessons/${id}/view/class/${selectedClassId}`}
          className="sc-btn sc-btn-ghost"
        >
          Class view
        </Link>

        {teachers.length ? (
          <Link
            to={`/timetable/lessons/${id}/view/teacher/${teachers[0].id}`}
            className="sc-btn sc-btn-ghost"
          >
            Teacher views
          </Link>
        ) : null}

        {rooms.length ? (
          <Link
            to={`/timetable/lessons/${id}/view/room/${rooms[0].id}`}
            className="sc-btn sc-btn-ghost"
          >
            Room views
          </Link>
        ) : null}
      </div>

      <ReadinessPanel readiness={readiness} selectedClassId={selectedClassId} />

      <LessonTimetableGrid
        periods={timetable.template.periods}
        entries={entries}
        clashes={[...(readiness?.hardClashes ?? []), ...(readiness?.warnings ?? [])]}
        readonly={readonly}
        onCellClick={openCell}
      />

      {cell ? (
        <div className="tt-modal-backdrop" onClick={() => setCell(null)}>
          <div className="tt-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>
              {cell.entry ? "Edit lesson" : "Add lesson"} — {cell.day} {cell.period.label}
            </h2>

            <div className="sc-form-grid">
              <label>
                Subject
                <select
                  value={form.subjectId}
                  onChange={(e) => onSubjectChange(e.target.value)}
                  required
                  disabled={readonly || (cell.entry?.locked && !form.locked)}
                >
                  <option value="">Select…</option>
                  {filteredSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Teacher
                <select
                  value={form.teacherUserId}
                  onChange={(e) => setForm({ ...form, teacherUserId: e.target.value })}
                  required
                  disabled={readonly || (cell.entry?.locked && !form.locked)}
                >
                  <option value="">Select…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Room
                {preferredRoomType ? (
                  <span className="tt-room-hint" style={{ marginLeft: "0.35rem" }}>
                    (prefers {formatRoomType(preferredRoomType)})
                  </span>
                ) : null}
                <select
                  value={form.roomId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  disabled={readonly || (cell.entry?.locked && !form.locked)}
                >
                  <option value="">None</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name} ({formatRoomType(r.roomType)}, cap. {r.capacity})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={form.isDoublePeriod}
                  onChange={(e) => setForm({ ...form, isDoublePeriod: e.target.checked })}
                  disabled={readonly || (cell.entry?.locked && !form.locked)}
                />
                Double period
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={form.locked}
                  onChange={(e) => setForm({ ...form, locked: e.target.checked })}
                  disabled={readonly}
                />
                Locked
              </label>
              <label>
                Notes
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  disabled={readonly || (cell.entry?.locked && !form.locked)}
                />
              </label>
            </div>

            {roomSelectionWarnings.length > 0 ? (
              <div className="sc-alert sc-alert-warning" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                {roomSelectionWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
                <div style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                  Room issues are warnings only — you can still save in draft.
                </div>
              </div>
            ) : null}

            {teacherAssignmentWarning ? (
              <div className="sc-alert sc-alert-warning" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                {teacherAssignmentWarning}
              </div>
            ) : null}

            {teacherWorkloadWarnings.length > 0 ? (
              <div className="sc-alert sc-alert-warning" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                {teacherWorkloadWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
                <div style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                  Workload issues are warnings only — you can still save in draft.
                </div>
              </div>
            ) : null}

            <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
              {!readonly ? (
                <>
                  <button
                    type="button"
                    className="sc-btn sc-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {cell.entry && !cell.entry.locked ? (
                    <button
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      onClick={handleDelete}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setCell(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
