import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { CurriculumRef, GradeRef, PhaseRef, SubjectRef } from "../../types";
import {
  loadGradesAndSubjectsForPhase,
  phaseCodeFromPhases,
} from "../../utils/curriculumSubjects";

type Props = {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  onCurriculumIdChange: (id: string) => void;
  onPhaseIdChange: (id: string) => void;
  onGradeIdChange: (id: string) => void;
  onSubjectIdChange: (id: string) => void;
  onCurriculumError: (message: string | null) => void;
  disabled?: boolean;
};

function formatCurriculumLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Failed to load curriculum";
  if (msg.includes("403") || /insufficient permissions/i.test(msg)) {
    return "You do not have permission to view curriculum. Ask your school administrator to grant curriculum access.";
  }
  if (msg.includes("401") || /authentication required/i.test(msg)) {
    return "Your session expired. Sign in again to load curriculum options.";
  }
  return msg;
}

export function markingCurriculumReady(
  curriculumId: string,
  phaseId: string,
  gradeId: string,
  subjectId: string
): boolean {
  return Boolean(curriculumId && phaseId && gradeId && subjectId);
}

export default function MarkingCurriculumFields({
  curriculumId,
  phaseId,
  gradeId,
  subjectId,
  onCurriculumIdChange,
  onPhaseIdChange,
  onGradeIdChange,
  onSubjectIdChange,
  onCurriculumError,
  disabled,
}: Props) {
  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(true);

  const reportError = useCallback(
    (message: string | null) => {
      onCurriculumError(message);
    },
    [onCurriculumError]
  );

  useEffect(() => {
    setLoadingCurriculum(true);
    reportError(null);

    void apiFetch<CurriculumRef[]>("/curriculum")
      .then((list) => {
        setCurriculums(list);
        if (list.length === 0) {
          reportError(
            "No curriculum found in this workspace. Your administrator must configure curriculum before marking jobs can be created."
          );
          return;
        }
        reportError(null);
      })
      .catch((err) => {
        setCurriculums([]);
        reportError(formatCurriculumLoadError(err));
      })
      .finally(() => setLoadingCurriculum(false));
  }, [reportError]);

  useEffect(() => {
    if (loadingCurriculum || curriculums.length === 0 || curriculumId) return;
    onCurriculumIdChange(curriculums[0].id);
  }, [loadingCurriculum, curriculums, curriculumId, onCurriculumIdChange]);

  useEffect(() => {
    if (!curriculumId) {
      setPhases([]);
      return;
    }
    void apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`)
      .then(setPhases)
      .catch(() => setPhases([]));
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) {
      setGrades([]);
      setSubjects([]);
      return;
    }
    const phaseCode = phaseCodeFromPhases(phases, phaseId);
    void loadGradesAndSubjectsForPhase(phaseId, { gradeId: gradeId || undefined, phaseCode })
      .then(({ grades: g, subjects: s }) => {
        setGrades(g);
        setSubjects(s);
      })
      .catch(() => {
        setGrades([]);
        setSubjects([]);
      });
  }, [phaseId, phases, gradeId]);

  return (
    <div className="sc-marking-curriculum-fields">
      {loadingCurriculum ? (
        <p className="sc-marking-hint">Loading curriculum options…</p>
      ) : null}

      <div className="sc-form-grid sc-form-grid-2">
        <label className="sc-label">
          Curriculum
          <select
            className="sc-select"
            value={curriculumId}
            disabled={disabled || loadingCurriculum || curriculums.length === 0}
            onChange={(e) => onCurriculumIdChange(e.target.value)}
          >
            <option value="">Select…</option>
            {curriculums.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sc-label">
          Phase
          <select
            className="sc-select"
            value={phaseId}
            disabled={disabled || !curriculumId}
            onChange={(e) => onPhaseIdChange(e.target.value)}
          >
            <option value="">Select…</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sc-label">
          Grade
          <select
            className="sc-select"
            value={gradeId}
            disabled={disabled || !phaseId}
            onChange={(e) => onGradeIdChange(e.target.value)}
          >
            <option value="">Select…</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sc-label">
          Subject
          <select
            className="sc-select"
            value={subjectId}
            disabled={disabled || !phaseId}
            onChange={(e) => onSubjectIdChange(e.target.value)}
          >
            <option value="">Select…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.category ? ` (${s.category.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
          {phaseId && subjects.length === 0 ? (
            <span className="sc-marking-hint" style={{ fontSize: "0.8rem" }}>
              Loading subjects…
            </span>
          ) : null}
        </label>
      </div>
    </div>
  );
}
