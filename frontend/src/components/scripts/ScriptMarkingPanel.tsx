import type {
  LearnerFeedbackEntry,
  LearnerScriptDetail,
  ScriptQuestionMarkRow,
} from "../../types";
import MarkVarianceBadge from "./MarkVarianceBadge";

type Props = {
  script: LearnerScriptDetail;
  marks: Record<string, Partial<ScriptQuestionMarkRow>>;
  teacherMode: boolean;
  hodMode: boolean;
  saving: boolean;
  completing: boolean;
  onUpdateMark: (
    questionId: string,
    field: keyof ScriptQuestionMarkRow,
    value: string
  ) => void;
  onSave: () => void;
  onComplete: () => void;
  canGenerateReports: boolean;
  onDownloadPdf: () => void;
  onPrintPdf: () => void;
  canViewFeedback: boolean;
  canCreateFeedback: boolean;
  hodFeedbackMode: boolean;
  feedback: LearnerFeedbackEntry[];
  feedbackForm: {
    teacherFeedback: string;
    improvementNotes: string;
    hodFeedback: string;
    interventionNotes: string;
  };
  feedbackSaving: boolean;
  feedbackError: string;
  onFeedbackFormChange: (field: string, value: string) => void;
  onSaveFeedback: () => void;
};

export default function ScriptMarkingPanel({
  script,
  marks,
  teacherMode,
  hodMode,
  saving,
  completing,
  onUpdateMark,
  onSave,
  onComplete,
  canGenerateReports,
  onDownloadPdf,
  onPrintPdf,
  canViewFeedback,
  canCreateFeedback,
  hodFeedbackMode,
  feedback,
  feedbackForm,
  feedbackSaving,
  feedbackError,
  onFeedbackFormChange,
  onSaveFeedback,
}: Props) {
  return (
    <aside className="sc-script-marking-panel">
      <h3 className="sc-script-panel-title">Question Marks</h3>

      <div className="sc-mark-totals sc-mark-totals-compact">
        <div className="sc-mark-total-card">
          <div className="sc-detail-label">Teacher</div>
          <div className="sc-mark-total-value">{script.teacherTotal ?? "—"}</div>
          {script.teacherPercentage != null ? (
            <div className="sc-mark-total-pct">{script.teacherPercentage}%</div>
          ) : null}
        </div>
        <div className="sc-mark-total-card">
          <div className="sc-detail-label">DH</div>
          <div className="sc-mark-total-value">{script.hodTotal ?? "—"}</div>
          {script.hodPercentage != null ? (
            <div className="sc-mark-total-pct">{script.hodPercentage}%</div>
          ) : null}
        </div>
        <div className="sc-mark-total-card">
          <div className="sc-detail-label">Difference</div>
          <div className="sc-mark-total-value">{script.markDifference ?? "—"}</div>
        </div>
        <div className="sc-mark-total-card sc-card-gold">
          <div className="sc-detail-label">Final</div>
          <div className="sc-mark-total-value">{script.finalTotal ?? 0}</div>
          <div className="sc-mark-total-pct">
            {script.finalPercentage ?? script.percentage}% / {script.outOf}
          </div>
        </div>
      </div>

      {script.varianceLevel ? (
        <div className="sc-variance-row">
          <MarkVarianceBadge
            level={script.varianceLevel}
            variancePercent={script.moderationVariancePercent}
          />
        </div>
      ) : null}

      <div className="sc-table-wrap sc-mark-capture-table">
        <table className="sc-table sc-table-compact">
          <thead>
            <tr>
              <th>Q</th>
              <th>Max</th>
              <th>{hodMode ? "DH" : teacherMode ? "Awarded" : "Final"}</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {script.questionMarks.map((q) => {
              const m = marks[q.assessmentQuestionId] ?? q;
              const awardedValue = hodMode
                ? m.hodMark
                : teacherMode
                  ? m.teacherMark
                  : q.finalMark;
              const commentValue = hodMode
                ? m.hodComment
                : teacherMode
                  ? m.teacherComment
                  : q.teacherComment ?? q.hodComment;

              return (
                <tr key={q.id}>
                  <td>
                    <span className="sc-marking-q-num">Q{q.questionNumber}</span>
                    {q.questionText ? (
                      <p className="sc-mark-comment-read">{q.questionText}</p>
                    ) : null}
                    {q.expectedAnswer ? (
                      <p className="sc-mark-comment-read">Memo: {q.expectedAnswer}</p>
                    ) : null}
                  </td>
                  <td>{q.maxMarks}</td>
                  <td>
                    {teacherMode ? (
                      <input
                        className="sc-input sc-input-sm"
                        type="number"
                        min={0}
                        max={q.maxMarks}
                        step={0.5}
                        value={m.teacherMark ?? ""}
                        onChange={(e) =>
                          onUpdateMark(q.assessmentQuestionId, "teacherMark", e.target.value)
                        }
                      />
                    ) : hodMode ? (
                      <input
                        className="sc-input sc-input-sm"
                        type="number"
                        min={0}
                        max={q.maxMarks}
                        step={0.5}
                        value={m.hodMark ?? ""}
                        onChange={(e) =>
                          onUpdateMark(q.assessmentQuestionId, "hodMark", e.target.value)
                        }
                      />
                    ) : (
                      <span>{awardedValue ?? "—"}</span>
                    )}
                  </td>
                  <td>
                    {teacherMode ? (
                      <input
                        className="sc-input sc-input-sm"
                        placeholder="Comment"
                        value={m.teacherComment ?? ""}
                        onChange={(e) =>
                          onUpdateMark(q.assessmentQuestionId, "teacherComment", e.target.value)
                        }
                      />
                    ) : hodMode ? (
                      <input
                        className="sc-input sc-input-sm"
                        placeholder="Comment"
                        value={m.hodComment ?? ""}
                        onChange={(e) =>
                          onUpdateMark(q.assessmentQuestionId, "hodComment", e.target.value)
                        }
                      />
                    ) : (
                      <span className="sc-mark-comment-read">{commentValue ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(teacherMode || hodMode) ? (
        <div className="sc-form-actions">
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save marks"}
          </button>
          {teacherMode && script.status !== "MARKED" ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={completing}
              onClick={onComplete}
            >
              {completing ? "Completing…" : "Mark complete"}
            </button>
          ) : null}
        </div>
      ) : null}

      {canGenerateReports ? (
        <div className="sc-marking-section">
          <h4 className="sc-marking-section-title">Learner Report</h4>
          <div className="sc-form-actions">
            <button type="button" className="sc-btn sc-btn-ghost sc-btn-sm" onClick={onDownloadPdf}>
              Download PDF
            </button>
            <button type="button" className="sc-btn sc-btn-ghost sc-btn-sm" onClick={onPrintPdf}>
              Print
            </button>
          </div>
        </div>
      ) : null}

      {canViewFeedback ? (
        <div className="sc-marking-section">
          <h4 className="sc-marking-section-title">Feedback</h4>
          {canCreateFeedback ? (
            <div className="sc-marking-feedback-form">
              {hodFeedbackMode ? (
                <>
                  <textarea
                    className="sc-input"
                    rows={2}
                    placeholder="Moderation feedback"
                    value={feedbackForm.hodFeedback}
                    onChange={(e) => onFeedbackFormChange("hodFeedback", e.target.value)}
                  />
                  <textarea
                    className="sc-input"
                    rows={2}
                    placeholder="Intervention notes"
                    value={feedbackForm.interventionNotes}
                    onChange={(e) =>
                      onFeedbackFormChange("interventionNotes", e.target.value)
                    }
                  />
                </>
              ) : (
                <>
                  <textarea
                    className="sc-input"
                    rows={2}
                    placeholder="Teacher feedback"
                    value={feedbackForm.teacherFeedback}
                    onChange={(e) =>
                      onFeedbackFormChange("teacherFeedback", e.target.value)
                    }
                  />
                  <textarea
                    className="sc-input"
                    rows={2}
                    placeholder="Improvement notes"
                    value={feedbackForm.improvementNotes}
                    onChange={(e) =>
                      onFeedbackFormChange("improvementNotes", e.target.value)
                    }
                  />
                </>
              )}
              {feedbackError ? <p className="sc-error">{feedbackError}</p> : null}
              <button
                type="button"
                className="sc-btn sc-btn-primary sc-btn-sm"
                disabled={feedbackSaving}
                onClick={onSaveFeedback}
              >
                {feedbackSaving ? "Saving…" : "Add feedback"}
              </button>
            </div>
          ) : null}
          {feedback.length > 0 ? (
            <ul className="sc-feedback-history">
              {feedback.slice(0, 3).map((entry) => (
                <li key={entry.id} className="sc-feedback-entry">
                  <div className="sc-feedback-meta">
                    {entry.createdBy.fullName} ·{" "}
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </div>
                  {entry.teacherFeedback ? <p>{entry.teacherFeedback}</p> : null}
                  {entry.hodFeedback ? <p>{entry.hodFeedback}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sc-script-empty">No feedback yet.</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
