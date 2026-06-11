import { Link } from "react-router-dom";
import { hasPermission } from "../../../auth/permissions";
import type { AuthUser } from "../../../types";
import QuestionForm from "../../../pages/assessments/QuestionForm";
import QuestionBankPicker from "../../../pages/assessments/QuestionBankPicker";
import type { useAssessmentQuestions } from "../../../hooks/useAssessmentQuestions";

type QuestionsState = ReturnType<typeof useAssessmentQuestions>;

type Props = {
  user: AuthUser | null;
  q: QuestionsState;
  onReload: () => Promise<void>;
};

export default function AssessmentQuestionsTab({ user, q, onReload }: Props) {
  return (
    <>
      <div className="sc-detail-questions-header">
        <div>
          <h2>Assessment Paper</h2>
          <p className="sc-page-subtitle">
            {q.readOnly
              ? "Review question breakdown for moderation and analytics."
              : "Build your assessment paper question by question."}
          </p>
        </div>
        {!q.readOnly && q.formMode === "none" ? (
          <div className="sc-detail-action-bar">
            <button type="button" className="sc-btn sc-btn-primary" onClick={q.openAddForm}>
              + Add Question
            </button>
            {q.canUseBank ? (
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => q.setPickerOpen(true)}>
                Question Bank
              </button>
            ) : null}
            {hasPermission(user, "assessments.create") ? (
              <Link to="/assessments/generate" className="sc-btn sc-btn-ghost">
                Generate With AI
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {q.assessment && q.pickerOpen ? (
        <QuestionBankPicker
          assessment={q.assessment}
          open={q.pickerOpen}
          onClose={() => q.setPickerOpen(false)}
          onAdded={onReload}
        />
      ) : null}

      {q.formMode !== "none" ? (
        <div className="sc-card sc-card-gold sc-form-grid" style={{ marginBottom: "1rem", padding: "1.5rem" }}>
          <h3 style={{ margin: 0, color: "var(--sc-gold-light)" }}>
            {q.formMode === "add" ? "Add question" : `Edit question ${q.editingQuestion?.questionNumber}`}
          </h3>
          <QuestionForm
            values={q.formValues}
            onChange={q.setFormValues}
            onSubmit={q.handleSaveQuestion}
            onCancel={q.closeForm}
            submitLabel={q.formMode === "add" ? "Add question" : "Save changes"}
            loading={q.formLoading}
          />
        </div>
      ) : null}

      <div className="sc-card" style={{ padding: "0.5rem 0" }}>
        {q.questions.length === 0 ? (
          <div className="sc-placeholder-panel">
            <h3>No questions yet</h3>
            <p>{q.readOnly ? "This assessment has no questions." : "Add your first question."}</p>
          </div>
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Section</th>
                  <th>Question</th>
                  <th>Topic</th>
                  <th>Marks</th>
                  <th>Cognitive</th>
                  <th>Difficulty</th>
                  {q.canSaveToBank ? <th>Bank</th> : null}
                  {!q.readOnly ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {q.questions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.questionNumber}</td>
                    <td>{item.section || "—"}</td>
                    <td className="sc-question-text-cell">{item.questionText}</td>
                    <td>{item.topic || "—"}</td>
                    <td>{item.marks}</td>
                    <td>{item.cognitiveLevel || "—"}</td>
                    <td>{item.difficulty || "—"}</td>
                    {q.canSaveToBank ? (
                      <td>
                        {q.savedToBank[item.id] ? (
                          <span className="sc-badge sc-badge-gold">Saved</span>
                        ) : (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={q.bankSaving === item.id}
                            onClick={() => void q.handleSaveQuestionToBank(item.id)}
                          >
                            Save
                          </button>
                        )}
                      </td>
                    ) : null}
                    {!q.readOnly ? (
                      <td>
                        <div className="sc-form-actions" style={{ marginTop: 0 }}>
                          <button type="button" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => q.openEditForm(item)}>
                            Edit
                          </button>
                          <button type="button" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem" }} onClick={() => void q.handleDeleteQuestion(item)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
