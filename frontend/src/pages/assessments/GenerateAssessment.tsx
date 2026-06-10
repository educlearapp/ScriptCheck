import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import type {
  AssessmentType,
  CurriculumRef,
  CurriculumTopic,
  GenerationDifficulty,
  GenerationMode,
  GenerationRequest,
  GradeRef,
  PhaseRef,
  SubjectRef,
} from "../../types";
import "./GenerateAssessment.css";

const ASSESSMENT_TYPES: AssessmentType[] = [
  "TEST",
  "EXAM",
  "ASSIGNMENT",
  "SBA_TASK",
  "PROJECT",
  "PRACTICAL",
  "ORAL",
  "OTHER",
];

const DIFFICULTIES: { value: GenerationDifficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "STANDARD", label: "Standard" },
  { value: "CHALLENGING", label: "Challenging" },
];

const OUTPUT_MODES: { value: GenerationMode; label: string; description: string }[] = [
  {
    value: "QUESTIONS_ONLY",
    label: "Questions Only",
    description: "Generated question paper without memo or mark guide.",
  },
  {
    value: "QUESTIONS_AND_MEMO",
    label: "Questions + Memo",
    description: "Questions with marking memo and expected answers.",
  },
  {
    value: "FULL_PACKAGE",
    label: "Full Assessment Package",
    description: "Complete package with questions, memo, and mark allocation.",
  },
];

const STEPS = [
  "Curriculum",
  "Assessment",
  "Difficulty",
  "Topics",
  "Output",
] as const;

export default function GenerateAssessment() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [assessmentType, setAssessmentType] = useState<AssessmentType>("TEST");
  const [term, setTerm] = useState("");
  const [title, setTitle] = useState("");
  const [totalMarks, setTotalMarks] = useState("50");
  const [difficulty, setDifficulty] = useState<GenerationDifficulty>("STANDARD");
  const [topics, setTopics] = useState<string[]>([]);
  const [curriculumTopics, setCurriculumTopics] = useState<CurriculumTopic[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [outputMode, setOutputMode] = useState<GenerationMode>("QUESTIONS_AND_MEMO");
  const [instructions, setInstructions] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<CurriculumRef[]>("/curriculum")
      .then((list) => {
        setCurriculums(list);
        if (list[0]) setCurriculumId(list[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load curriculums")
      );
  }, []);

  useEffect(() => {
    if (!curriculumId) return;
    setPhaseId("");
    setGradeId("");
    setSubjectId("");
    apiFetch<PhaseRef[]>(`/curriculum/${curriculumId}/phases`)
      .then((list) => {
        setPhases(list);
        if (list[0]) setPhaseId(list[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load phases")
      );
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) return;
    setGradeId("");
    setSubjectId("");
    Promise.all([
      apiFetch<GradeRef[]>(`/curriculum/phases/${phaseId}/grades`),
      apiFetch<SubjectRef[]>(`/curriculum/phases/${phaseId}/subjects`),
    ])
      .then(([gradeList, subjectList]) => {
        setGrades(gradeList);
        setSubjects(subjectList);
        if (gradeList[0]) setGradeId(gradeList[0].id);
        if (subjectList[0]) setSubjectId(subjectList[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load grade/subject data")
      );
  }, [phaseId]);

  useEffect(() => {
    if (!curriculumId || !phaseId || !gradeId || !subjectId) {
      setCurriculumTopics([]);
      setTopics([]);
      return;
    }
    setTopics([]);
    const params = new URLSearchParams({
      curriculumId, phaseId, gradeId, subjectId,
    });
    apiFetch<CurriculumTopic[]>(`/curriculum/topics?${params}`)
      .then((list) => {
        setCurriculumTopics(list);
        if (list.length > 0) {
          setTopics([list[0].topic]);
        }
      })
      .catch(() => setCurriculumTopics([]));
  }, [curriculumId, phaseId, gradeId, subjectId]);

  const step1Valid = curriculumId && phaseId && gradeId && subjectId;
  const step2Valid = title.trim() && Number(totalMarks) > 0;
  const step4Valid = topics.length > 0;

  const canNext =
    (step === 0 && step1Valid) ||
    (step === 1 && step2Valid) ||
    step === 2 ||
    (step === 3 && step4Valid) ||
    step === 4;

  const addTopic = () => {
    const value = newTopic.trim();
    if (!value || topics.includes(value)) return;
    setTopics((prev) => [...prev, value]);
    setNewTopic("");
  };

  const addTopicFromCatalog = (topic: string) => {
    if (!topic || topics.includes(topic)) return;
    setTopics((prev) => [...prev, topic]);
  };

  const removeTopic = (topic: string) => {
    setTopics((prev) => prev.filter((t) => t !== topic));
  };

  const handleGenerate = async () => {
    if (!step1Valid || !step2Valid || !step4Valid) {
      setError("Complete all required steps before generating.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await apiFetch<GenerationRequest>("/assessment-generation", {
        method: "POST",
        body: JSON.stringify({
          curriculumId,
          phaseId,
          gradeId,
          subjectId,
          assessmentType,
          term: term || null,
          title: title.trim(),
          totalMarks: Number(totalMarks),
          difficulty,
          topics,
          outputMode,
          instructions: instructions || null,
        }),
      });
      navigate(`/assessments/generate/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">AI Paper Generator</h1>
      <p className="sc-page-subtitle">
        Build an assessment with AI-assisted generation — mock engine for now, ready for OpenAI.
      </p>

      <div className="sc-gen-steps">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`sc-gen-step${
              index === step ? " is-active" : index < step ? " is-done" : ""
            }`}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <div
        className="sc-card sc-card-gold sc-form-grid"
        style={{ padding: "1.5rem", maxWidth: 800 }}
      >
        {step === 0 ? (
          <>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
              Step 1 — Curriculum context
            </h3>
            <div className="sc-form-grid sc-form-grid-2">
              <div>
                <label className="sc-label">Curriculum</label>
                <select
                  className="sc-select"
                  value={curriculumId}
                  onChange={(e) => setCurriculumId(e.target.value)}
                >
                  {curriculums.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sc-label">Phase</label>
                <select
                  className="sc-select"
                  value={phaseId}
                  onChange={(e) => setPhaseId(e.target.value)}
                  disabled={!curriculumId}
                >
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sc-label">Grade</label>
                <select
                  className="sc-select"
                  value={gradeId}
                  onChange={(e) => setGradeId(e.target.value)}
                  disabled={!phaseId}
                >
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sc-label">Subject</label>
                <select
                  className="sc-select"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  disabled={!phaseId}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
              Step 2 — Assessment details
            </h3>
            <div>
              <label className="sc-label">Title</label>
              <input
                className="sc-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Term 2 Mathematics Test"
              />
            </div>
            <div className="sc-form-grid sc-form-grid-2">
              <div>
                <label className="sc-label">Assessment type</label>
                <select
                  className="sc-select"
                  value={assessmentType}
                  onChange={(e) =>
                    setAssessmentType(e.target.value as AssessmentType)
                  }
                >
                  {ASSESSMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sc-label">Term</label>
                <input
                  className="sc-input"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Term 2"
                />
              </div>
              <div>
                <label className="sc-label">Total marks</label>
                <input
                  className="sc-input"
                  type="number"
                  min={1}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="sc-label">Instructions (optional)</label>
              <textarea
                className="sc-input"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Calculator allowed. Show all working."
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
              Step 3 — Difficulty
            </h3>
            <div className="sc-form-grid sc-form-grid-2">
              {DIFFICULTIES.map((d) => (
                <label
                  key={d.value}
                  className={`sc-output-option${
                    difficulty === d.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="difficulty"
                    checked={difficulty === d.value}
                    onChange={() => setDifficulty(d.value)}
                  />
                  <div>
                    <strong>{d.label}</strong>
                  </div>
                </label>
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
              Step 4 — Topics
            </h3>
            <p style={{ margin: 0, color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
              Select from curriculum topics. Custom topics are available only when none are defined.
            </p>

            {curriculumTopics.length > 0 ? (
              <div>
                <label className="sc-label">Curriculum topics</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem" }}>
                  {curriculumTopics.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      className="sc-btn sc-btn-ghost"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                      disabled={topics.includes(ct.topic)}
                      onClick={() => addTopicFromCatalog(ct.topic)}
                    >
                      + {ct.topic}{ct.subtopic ? ` / ${ct.subtopic}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                No curriculum topics defined — add a custom topic below.
              </p>
            )}

            <div className="sc-topic-list">
              {topics.map((topic) => (
                <div key={topic} className="sc-topic-row">
                  <span className="sc-badge sc-badge-gold" style={{ flex: 1 }}>
                    {topic}
                  </span>
                  <button
                    type="button"
                    className="sc-btn sc-btn-ghost"
                    onClick={() => removeTopic(topic)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {curriculumTopics.length === 0 ? (
              <div className="sc-topic-row">
                <input
                  className="sc-input"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Add a custom topic"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                />
                <button type="button" className="sc-btn sc-btn-ghost" onClick={addTopic}>
                  Add Topic
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
              Step 5 — Output type
            </h3>
            <div className="sc-output-options">
              {OUTPUT_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`sc-output-option${
                    outputMode === mode.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="outputMode"
                    checked={outputMode === mode.value}
                    onChange={() => setOutputMode(mode.value)}
                  />
                  <div>
                    <strong>{mode.label}</strong>
                    <p style={{ margin: "0.35rem 0 0", color: "var(--sc-text-muted)", fontSize: "0.85rem" }}>
                      {mode.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </>
        ) : null}

        {error ? <div className="sc-error">{error}</div> : null}

        <div className="sc-form-actions">
          {step > 0 ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
            >
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={loading || !canNext}
              onClick={handleGenerate}
            >
              {loading ? "Generating…" : "Generate Assessment"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
