import type { RubricMarkRow, RubricMarksResponse } from "../../types";

type Props = {
  data: RubricMarksResponse;
  marks: Record<string, Partial<RubricMarkRow>>;
  teacherMode: boolean;
  hodMode: boolean;
  saving: boolean;
  onUpdateMark: (
    criterionId: string,
    field: "teacherMark" | "hodMark" | "teacherComment" | "hodComment",
    value: string
  ) => void;
  onSave: () => void;
  finalFeedback: string;
  onFinalFeedbackChange: (value: string) => void;
  onSaveFeedback: () => void;
  feedbackSaving: boolean;
};

function formatDots(length: number): string {
  return ".".repeat(Math.min(length, 12));
}

export default function RubricMarkingPanel({
  data,
  marks,
  teacherMode,
  hodMode,
  saving,
  onUpdateMark,
  onSave,
  finalFeedback,
  onFinalFeedbackChange,
  onSaveFeedback,
  feedbackSaving,
}: Props) {
  const totals = data.totals;
  const editable = teacherMode || hodMode;

  return (
    <aside className="sc-script-marking-panel">
      <h3 className="sc-script-panel-title">
        Rubric: {data.rubricTemplate?.name ?? "Marking"}
      </h3>

      <div className="sc-rubric-mark-list">
        {data.marks.map((criterion) => {
          const m = marks[criterion.rubricCriterionId] ?? criterion;
          const awarded = hodMode
            ? m.hodMark
            : teacherMode
              ? m.teacherMark
              : m.finalMark;
          const commentField = hodMode ? "hodComment" : "teacherComment";
          const markField = hodMode ? "hodMark" : "teacherMark";

          return (
            <div key={criterion.rubricCriterionId} className="sc-rubric-mark-row">
              <div className="sc-rubric-mark-label">
                <span>{criterion.name}</span>
                <span className="sc-rubric-dots">{formatDots(criterion.name.length)}</span>
                <span className="sc-rubric-score">
                  {awarded ?? "—"}/{criterion.maxMarks}
                </span>
              </div>
              {editable ? (
                <div className="sc-rubric-mark-inputs">
                  <input
                    type="number"
                    min={0}
                    max={criterion.maxMarks}
                    className="sc-input sc-input-compact"
                    value={awarded ?? ""}
                    onChange={(e) =>
                      onUpdateMark(criterion.rubricCriterionId, markField, e.target.value)
                    }
                    disabled={!editable}
                  />
                  <input
                    type="text"
                    className="sc-input"
                    placeholder="Comment"
                    value={(m[commentField] as string | null) ?? ""}
                    onChange={(e) =>
                      onUpdateMark(criterion.rubricCriterionId, commentField, e.target.value)
                    }
                    disabled={!editable}
                  />
                </div>
              ) : m[commentField] ? (
                <div className="sc-rubric-comment">{m[commentField]}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {totals ? (
        <div className="sc-rubric-totals sc-card-gold">
          <div className="sc-rubric-total-line">
            <span>Total</span>
            <span className="sc-rubric-dots">..........</span>
            <strong>
              {totals.finalTotal}/{totals.outOf}
            </strong>
          </div>
          <div className="sc-rubric-total-line">
            <span>Percentage</span>
            <span className="sc-rubric-dots">....</span>
            <strong>{totals.percentage != null ? `${totals.percentage}%` : "—"}</strong>
          </div>
        </div>
      ) : null}

      {editable ? (
        <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save rubric marks"}
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: "1.5rem" }}>
        <label className="sc-label">Final feedback</label>
        <textarea
          className="sc-input"
          rows={3}
          value={finalFeedback}
          onChange={(e) => onFinalFeedbackChange(e.target.value)}
          disabled={!editable}
          placeholder="Overall feedback for the learner"
        />
        {editable ? (
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            style={{ marginTop: "0.5rem" }}
            onClick={onSaveFeedback}
            disabled={feedbackSaving}
          >
            {feedbackSaving ? "Saving…" : "Save feedback"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
