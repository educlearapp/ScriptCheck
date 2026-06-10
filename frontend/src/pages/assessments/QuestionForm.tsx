import type { AssessmentQuestion } from "../../types";

export type QuestionFormValues = {
  questionNumber: string;
  section: string;
  questionText: string;
  topic: string;
  marks: string;
  cognitiveLevel: string;
  difficulty: string;
  expectedAnswer: string;
  memoNotes: string;
  rubricNotes: string;
};

export const EMPTY_QUESTION_FORM: QuestionFormValues = {
  questionNumber: "",
  section: "",
  questionText: "",
  topic: "",
  marks: "5",
  cognitiveLevel: "",
  difficulty: "",
  expectedAnswer: "",
  memoNotes: "",
  rubricNotes: "",
};

export function questionToFormValues(question: AssessmentQuestion): QuestionFormValues {
  return {
    questionNumber: question.questionNumber,
    section: question.section || "",
    questionText: question.questionText,
    topic: question.topic || "",
    marks: String(question.marks),
    cognitiveLevel: question.cognitiveLevel || "",
    difficulty: question.difficulty || "",
    expectedAnswer: question.expectedAnswer || "",
    memoNotes: question.memoNotes || "",
    rubricNotes: question.rubricNotes || "",
  };
}

type Props = {
  values: QuestionFormValues;
  onChange: (values: QuestionFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

const COGNITIVE_LEVELS = [
  "",
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
];

const DIFFICULTY_LEVELS = ["", "Easy", "Medium", "Hard", "Extension"];

export default function QuestionForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  loading,
}: Props) {
  const set = (field: keyof QuestionFormValues, value: string) => {
    onChange({ ...values, [field]: value });
  };

  return (
    <form className="sc-form-grid" onSubmit={onSubmit}>
      <div className="sc-form-grid sc-form-grid-2">
        <div>
          <label className="sc-label" htmlFor="q-number">
            Question number
          </label>
          <input
            id="q-number"
            className="sc-input"
            value={values.questionNumber}
            onChange={(e) => set("questionNumber", e.target.value)}
            placeholder="1"
          />
        </div>
        <div>
          <label className="sc-label" htmlFor="q-section">
            Section
          </label>
          <input
            id="q-section"
            className="sc-input"
            value={values.section}
            onChange={(e) => set("section", e.target.value)}
            placeholder="Section A"
          />
        </div>
      </div>

      <div>
        <label className="sc-label" htmlFor="q-text">
          Question text
        </label>
        <textarea
          id="q-text"
          className="sc-input"
          rows={3}
          value={values.questionText}
          onChange={(e) => set("questionText", e.target.value)}
          placeholder="Enter the question…"
          required
        />
      </div>

      <div className="sc-form-grid sc-form-grid-2">
        <div>
          <label className="sc-label" htmlFor="q-topic">
            Topic
          </label>
          <input
            id="q-topic"
            className="sc-input"
            value={values.topic}
            onChange={(e) => set("topic", e.target.value)}
            placeholder="Algebra — equations"
          />
        </div>
        <div>
          <label className="sc-label" htmlFor="q-marks">
            Marks
          </label>
          <input
            id="q-marks"
            className="sc-input"
            type="number"
            min={1}
            value={values.marks}
            onChange={(e) => set("marks", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="sc-form-grid sc-form-grid-2">
        <div>
          <label className="sc-label" htmlFor="q-cognitive">
            Cognitive level
          </label>
          <select
            id="q-cognitive"
            className="sc-select"
            value={values.cognitiveLevel}
            onChange={(e) => set("cognitiveLevel", e.target.value)}
          >
            {COGNITIVE_LEVELS.map((level) => (
              <option key={level || "none"} value={level}>
                {level || "— Select —"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sc-label" htmlFor="q-difficulty">
            Difficulty
          </label>
          <select
            id="q-difficulty"
            className="sc-select"
            value={values.difficulty}
            onChange={(e) => set("difficulty", e.target.value)}
          >
            {DIFFICULTY_LEVELS.map((level) => (
              <option key={level || "none"} value={level}>
                {level || "— Select —"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="sc-label" htmlFor="q-expected">
          Expected answer
        </label>
        <textarea
          id="q-expected"
          className="sc-input"
          rows={2}
          value={values.expectedAnswer}
          onChange={(e) => set("expectedAnswer", e.target.value)}
          placeholder="Model answer for memo / future AI marking"
        />
      </div>

      <div className="sc-form-grid sc-form-grid-2">
        <div>
          <label className="sc-label" htmlFor="q-memo">
            Memo notes
          </label>
          <textarea
            id="q-memo"
            className="sc-input"
            rows={2}
            value={values.memoNotes}
            onChange={(e) => set("memoNotes", e.target.value)}
            placeholder="Marking guidance"
          />
        </div>
        <div>
          <label className="sc-label" htmlFor="q-rubric">
            Rubric notes
          </label>
          <textarea
            id="q-rubric"
            className="sc-input"
            rows={2}
            value={values.rubricNotes}
            onChange={(e) => set("rubricNotes", e.target.value)}
            placeholder="Rubric criteria"
          />
        </div>
      </div>

      <div className="sc-form-actions">
        <button type="submit" className="sc-btn sc-btn-primary" disabled={loading}>
          {loading ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="sc-btn sc-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
