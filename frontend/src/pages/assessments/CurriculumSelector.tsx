import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { CurriculumRef, GradeRef, PhaseRef, SubjectRef } from "../../types";

type Props = {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  onCurriculumIdChange: (id: string) => void;
  onPhaseIdChange: (id: string) => void;
  onGradeIdChange: (id: string) => void;
  onSubjectIdChange: (id: string) => void;
  disabled?: boolean;
};

export default function CurriculumSelector({
  curriculumId,
  phaseId,
  gradeId,
  subjectId,
  onCurriculumIdChange,
  onPhaseIdChange,
  onGradeIdChange,
  onSubjectIdChange,
  disabled,
}: Props) {
  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);

  useEffect(() => {
    apiFetch<CurriculumRef[]>("/curriculum").then(setCurriculums).catch(() => {});
  }, []);

  useEffect(() => {
    if (!curriculumId) return;
    apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`).then(setPhases);
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) return;
    Promise.all([
      apiFetch<GradeRef[]>(`/curriculum/phases/${phaseId}/grades`),
      apiFetch<SubjectRef[]>(`/curriculum/phases/${phaseId}/subjects`),
    ]).then(([g, s]) => {
      setGrades(g);
      setSubjects(s);
    });
  }, [phaseId]);

  return (
    <div className="sc-form-grid sc-form-grid-2">
      <div>
        <label className="sc-label">Curriculum</label>
        <select
          className="sc-select"
          value={curriculumId}
          onChange={(e) => onCurriculumIdChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select…</option>
          {curriculums.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="sc-label">Phase</label>
        <select
          className="sc-select"
          value={phaseId}
          onChange={(e) => onPhaseIdChange(e.target.value)}
          disabled={disabled || !curriculumId}
        >
          <option value="">Select…</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="sc-label">Grade</label>
        <select
          className="sc-select"
          value={gradeId}
          onChange={(e) => onGradeIdChange(e.target.value)}
          disabled={disabled || !phaseId}
        >
          <option value="">Select…</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="sc-label">Subject</label>
        <select
          className="sc-select"
          value={subjectId}
          onChange={(e) => onSubjectIdChange(e.target.value)}
          disabled={disabled || !phaseId}
        >
          <option value="">Select…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.category ? ` (${s.category.toLowerCase()})` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function curriculumContextReady(
  curriculumId: string,
  phaseId: string,
  gradeId: string,
  subjectId: string
) {
  return Boolean(curriculumId && phaseId && gradeId && subjectId);
}
