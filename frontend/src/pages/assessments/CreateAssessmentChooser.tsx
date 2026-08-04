import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import type {
  Assessment,
  AssessmentType,
  CurriculumRef,
  GradeRef,
  PhaseRef,
  SubjectRef,
} from "../../types";
import "./CreateAssessmentChooser.css";

type ChooserView = "menu" | "have-paper";

function friendlyType(title: string): AssessmentType {
  const lower = title.toLowerCase();
  if (lower.includes("exam")) return "EXAM";
  if (lower.includes("project")) return "PROJECT";
  if (lower.includes("assignment")) return "ASSIGNMENT";
  return "TEST";
}

export default function CreateAssessmentChooser() {
  const navigate = useNavigate();
  const [view, setView] = useState<ChooserView>("menu");
  const creatingRef = useRef(false);

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [totalMarks, setTotalMarks] = useState("50");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurriculumLoading(true);
    apiFetch<CurriculumRef[]>("/curriculum", { cache: "no-store" })
      .then((list) => {
        setCurriculums(list);
        if (list.length >= 1) setCurriculumId(list[0].id);
      })
      .catch(() => setCurriculums([]))
      .finally(() => setCurriculumLoading(false));
  }, []);

  useEffect(() => {
    if (!curriculumId) {
      setPhases([]);
      setGrades([]);
      return;
    }
    setGradesLoading(true);
    apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`, { cache: "no-store" })
      .then(async (phaseList) => {
        setPhases(phaseList);
        const gradeGroups = await Promise.all(
          phaseList.map((phase) =>
            apiFetch<GradeRef[]>(`/curriculum/phases/${phase.id}/grades`, {
              cache: "no-store",
            }).catch(() => [])
          )
        );
        setGrades(gradeGroups.flat());
      })
      .catch(() => {
        setPhases([]);
        setGrades([]);
      })
      .finally(() => setGradesLoading(false));
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) {
      setSubjects([]);
      return;
    }
    setSubjectsLoading(true);
    apiFetch<SubjectRef[]>(`/curriculum/phases/${phaseId}/subjects`, { cache: "no-store" })
      .then(setSubjects)
      .catch(() => setSubjects([]))
      .finally(() => setSubjectsLoading(false));
  }, [phaseId]);

  const canCreate =
    curriculumId &&
    phaseId &&
    gradeId &&
    subjectId &&
    title.trim() &&
    Number(totalMarks) > 0;

  async function createHavePaperAssessment() {
    if (!canCreate || creatingRef.current) return;
    creatingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const assessment = await apiFetch<Assessment>("/assessments", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          curriculumId,
          phaseId,
          gradeId,
          subjectId,
          assessmentType: friendlyType(title),
          term: term.trim() || undefined,
          totalMarks: Number(totalMarks),
          assessmentDate: assessmentDate || undefined,
        }),
      });
      navigate(`/assessments/${assessment.id}/setup?from=have-paper`);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "I could not create the assessment. Please check the details and try again."
      );
      creatingRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  if (view === "have-paper") {
    return (
      <div className="sc-create-chooser">
        <button type="button" className="sc-detail-back sc-create-chooser-back" onClick={() => setView("menu")}>
          ← Back to choices
        </button>
        <h1 className="sc-page-title">I Already Have My Paper</h1>
        <p className="sc-page-subtitle">
          Tell ScriptCheck about the assessment, then upload your question paper and memorandum.
        </p>

        {error ? <p className="sc-error">{error}</p> : null}

        <section className="sc-card sc-card-padded sc-create-chooser-form" aria-label="Assessment details">
          <div className="sc-create-chooser-grid">
            <label>
              Grade
              <select
                className="sc-select"
                value={gradeId}
                disabled={!curriculumId || gradesLoading}
                onChange={(e) => {
                  const grade = grades.find((item) => item.id === e.target.value);
                  setGradeId(e.target.value);
                  if (grade?.phaseId) setPhaseId(grade.phaseId);
                  else setPhaseId("");
                  setSubjectId("");
                }}
              >
                <option value="">{gradesLoading ? "Loading grades..." : "Choose grade"}</option>
                {phases.map((phase) => (
                  <optgroup key={phase.id} label={phase.name}>
                    {grades
                      .filter((g) => g.phaseId === phase.id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label>
              Subject
              <select
                className="sc-select"
                value={subjectId}
                disabled={!phaseId || subjectsLoading}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">{subjectsLoading ? "Loading subjects..." : "Choose subject"}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Assessment name
              <input
                className="sc-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Term 2 Life Skills Test"
              />
            </label>

            <label>
              Assessment date
              <input
                className="sc-input"
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </label>

            <label>
              Total marks
              <input
                className="sc-input"
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-create-chooser-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide Advanced Options" : "Advanced Options"}
          </button>

          {showAdvanced ? (
            <div className="sc-create-chooser-grid" style={{ marginTop: "0.75rem" }}>
              <label>
                Curriculum
                <select
                  className="sc-select"
                  value={curriculumId}
                  disabled={curriculumLoading}
                  onChange={(e) => {
                    setCurriculumId(e.target.value);
                    setPhaseId("");
                    setGradeId("");
                    setSubjectId("");
                  }}
                >
                  <option value="">
                    {curriculumLoading ? "Loading curriculum..." : "Choose curriculum"}
                  </option>
                  {curriculums.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Term
                <input
                  className="sc-input"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g. Term 2"
                />
              </label>
            </div>
          ) : null}

          <div className="sc-form-actions" style={{ marginTop: "1.25rem" }}>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setView("menu")}>
              Back
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!canCreate || busy}
              onClick={() => void createHavePaperAssessment()}
            >
              {busy ? "Creating..." : "Upload My Paper"}
            </button>
          </div>
          <p className="sc-create-chooser-hint">
            Next you will upload your question paper and memorandum (if you have one).
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="sc-create-chooser">
      <Link to="/dashboard" className="sc-detail-back">
        ← Back to Home
      </Link>
      <h1 className="sc-page-title">Create Assessment</h1>
      <p className="sc-page-subtitle">Choose one way to start. You can change your mind later.</p>

      <div className="sc-create-chooser-options" role="list">
        <article className="sc-create-chooser-card" role="listitem">
          <h2>I Already Have My Paper</h2>
          <p>Upload your question paper and memorandum, then continue to marking.</p>
          <button
            type="button"
            className="sc-btn sc-btn-primary sc-create-chooser-cta"
            onClick={() => setView("have-paper")}
          >
            Upload My Paper
          </button>
        </article>

        <article className="sc-create-chooser-card" role="listitem">
          <h2>Help Me Create a Paper</h2>
          <p>Build an assessment step by step using questions from ScriptCheck or your own questions.</p>
          <Link to="/assessments/new/build" className="sc-btn sc-btn-primary sc-create-chooser-cta">
            Create My Assessment
          </Link>
        </article>

        <article className="sc-create-chooser-card" role="listitem">
          <h2>I Only Want to Mark Papers</h2>
          <p>Choose an existing assessment and upload the learner papers.</p>
          <Link to="/marking" className="sc-btn sc-btn-primary sc-create-chooser-cta">
            Go to Mark Papers
          </Link>
        </article>
      </div>
    </div>
  );
}
