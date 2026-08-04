import { useMemo, useState } from "react";
import type {
  LearnerFeedbackEntry,
  LearnerScriptDetail,
  ScriptQuestionMarkRow,
} from "../../types";
import { resolveAiConfidence } from "../../utils/aiConfidence";
import MarkVarianceBadge from "./MarkVarianceBadge";

type Props = {
  script: LearnerScriptDetail;
  marks: Record<string, Partial<ScriptQuestionMarkRow>>;
  teacherMode: boolean;
  hodMode: boolean;
  saving: boolean;
  completing: boolean;
  saveMessage?: string;
  autosaveStatus?: "idle" | "saving" | "saved" | "offline";
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
  activeQuestionIndex?: number;
  onActiveQuestionIndexChange?: (index: number) => void;
  flaggedForReview?: boolean;
  privateTeacherNotes?: string;
  onToggleFlag?: () => void;
  onPrivateNotesChange?: (value: string) => void;
  canUseTeacherReviewTools?: boolean;
};

export default function ScriptMarkingPanel({
  script,
  marks,
  teacherMode,
  hodMode,
  saving,
  completing,
  saveMessage,
  autosaveStatus = "idle",
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
  activeQuestionIndex = 0,
  onActiveQuestionIndexChange,
  flaggedForReview = false,
  privateTeacherNotes = "",
  onToggleFlag,
  onPrivateNotesChange,
  canUseTeacherReviewTools = false,
}: Props) {
  const [showMore, setShowMore] = useState(false);
  const questions = script.questionMarks;
  const questionIndex = Math.min(Math.max(activeQuestionIndex, 0), Math.max(questions.length - 1, 0));
  const activeQuestion = questions[questionIndex] ?? null;

  const activeConfidence = useMemo(() => {
    if (!activeQuestion) return null;
    const m = marks[activeQuestion.assessmentQuestionId] ?? activeQuestion;
    return resolveAiConfidence({
      confidence: script.confidence,
      teacherComment: m.teacherComment ?? activeQuestion.teacherComment,
      hodComment: m.hodComment ?? activeQuestion.hodComment,
    });
  }, [activeQuestion, marks, script.confidence]);

  const missingMarks = useMemo(() => {
    return questions.filter((q) => {
      const m = marks[q.assessmentQuestionId] ?? q;
      const value = hodMode ? m.hodMark : m.teacherMark;
      return value == null || value === ("" as unknown);
    });
  }, [questions, marks, hodMode]);

  return (
    <aside className="sc-script-marking-panel">
      <div className="sc-script-panel-header-row">
        <h3 className="sc-script-panel-title">Review marks</h3>
        <span className="sc-autosave-status" aria-live="polite">
          {autosaveStatus === "saving"
            ? "Saving…"
            : autosaveStatus === "saved"
              ? "Saved"
              : autosaveStatus === "offline"
                ? "Offline – changes will save when connection returns."
                : saveMessage || ""}
        </span>
      </div>

      <div className="sc-teacher-review-tools">
        <button
          type="button"
          className={`sc-btn sc-btn-ghost sc-flag-btn${flaggedForReview ? " is-flagged" : ""}`}
          onClick={onToggleFlag}
          disabled={!canUseTeacherReviewTools}
          aria-pressed={flaggedForReview}
        >
          ⭐ Flag for Review{flaggedForReview ? " (on)" : ""}
        </button>
        <label className="sc-label" htmlFor="private-teacher-notes">
          📝 Private Teacher Notes
          <span className="sc-mark-pages-hint">Visible to Teacher and Department Head only</span>
        </label>
        <textarea
          id="private-teacher-notes"
          className="sc-input sc-private-notes"
          rows={3}
          value={privateTeacherNotes}
          readOnly={!canUseTeacherReviewTools}
          onChange={(e) => onPrivateNotesChange?.(e.target.value)}
          placeholder="Notes for you and the Department Head…"
        />
      </div>

      <div className="sc-mark-totals sc-mark-totals-compact">
        <div className="sc-mark-total-card">
          <div className="sc-detail-label">Your total</div>
          <div className="sc-mark-total-value">{script.teacherTotal ?? "—"}</div>
          {script.teacherPercentage != null ? (
            <div className="sc-mark-total-pct">{script.teacherPercentage}%</div>
          ) : null}
        </div>
        {hodMode || showMore ? (
          <div className="sc-mark-total-card">
            <div className="sc-detail-label">Department Head</div>
            <div className="sc-mark-total-value">{script.hodTotal ?? "—"}</div>
            {script.hodPercentage != null ? (
              <div className="sc-mark-total-pct">{script.hodPercentage}%</div>
            ) : null}
          </div>
        ) : null}
        <div className="sc-mark-total-card sc-card-gold">
          <div className="sc-detail-label">Final</div>
          <div className="sc-mark-total-value">{script.finalTotal ?? "—"}</div>
          <div className="sc-mark-total-pct">
            {script.finalPercentage ?? script.percentage ?? "—"}
            {script.finalPercentage != null || script.percentage != null ? "%" : ""} / {script.outOf}
          </div>
        </div>
      </div>

      {script.varianceLevel && (hodMode || showMore) ? (
        <div className="sc-variance-row">
          <MarkVarianceBadge
            level={script.varianceLevel}
            variancePercent={script.moderationVariancePercent}
          />
        </div>
      ) : null}

      {activeQuestion ? (
        <div className="sc-mark-focus-card" aria-label="Current question">
          <p className="sc-mark-focus-progress">
            Question {questionIndex + 1} of {questions.length}
          </p>
          <div className="sc-synced-sources" aria-label="Aligned paper sources">
            <div className="sc-synced-source">
              <span className="sc-synced-source-label">Question Paper</span>
              <p className="sc-marking-q-num">Q{activeQuestion.questionNumber}</p>
              {activeQuestion.questionText ? (
                <p className="sc-mark-comment-read">{activeQuestion.questionText}</p>
              ) : (
                <p className="sc-mark-comment-read">Question text unavailable.</p>
              )}
            </div>
            <div className="sc-synced-source">
              <span className="sc-synced-source-label">Memorandum</span>
              {activeQuestion.expectedAnswer ? (
                <p className="sc-mark-comment-read">{activeQuestion.expectedAnswer}</p>
              ) : (
                <p className="sc-mark-comment-read">No memorandum excerpt for this question.</p>
              )}
            </div>
            <div className="sc-synced-source">
              <span className="sc-synced-source-label">Learner Script</span>
              <p className="sc-mark-comment-read">
                Stay on this question while you mark — navigation stays aligned.
              </p>
            </div>
          </div>
          {activeConfidence ? (
            <p
              className={`sc-ai-confidence sc-ai-confidence-${activeConfidence.level ?? "none"}`}
              aria-label="AI confidence"
            >
              {activeConfidence.label}
            </p>
          ) : null}
          {teacherMode && !hodMode ? (
            <>
              <label className="sc-label" htmlFor={`mark-input-${activeQuestion.assessmentQuestionId}`}>
                Mark out of {activeQuestion.maxMarks}
              </label>
              <input
                id={`mark-input-${activeQuestion.assessmentQuestionId}`}
                className="sc-input sc-mark-focus-input"
                type="number"
                min={0}
                max={activeQuestion.maxMarks}
                step={0.5}
                value={marks[activeQuestion.assessmentQuestionId]?.teacherMark ?? activeQuestion.teacherMark ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== "" && Number(raw) > activeQuestion.maxMarks) return;
                  onUpdateMark(activeQuestion.assessmentQuestionId, "teacherMark", raw);
                }}
                aria-describedby={`mark-help-${activeQuestion.assessmentQuestionId}`}
              />
              <p id={`mark-help-${activeQuestion.assessmentQuestionId}`} className="sc-mark-pages-hint">
                Enter 0 up to {activeQuestion.maxMarks}. Leave blank if not marked yet.
              </p>
              <label className="sc-label" htmlFor={`comment-${activeQuestion.assessmentQuestionId}`}>
                Comment (optional)
              </label>
              <input
                id={`comment-${activeQuestion.assessmentQuestionId}`}
                className="sc-input"
                placeholder="Comment"
                value={marks[activeQuestion.assessmentQuestionId]?.teacherComment ?? activeQuestion.teacherComment ?? ""}
                onChange={(e) =>
                  onUpdateMark(activeQuestion.assessmentQuestionId, "teacherComment", e.target.value)
                }
              />
            </>
          ) : null}
          <div className="sc-form-actions sc-mark-focus-nav">
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={questionIndex <= 0}
              onClick={() => onActiveQuestionIndexChange?.(questionIndex - 1)}
            >
              Previous question
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={questionIndex >= questions.length - 1}
              onClick={() => onActiveQuestionIndexChange?.(questionIndex + 1)}
            >
              Next question
            </button>
          </div>
        </div>
      ) : null}

      <div className={`sc-table-wrap sc-mark-capture-table${teacherMode && !hodMode ? " sc-mark-table-advanced" : ""}`}>
        <table className="sc-table sc-table-compact">
          <thead>
            <tr>
              <th>Q</th>
              <th>Max</th>
              <th>{hodMode ? "Department Head" : teacherMode ? "Awarded" : "Final"}</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {script.questionMarks.map((q, index) => {
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
                <tr
                  key={q.id}
                  className={index === questionIndex ? "is-active-question" : undefined}
                  onClick={() => onActiveQuestionIndexChange?.(index)}
                >
                  <td>
                    <span className="sc-marking-q-num">Q{q.questionNumber}</span>
                    {q.questionText ? (
                      <p className="sc-mark-comment-read">{q.questionText}</p>
                    ) : null}
                    {q.expectedAnswer && (hodMode || showMore || teacherMode) ? (
                      <p className="sc-mark-comment-read">Model answer: {q.expectedAnswer}</p>
                    ) : null}
                    {(() => {
                      const conf = resolveAiConfidence({
                        confidence: script.confidence,
                        teacherComment: m.teacherComment ?? q.teacherComment,
                        hodComment: m.hodComment ?? q.hodComment,
                      });
                      return (
                        <p className={`sc-ai-confidence sc-ai-confidence-${conf.level ?? "none"}`}>
                          {conf.label}
                        </p>
                      );
                    })()}
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
                        aria-label={`Mark for question ${q.questionNumber}, maximum ${q.maxMarks}`}
                        value={m.teacherMark ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw !== "" && Number(raw) > q.maxMarks) return;
                          onUpdateMark(q.assessmentQuestionId, "teacherMark", raw);
                        }}
                      />
                    ) : hodMode ? (
                      <input
                        className="sc-input sc-input-sm"
                        type="number"
                        min={0}
                        max={q.maxMarks}
                        step={0.5}
                        aria-label={`Department Head mark for question ${q.questionNumber}`}
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
                        aria-label={`Comment for question ${q.questionNumber}`}
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
        <div className="sc-form-actions sc-mark-primary-actions">
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={saving || completing}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save Mark"}
          </button>
          {teacherMode && script.status !== "MARKED" ? (
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={completing || saving}
              onClick={() => {
                if (missingMarks.length > 0) {
                  const ok = window.confirm(
                    `${missingMarks.length} question(s) still have no mark. Finish this learner anyway?`
                  );
                  if (!ok) return;
                }
                onComplete();
              }}
            >
              {completing ? "Finishing…" : "Finish This Learner"}
            </button>
          ) : null}
          {saveMessage ? <p className="sc-mark-save-confirm" role="status">{saveMessage}</p> : null}
        </div>
      ) : null}

      <button
        type="button"
        className="sc-btn sc-btn-ghost sc-mark-more-toggle"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
      >
        {showMore ? "Hide more actions" : "More actions"}
      </button>

      {showMore ? (
        <>
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
        </>
      ) : null}
    </aside>
  );
}
