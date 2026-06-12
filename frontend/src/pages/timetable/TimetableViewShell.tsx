import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { LessonEntry, LessonTimetable, TimetableValidation } from "../../types";
import LessonTimetableGrid, { ClashPanel } from "./LessonTimetableGrid";
import "./timetable-grid.css";

type Props = {
  title: string;
  subtitle: string;
  queryParam: "schoolClassId" | "teacherUserId" | "roomId";
  paramKey: "classId" | "teacherId" | "roomId";
  showClass?: boolean;
};

export default function TimetableViewShell({
  title,
  subtitle,
  queryParam,
  paramKey,
  showClass = false,
}: Props) {
  const { id, [paramKey]: entityId } = useParams<{ id: string; classId?: string; teacherId?: string; roomId?: string }>();
  const [timetable, setTimetable] = useState<LessonTimetable | null>(null);
  const [entries, setEntries] = useState<LessonEntry[]>([]);
  const [validation, setValidation] = useState<TimetableValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!id || !entityId) return;
    setLoading(true);
    Promise.all([
      apiFetch<LessonTimetable>(`/timetable/lessons/${id}`),
      apiFetch<LessonEntry[]>(`/timetable/lessons/${id}/entries?${queryParam}=${entityId}`),
      apiFetch<TimetableValidation>(`/timetable/lessons/${id}/validate`, { method: "POST" }),
    ])
      .then(([tt, ents, val]) => {
        setTimetable(tt);
        setEntries(ents);
        setValidation(val);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load view"))
      .finally(() => setLoading(false));
  }, [id, entityId, queryParam]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !timetable) {
    return <p style={{ padding: "1.25rem" }}>Loading…</p>;
  }

  const relevantClashes = validation
    ? {
        ...validation,
        hardClashes: validation.hardClashes.filter(
          (c) =>
            entries.some((e) => e.id === c.entryId || e.id === c.conflictingEntryId)
        ),
        warnings: validation.warnings.filter(
          (c) =>
            entries.some((e) => e.id === c.entryId || e.id === c.conflictingEntryId)
        ),
      }
    : null;

  return (
    <div>
      <div style={{ marginBottom: "0.5rem" }}>
        <Link to={`/timetable/lessons/${id}/builder`} className="sc-btn sc-btn-ghost">
          ← Builder
        </Link>
      </div>

      <h1 className="sc-page-title">{title}</h1>
      <p className="sc-page-subtitle">{subtitle}</p>
      <p className="sc-page-subtitle">
        {timetable.title} · {timetable.academicYear} Term {timetable.term}
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      <ClashPanel validation={relevantClashes} />

      <LessonTimetableGrid
        periods={timetable.template.periods}
        entries={entries}
        clashes={[...(relevantClashes?.hardClashes ?? []), ...(relevantClashes?.warnings ?? [])]}
        readonly
        showClass={showClass}
      />
    </div>
  );
}
