import type { AssessmentDetail, AssessmentQuestion } from "../../../types";

type Props = {
  assessment: AssessmentDetail;
  questions: AssessmentQuestion[];
};

export default function AssessmentRubricTab({ assessment, questions }: Props) {
  const rubricId = assessment.rubricTemplateId;

  if (!rubricId) {
    return (
      <div className="sc-placeholder-panel">
        <h3>No rubric linked</h3>
        <p>Link a rubric template to this assessment for structured marking guidance.</p>
        <p className="sc-muted">
          Intelligence will flag missing rubrics until one is attached.
        </p>
      </div>
    );
  }

  return (
    <div className="sc-card sc-card-padded">
      <h3 style={{ marginTop: 0 }}>Rubric Template</h3>
      <p>
        Rubric template <code>{rubricId}</code> is linked to this assessment.
      </p>
      <p className="sc-muted">
        View and manage rubrics from Settings → Rubrics. Rubric criteria are used during
        digital marking and moderation.
      </p>
      {questions.some((q) => q.rubricNotes) ? (
        <div style={{ marginTop: "1rem" }}>
          <h4>Per-question rubric notes</h4>
          <ul>
            {questions
              .filter((q) => q.rubricNotes)
              .map((q) => (
                <li key={q.id}>
                  Q{q.questionNumber}: {q.rubricNotes}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
