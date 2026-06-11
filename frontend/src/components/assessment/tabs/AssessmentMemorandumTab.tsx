import type { AssessmentQuestion } from "../../../types";

type Props = {
  questions: AssessmentQuestion[];
};

export default function AssessmentMemorandumTab({ questions }: Props) {
  if (questions.length === 0) {
    return (
      <div className="sc-placeholder-panel">
        <h3>No memorandum content</h3>
        <p>Add questions with expected answers and memo notes.</p>
      </div>
    );
  }

  return (
    <div className="sc-memo-preview">
      {questions.map((q) => (
        <div key={q.id} className="sc-memo-item sc-card sc-card-padded">
          <div className="sc-memo-item-header">
            <strong>Q{q.questionNumber}</strong>
            <span>{q.marks} marks</span>
            {q.topic ? <span className="sc-badge sc-badge-muted">{q.topic}</span> : null}
          </div>
          <p>{q.questionText}</p>
          {q.expectedAnswer ? (
            <p className="sc-memo-answer">
              <span>Expected answer:</span> {q.expectedAnswer}
            </p>
          ) : (
            <p className="sc-memo-missing">⚠ No expected answer provided</p>
          )}
          {q.memoNotes ? (
            <p className="sc-memo-notes">
              <span>Memo notes:</span> {q.memoNotes}
            </p>
          ) : (
            <p className="sc-memo-missing">⚠ No memo notes provided</p>
          )}
          {q.rubricNotes ? (
            <p className="sc-memo-notes">
              <span>Rubric notes:</span> {q.rubricNotes}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
