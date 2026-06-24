import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiFetch } from "../../api";
import type {
  Assessment,
  AssessmentType,
  CurriculumRef,
  CurriculumTopic,
  GenerationDifficulty,
  GenerationRequest,
  GradeRef,
  PhaseRef,
  QuestionBankItem,
  SubjectRef,
} from "../../types";
import "./CreateAssessment.css";

type BuilderStep =
  | "welcome"
  | "details"
  | "method"
  | "bank"
  | "loading"
  | "preview"
  | "success";

type PreviewQuestion = {
  id: string;
  sourceItemId?: string;
  questionNumber: string;
  questionText: string;
  topic: string | null;
  marks: number;
  difficulty: string | null;
  expectedAnswer?: string | null;
};

const DIFFICULTIES = ["Easy", "Standard", "Challenging"];

function toDifficulty(value: string): GenerationDifficulty {
  if (value === "Easy") return "EASY";
  if (value === "Challenging") return "CHALLENGING";
  return "STANDARD";
}

function friendlyType(title: string): AssessmentType {
  const lower = title.toLowerCase();
  if (lower.includes("exam")) return "EXAM";
  if (lower.includes("project")) return "PROJECT";
  if (lower.includes("assignment")) return "ASSIGNMENT";
  return "TEST";
}

function makeOwnQuestions(totalMarks: number, topic: string): PreviewQuestion[] {
  const marks = Math.max(1, Math.round(totalMarks / 5));
  return Array.from({ length: 5 }, (_, index) => ({
    id: `own-${index + 1}`,
    questionNumber: String(index + 1),
    questionText: `Write your question ${index + 1} here.`,
    topic,
    marks,
    difficulty: "Standard",
    expectedAnswer: "",
  }));
}

export default function CreateAssessment() {
  const navigate = useNavigate();

  const [step, setStep] = useState<BuilderStep>("welcome");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdAssessment, setCreatedAssessment] = useState<Assessment | null>(null);

  const [curriculums, setCurriculums] = useState<CurriculumRef[]>([]);
  const [phases, setPhases] = useState<PhaseRef[]>([]);
  const [grades, setGrades] = useState<GradeRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [topics, setTopics] = useState<CurriculumTopic[]>([]);
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [curriculumLoadError, setCurriculumLoadError] = useState("");
  const [gradesLoading, setGradesLoading] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [curriculumId, setCurriculumId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState("");
  const [title, setTitle] = useState("");
  const [totalMarks, setTotalMarks] = useState("50");
  const [durationMinutes, setDurationMinutes] = useState("60");

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("Standard");
  const [bankMarks, setBankMarks] = useState("50");
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);

  const selectedCurriculum = curriculums.find((item) => item.id === curriculumId);
  const selectedGrade = grades.find((item) => item.id === gradeId);
  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const marksNumber = Math.max(1, Number(totalMarks) || 0);
  const bankMarksNumber = Math.max(1, Number(bankMarks) || marksNumber);

  const detailsReady = Boolean(
    curriculumId &&
      phaseId &&
      gradeId &&
      subjectId &&
      term.trim() &&
      title.trim() &&
      Number(totalMarks) > 0 &&
      Number(durationMinutes) > 0
  );

  useEffect(() => {
    setCurriculumLoading(true);
    setCurriculumLoadError("");
    apiFetch<CurriculumRef[]>("/curriculum", { cache: "no-store" })
      .then((list) => {
        setCurriculums(list);
        if (list.length === 0) {
          setCurriculumLoadError("I could not find the curriculum list. Please refresh and try again.");
        }
      })
      .catch((err) => {
        console.error(err);
        setCurriculums([]);
        setCurriculumLoadError("I could not load the curriculum list. Please refresh and try again.");
      })
      .finally(() => setCurriculumLoading(false));
  }, []);

  useEffect(() => {
    if (!curriculumId) {
      setPhases([]);
      setGrades([]);
      setGradesLoading(false);
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
      .finally(() => {
        setGradesLoading(false);
      });
  }, [curriculumId]);

  useEffect(() => {
    if (!phaseId) {
      setSubjects([]);
      setSubjectsLoading(false);
      return;
    }
    setSubjectsLoading(true);
    apiFetch<SubjectRef[]>(`/curriculum/phases/${phaseId}/subjects`, { cache: "no-store" })
      .then(setSubjects)
      .catch(() => {
        setSubjects([]);
      })
      .finally(() => {
        setSubjectsLoading(false);
      });
  }, [phaseId]);

  useEffect(() => {
    if (!curriculumId || !phaseId || !gradeId || !subjectId) {
      setTopics([]);
      return;
    }
    const params = new URLSearchParams({ curriculumId, phaseId, gradeId, subjectId });
    apiFetch<CurriculumTopic[]>(`/curriculum/topics?${params}`)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [curriculumId, phaseId, gradeId, subjectId]);

  useEffect(() => {
    if (!curriculumId || !phaseId || !gradeId || !subjectId) {
      setBankItems([]);
      return;
    }
    const params = new URLSearchParams({
      forPicker: "true",
      curriculumId,
      phaseId,
      gradeId,
      subjectId,
      status: "APPROVED",
    });
    apiFetch<QuestionBankItem[]>(`/question-bank?${params}`)
      .then(setBankItems)
      .catch(() => setBankItems([]));
  }, [curriculumId, phaseId, gradeId, subjectId]);

  const topicOptions = useMemo(() => {
    const names = new Set<string>();
    for (const topic of topics) names.add(topic.topic);
    for (const item of bankItems) {
      if (item.topic) names.add(item.topic);
    }
    return Array.from(names).slice(0, 12);
  }, [bankItems, topics]);

  const filteredBankItems = useMemo(() => {
    return bankItems.filter((item) => {
      const topicOk =
        selectedTopics.length === 0 || (item.topic ? selectedTopics.includes(item.topic) : false);
      const difficultyOk =
        difficulty === "Standard" ||
        !item.difficulty ||
        item.difficulty.toLowerCase().includes(difficulty.toLowerCase());
      return topicOk && difficultyOk;
    });
  }, [bankItems, difficulty, selectedTopics]);

  function resetAfterDetailsChange() {
    setPreviewQuestions([]);
    setCreatedAssessment(null);
    setError("");
  }

  function toggleTopic(topic: string) {
    setSelectedTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]
    );
  }

  function pickBankQuestions() {
    const picked: QuestionBankItem[] = [];
    let runningMarks = 0;
    for (const item of filteredBankItems) {
      if (runningMarks >= bankMarksNumber) break;
      picked.push(item);
      runningMarks += item.marks;
    }
    return picked;
  }

  async function buildFromBank() {
    const picked = pickBankQuestions();
    if (picked.length === 0) {
      setError("I could not find matching questions. Try another topic or difficulty.");
      return;
    }
    setError("");
    setStep("loading");
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setPreviewQuestions(
      picked.map((item, index) => ({
        id: `bank-${item.id}`,
        sourceItemId: item.id,
        questionNumber: String(index + 1),
        questionText: item.questionText,
        topic: item.topic,
        marks: item.marks,
        difficulty: item.difficulty,
        expectedAnswer: item.expectedAnswer,
      }))
    );
    setStep("preview");
  }

  async function buildWithAssistant() {
    setStep("loading");
    setBusy(true);
    setError("");
    try {
      const fallbackTopic =
        selectedTopics[0] || topicOptions[0] || selectedSubject?.name || "General";
      const request = await apiFetch<GenerationRequest>("/assessment-generation", {
        method: "POST",
        body: JSON.stringify({
          curriculumId,
          phaseId,
          gradeId,
          subjectId,
          assessmentType: friendlyType(title),
          term: term.trim(),
          title: title.trim(),
          totalMarks: marksNumber,
          difficulty: toDifficulty(difficulty),
          topics: [fallbackTopic],
          outputMode: "QUESTIONS_AND_MEMO",
          instructions: null,
        }),
      });
      const questions = request.preview?.questions ?? [];
      setPreviewQuestions(
        questions.map((question, index) => ({
          id: `made-${index + 1}`,
          questionNumber: question.questionNumber || String(index + 1),
          questionText: question.questionText,
          topic: question.topic,
          marks: question.marks,
          difficulty: question.difficulty,
          expectedAnswer: question.expectedAnswer,
        }))
      );
      setStep("preview");
    } catch (err) {
      console.error(err);
      setError("I could not prepare the assessment. Please try again.");
      setStep("method");
    } finally {
      setBusy(false);
    }
  }

  async function buildOwnAssessment() {
    setStep("loading");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setPreviewQuestions(makeOwnQuestions(marksNumber, topicOptions[0] || selectedSubject?.name || "General"));
    setStep("preview");
  }

  function editQuestion(id: string) {
    const question = previewQuestions.find((item) => item.id === id);
    if (!question) return;
    const next = window.prompt("Edit this question:", question.questionText);
    if (next == null || !next.trim()) return;
    setPreviewQuestions((current) =>
      current.map((item) => (item.id === id ? { ...item, questionText: next.trim() } : item))
    );
  }

  function deleteQuestion(id: string) {
    setPreviewQuestions((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, questionNumber: String(index + 1) }))
    );
  }

  function replaceQuestion(id: string) {
    const used = new Set(previewQuestions.map((item) => item.sourceItemId).filter(Boolean));
    const replacement = filteredBankItems.find((item) => !used.has(item.id));
    if (!replacement) {
      setError("There is no extra matching question to use. You can edit this question instead.");
      return;
    }
    setError("");
    setPreviewQuestions((current) =>
      current.map((item) =>
        item.id === id
          ? {
              id: `bank-${replacement.id}`,
              sourceItemId: replacement.id,
              questionNumber: item.questionNumber,
              questionText: replacement.questionText,
              topic: replacement.topic,
              marks: replacement.marks,
              difficulty: replacement.difficulty,
              expectedAnswer: replacement.expectedAnswer,
            }
          : item
      )
    );
  }

  async function approveAssessment() {
    if (previewQuestions.length === 0) {
      setError("Add at least one question before approving.");
      return;
    }
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
          term: term.trim(),
          totalMarks: marksNumber,
          durationMinutes: Number(durationMinutes),
        }),
      });

      for (const [index, question] of previewQuestions.entries()) {
        await apiFetch(`/assessments/${assessment.id}/questions`, {
          method: "POST",
          body: JSON.stringify({
            questionNumber: String(index + 1),
            questionText: question.questionText,
            topic: question.topic,
            marks: question.marks,
            difficulty: question.difficulty,
            expectedAnswer: question.expectedAnswer ?? null,
            orderIndex: index,
          }),
        });
      }

      setCreatedAssessment(assessment);
      setStep("success");
    } catch (err) {
      console.error(err);
      setError("I could not save the assessment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendToDh() {
    if (!createdAssessment) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/assessments/${createdAssessment.id}/submit-to-hod`, { method: "POST" });
    } catch (err) {
      console.error(err);
      setError("I could not send this to DH. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!createdAssessment) return;
    try {
      await apiDownload(
        `/assessments/${createdAssessment.id}/reports/assessment.pdf`,
        `${createdAssessment.title}.pdf`
      );
    } catch (err) {
      console.error(err);
      setError("The PDF is not ready yet.");
    }
  }

  async function saveToQuestionBank() {
    if (!createdAssessment) return;
    setError("Save to Question Bank happens when your DH approves the assessment.");
  }

  return (
    <div className="sc-builder-shell">
      {step === "welcome" ? (
        <section className="sc-builder-welcome" aria-label="Welcome">
          <h1>Let&apos;s create your assessment</h1>
          <p>&ldquo;We&apos;ll guide you step by step.&rdquo;</p>
          <button type="button" className="sc-btn sc-btn-primary" onClick={() => setStep("details")}>
            Start Assessment
          </button>
        </section>
      ) : null}

      {step !== "welcome" && step !== "loading" ? (
        <div className="sc-builder-step-note">
          <span>Assessment Builder</span>
          <strong>
            {step === "details"
              ? "Tell us about your assessment."
              : step === "method"
                ? "Choose how to create it."
                : step === "bank"
                  ? "Choose questions."
                  : step === "preview"
                    ? "Check the paper."
                    : "Your assessment is ready."}
          </strong>
        </div>
      ) : null}

      {error ? <p className="sc-error sc-builder-error">{error}</p> : null}

      {step === "details" ? (
        <section className="sc-builder-card" aria-label="Assessment details">
          <h1>Tell us about your assessment.</h1>
          <div className="sc-builder-form-grid">
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
                  setSubjects([]);
                  resetAfterDetailsChange();
                }}
              >
                <option value="">
                  {curriculumLoading ? "Loading curriculum..." : "Choose curriculum"}
                </option>
                {curriculums.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {curriculumLoadError ? (
                <span className="sc-builder-field-note">{curriculumLoadError}</span>
              ) : null}
            </label>
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
                  setSubjects([]);
                  resetAfterDetailsChange();
                }}
              >
                <option value="">
                  {gradesLoading ? "Loading grades..." : "Choose grade"}
                </option>
                {phases.map((phase) => (
                  <optgroup key={phase.id} label={phase.name}>
                    {grades
                      .filter((grade) => grade.phaseId === phase.id)
                      .map((grade) => (
                        <option key={grade.id} value={grade.id}>
                          {grade.name}
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
                disabled={!gradeId || !phaseId || subjectsLoading}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  resetAfterDetailsChange();
                }}
              >
                <option value="">
                  {subjectsLoading ? "Loading subjects..." : "Choose subject"}
                </option>
                {subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Term
              <input
                className="sc-input"
                value={term}
                placeholder="Term 2"
                onChange={(e) => {
                  setTerm(e.target.value);
                  resetAfterDetailsChange();
                }}
              />
            </label>
            <label>
              Assessment Name
              <input
                className="sc-input"
                value={title}
                placeholder="Grade 6 Natural Sciences Test"
                onChange={(e) => {
                  setTitle(e.target.value);
                  resetAfterDetailsChange();
                }}
              />
            </label>
            <label>
              Total Marks
              <input
                className="sc-input"
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => {
                  setTotalMarks(e.target.value);
                  setBankMarks(e.target.value);
                  resetAfterDetailsChange();
                }}
              />
            </label>
            <label>
              Duration
              <input
                className="sc-input"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => {
                  setDurationMinutes(e.target.value);
                  resetAfterDetailsChange();
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={!detailsReady}
            onClick={() => setStep("method")}
          >
            Next
          </button>
          {!detailsReady ? (
            <p className="sc-builder-next-hint">
              Complete each field above, then click Next.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "method" ? (
        <section className="sc-builder-card" aria-label="Creation choice">
          <h1>How would you like to create your assessment?</h1>
          <div className="sc-builder-choice-grid">
            <button type="button" className="sc-builder-choice is-recommended" onClick={() => {
              setStep("bank");
            }}>
              <span>Build from Question Bank</span>
              <strong>(Recommended)</strong>
            </button>
            <button type="button" className="sc-builder-choice" onClick={() => void buildWithAssistant()}>
              <span>Create with AI</span>
            </button>
            <button type="button" className="sc-builder-choice" onClick={() => void buildOwnAssessment()}>
              <span>Create My Own Assessment</span>
            </button>
          </div>
        </section>
      ) : null}

      {step === "bank" ? (
        <section className="sc-builder-card" aria-label="Question bank choices">
          <h1>Choose what should be in the assessment.</h1>
          <div className="sc-builder-simple-grid">
            <div>
              <label className="sc-builder-label">Topic(s)</label>
              <div className="sc-builder-topic-list">
                {topicOptions.length ? (
                  topicOptions.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className={selectedTopics.includes(topic) ? "is-selected" : ""}
                      onClick={() => toggleTopic(topic)}
                    >
                      {topic}
                    </button>
                  ))
                ) : (
                  <p>No topics found yet. You can still build from all available questions.</p>
                )}
              </div>
            </div>
            <label>
              Difficulty
              <select
                className="sc-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                {DIFFICULTIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Total Marks
              <input
                className="sc-input"
                type="number"
                min={1}
                value={bankMarks}
                onChange={(e) => setBankMarks(e.target.value)}
              />
            </label>
          </div>
          <button type="button" className="sc-btn sc-btn-primary" onClick={() => void buildFromBank()}>
            Build My Assessment
          </button>
        </section>
      ) : null}

      {step === "loading" ? (
        <section className="sc-builder-loading" aria-label="Preparing assessment">
          <div className="sc-builder-loader" />
          <h1>Great! I&apos;m preparing your assessment.</h1>
          <p>This should only take a moment.</p>
        </section>
      ) : null}

      {step === "preview" ? (
        <section className="sc-builder-preview-wrap" aria-label="Assessment preview">
          <div className="sc-builder-paper">
            <header>
              <p>{selectedCurriculum?.name}</p>
              <h1>{title}</h1>
              <p>
                {selectedGrade?.name} {selectedSubject ? `- ${selectedSubject.name}` : ""} - {term}
              </p>
              <div>
                <span>Total: {marksNumber} marks</span>
                <span>Time: {durationMinutes} minutes</span>
              </div>
            </header>
            {previewQuestions.map((question) => (
              <article key={question.id} className="sc-builder-question">
                <div>
                  <strong>Question {question.questionNumber}</strong>
                  <span>{question.marks} marks</span>
                </div>
                <p>{question.questionText}</p>
                <div className="sc-builder-question-actions">
                  <button type="button" onClick={() => replaceQuestion(question.id)}>
                    Replace
                  </button>
                  <button type="button" onClick={() => editQuestion(question.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteQuestion(question.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={busy}
            onClick={() => void approveAssessment()}
          >
            {busy ? "Saving..." : "Approve Assessment"}
          </button>
        </section>
      ) : null}

      {step === "success" ? (
        <section className="sc-builder-success" aria-label="Assessment ready">
          <h1>Your assessment is ready.</h1>
          <div className="sc-builder-success-actions">
            <button type="button" className="sc-btn sc-btn-primary" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className="sc-btn sc-btn-secondary" onClick={() => void downloadPdf()}>
              Download PDF
            </button>
            <button type="button" className="sc-btn sc-btn-secondary" disabled={busy} onClick={() => void sendToDh()}>
              Send to DH
            </button>
            <button type="button" className="sc-btn sc-btn-secondary" onClick={() => void saveToQuestionBank()}>
              Save to Question Bank
            </button>
          </div>
          {createdAssessment ? (
            <button
              type="button"
              className="sc-builder-text-button"
              onClick={() => navigate(`/assessments/${createdAssessment.id}`)}
            >
              Open assessment details
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
