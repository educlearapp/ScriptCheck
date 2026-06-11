import { useMemo, useState, type ReactNode } from "react";
import { useTrialGate } from "../../trial/TrialGateContext";
import TrialWatermark from "../../trial/TrialWatermark";
import type {
  AiGeneratedDraft,
  AiGeneratedQuestion,
  AiQualityChecks,
  AiReviewReport,
  CognitiveOrder,
} from "../../types";
import "./ReviewWorkspace.css";

const REVIEW_TABS = [
  { id: "paper", label: "Assessment Paper" },
  { id: "memo", label: "Memorandum" },
  { id: "rubric", label: "Rubric" },
  { id: "cognitive", label: "Cognitive Analysis" },
  { id: "framework", label: "Framework Compliance" },
  { id: "export", label: "Export" },
] as const;

type ReviewTabId = (typeof REVIEW_TABS)[number]["id"];

type Props = {
  draft: AiGeneratedDraft;
  title: string;
  grade?: string | null;
  subject?: string | null;
  term?: string | null;
  qualityChecks: AiQualityChecks | null;
  reviewReport: AiReviewReport | null;
  onExport: (type: "question-paper" | "memorandum" | "rubric" | "complete-pack") => void;
  onSaveEdits?: () => void;
  onContinueToApprove?: () => void;
  saving?: boolean;
  showEditPanel?: boolean;
  editPanel?: ReactNode;
};

const ORDER_LABELS: Record<CognitiveOrder, string> = {
  LOW: "Low Order",
  MIDDLE: "Middle Order",
  HIGH: "High Order",
};

function sortQuestions(questions: AiGeneratedQuestion[]): AiGeneratedQuestion[] {
  return [...questions].sort((a, b) => {
    const aParts = a.questionNumber.split(".").map((p) => parseInt(p, 10));
    const bParts = b.questionNumber.split(".").map((p) => parseInt(p, 10));
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

function groupBySection(questions: AiGeneratedQuestion[]) {
  const sections = new Map<string, AiGeneratedQuestion[]>();
  for (const q of questions) {
    const section = q.section ?? "Questions";
    const list = sections.get(section) ?? [];
    list.push(q);
    sections.set(section, list);
  }
  return sections;
}

function parentQuestionNumber(num: string): string {
  return num.split(".")[0];
}

function QuestionPaperPreview({
  draft,
  title,
  grade,
  subject,
  term,
}: {
  draft: AiGeneratedDraft;
  title: string;
  grade?: string | null;
  subject?: string | null;
  term?: string | null;
}) {
  const sorted = sortQuestions(draft.questions);
  const sections = groupBySection(sorted);
  const subtitle = [grade, subject, term].filter(Boolean).join(" · ");

  return (
    <div className="rw-printable" id="rw-assessment-paper">
      <div className="rw-paper-header">
        <div className="rw-paper-brand">ScriptCheck</div>
        <h3 className="rw-paper-title">{title}</h3>
        {subtitle && <p className="rw-paper-subtitle">{subtitle}</p>}
      </div>

      {draft.instructions && (
        <div className="rw-paper-section">
          <h4>Instructions</h4>
          <p>{draft.instructions}</p>
        </div>
      )}

      {[...sections.entries()].map(([sectionName, questions]) => (
        <div key={sectionName} className="rw-paper-section">
          <h4>{sectionName}</h4>
          {questions.map((q) => (
            <div key={q.questionNumber} className="rw-question-block">
              <div className="rw-question-heading">
                <strong>Question {q.questionNumber}</strong>
                <span className="rw-marks-badge">({q.marks} mark{q.marks !== 1 ? "s" : ""})</span>
              </div>
              <p className="rw-question-text">{q.questionText}</p>
              {q.options?.length ? (
                <ul className="rw-options-list">
                  {q.options.map((opt, i) => (
                    <li key={i}>{opt}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ))}

      <div className="rw-paper-footer">
        <strong>Total: {draft.totalMarks} marks</strong>
      </div>
    </div>
  );
}

function MemorandumPreview({ draft }: { draft: AiGeneratedDraft }) {
  const sorted = sortQuestions(draft.questions);
  const parents = new Map<string, AiGeneratedQuestion[]>();

  for (const q of sorted) {
    const parent = parentQuestionNumber(q.questionNumber);
    const list = parents.get(parent) ?? [];
    list.push(q);
    parents.set(parent, list);
  }

  return (
    <div className="rw-printable" id="rw-memorandum">
      <div className="rw-paper-header">
        <div className="rw-paper-brand">ScriptCheck</div>
        <h3 className="rw-paper-title">Memorandum — Marking Guide</h3>
      </div>

      {[...parents.entries()].map(([parent, questions]) => (
        <div key={parent} className="rw-memo-group">
          {questions.length > 1 || questions[0].questionNumber.includes(".") ? (
            <h4>Question {parent}</h4>
          ) : null}
          {questions.map((q) => (
            <div key={q.questionNumber} className="rw-memo-item">
              <div className="rw-question-heading">
                <strong>
                  {questions.length > 1 || q.questionNumber.includes(".")
                    ? `Q${q.questionNumber}`
                    : `Question ${q.questionNumber}`}
                </strong>
                <span className="rw-marks-badge">({q.marks} marks)</span>
                <span className="rw-type-badge">{q.questionType.replaceAll("_", " ")}</span>
              </div>
              <div className="rw-memo-answer">
                <span className="rw-memo-label">Expected answer:</span>
                <p>{q.memoAnswer}</p>
              </div>
              {q.memoNotes && (
                <div className="rw-memo-notes">
                  <span className="rw-memo-label">Marking notes:</span>
                  <p>{q.memoNotes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RubricPreview({ draft }: { draft: AiGeneratedDraft }) {
  const rubricQuestion =
    draft.questions.find((q) => q.questionNumber === "7") ??
    draft.questions.find((q) => q.questionType === "PARAGRAPH" && q.rubric?.criteria?.length);

  if (!rubricQuestion?.rubric?.criteria?.length) {
    return (
      <div className="rw-empty-state">
        <p>No rubric generated for Question 7.</p>
      </div>
    );
  }

  const capsLevels = [
    { level: 4, label: "Outstanding", marks: rubricQuestion.marks },
    { level: 3, label: "Meritorious", marks: Math.ceil(rubricQuestion.marks * 0.75) },
    { level: 2, label: "Moderate", marks: Math.ceil(rubricQuestion.marks * 0.5) },
    { level: 1, label: "Elementary", marks: Math.ceil(rubricQuestion.marks * 0.25) },
  ];

  return (
    <div className="rw-printable" id="rw-rubric">
      <div className="rw-paper-header">
        <div className="rw-paper-brand">ScriptCheck</div>
        <h3 className="rw-paper-title">Rubric — Question {rubricQuestion.questionNumber}</h3>
        <p className="rw-paper-subtitle">CAPS-aligned performance levels</p>
      </div>

      <div className="rw-rubric-question">
        <p>{rubricQuestion.questionText}</p>
        <span className="rw-marks-badge">Total: {rubricQuestion.marks} marks</span>
      </div>

      <table className="rw-rubric-table">
        <thead>
          <tr>
            <th>Level</th>
            <th>Descriptor</th>
            <th>Marks</th>
          </tr>
        </thead>
        <tbody>
          {capsLevels.map((caps) => (
            <tr key={caps.level}>
              <td>
                Level {caps.level} — {caps.label}
              </td>
              <td>
                {caps.level >= 3
                  ? "Fully addresses the question with accurate content, examples, and clear structure."
                  : caps.level === 2
                    ? "Partially addresses the question with some accurate content."
                    : "Limited or inaccurate response."}
              </td>
              <td>{caps.marks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rw-rubric-criteria">
        <h4>Marking criteria</h4>
        {rubricQuestion.rubric.criteria.map((c, i) => (
          <div key={i} className="rw-rubric-criterion">
            <strong>
              {c.name} ({c.maxMarks} marks)
            </strong>
            <p>{c.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReviewWorkspace({
  draft,
  title,
  grade,
  subject,
  term,
  qualityChecks,
  reviewReport,
  onExport,
  onSaveEdits,
  onContinueToApprove,
  saving,
  showEditPanel,
  editPanel,
}: Props) {
  const { isTrial, gateProductionAction } = useTrialGate();
  const [activeTab, setActiveTab] = useState<ReviewTabId>("paper");

  const wrapPreview = (preview: ReactNode) =>
    isTrial ? <TrialWatermark>{preview}</TrialWatermark> : preview;

  const handlePrint = () => {
    gateProductionAction(() => window.print());
  };

  const handleExport = (
    type: "question-paper" | "memorandum" | "rubric" | "complete-pack"
  ) => {
    gateProductionAction(() => onExport(type));
  };

  const canApprove = useMemo(() => {
    if (!reviewReport) return false;
    const hasPaper = draft.questions.length > 0;
    const hasMemo = draft.questions.every((q) => q.memoAnswer?.trim());
    const hasRubric = draft.questions.some((q) => q.rubric?.criteria?.length);
    return (
      hasPaper &&
      hasMemo &&
      hasRubric &&
      reviewReport.cognitiveAnalysis.passed &&
      reviewReport.frameworkCompliance.passed &&
      reviewReport.reviewComplete
    );
  }, [draft, reviewReport]);

  const cognitive = reviewReport?.cognitiveAnalysis;
  const framework = reviewReport?.frameworkCompliance;

  return (
    <div className="rw-workspace">
      <div className="rw-workspace-header">
        <div>
          <h2>Review Workspace</h2>
          <p className="sc-page-subtitle">
            Review the complete assessment, memorandum, rubric, and compliance reports before approving.
          </p>
        </div>
        {reviewReport && (
          <div
            className={`rw-status-badge${reviewReport.reviewComplete ? " is-pass" : " is-fail"}`}
          >
            {reviewReport.reviewComplete ? "Ready for Approval" : "Review Incomplete"}
          </div>
        )}
      </div>

      {qualityChecks && !qualityChecks.passed && (
        <div className="ai-quality-issues" style={{ marginBottom: "1rem" }}>
          <strong>Quality validation issues</strong>
          {qualityChecks.issues
            .filter((i) => i.severity === "error")
            .map((issue, i) => (
              <div key={i} className="ai-quality-issue is-error">
                {issue.message}
              </div>
            ))}
        </div>
      )}

      <div className="rw-tabs">
        {REVIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rw-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rw-tab-panel">
        {activeTab === "paper" && (
          <div className="rw-tab-content">
            <div className="rw-tab-toolbar">
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                onClick={handlePrint}
              >
                Print Preview
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("question-paper")}
              >
                Export Assessment PDF
              </button>
            </div>
            {wrapPreview(
              <QuestionPaperPreview
                draft={draft}
                title={title}
                grade={grade}
                subject={subject}
                term={term}
              />
            )}
          </div>
        )}

        {activeTab === "memo" && (
          <div className="rw-tab-content">
            <div className="rw-tab-toolbar">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("memorandum")}
              >
                Export Memorandum PDF
              </button>
            </div>
            {wrapPreview(<MemorandumPreview draft={draft} />)}
          </div>
        )}

        {activeTab === "rubric" && (
          <div className="rw-tab-content">
            <div className="rw-tab-toolbar">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("rubric")}
              >
                Export Rubric PDF
              </button>
            </div>
            {wrapPreview(<RubricPreview draft={draft} />)}
          </div>
        )}

        {activeTab === "cognitive" && cognitive && (
          <div className="rw-tab-content">
            <div className="rw-cognitive-summary">
              <div className="rw-cognitive-total">
                <span>Low Order</span>
                <strong>{cognitive.totals.lowOrder} marks</strong>
                <em>{cognitive.percentages.lowOrder}%</em>
              </div>
              <div className="rw-cognitive-total">
                <span>Middle Order</span>
                <strong>{cognitive.totals.middleOrder} marks</strong>
                <em>{cognitive.percentages.middleOrder}%</em>
              </div>
              <div className="rw-cognitive-total">
                <span>High Order</span>
                <strong>{cognitive.totals.highOrder} marks</strong>
                <em>{cognitive.percentages.highOrder}%</em>
              </div>
            </div>

            <div className={`rw-validation-result${cognitive.passed ? " is-pass" : " is-fail"}`}>
              <strong>
                40% Low · 40% Middle · 20% High — {cognitive.passed ? "PASS" : "FAIL"}
              </strong>
              {!cognitive.passed && (
                <p>
                  Target: {cognitive.targets.lowOrder} / {cognitive.targets.middleOrder} /{" "}
                  {cognitive.targets.highOrder} marks
                </p>
              )}
            </div>

            <table className="rw-data-table">
              <thead>
                <tr>
                  <th>Question Number</th>
                  <th>Question Type</th>
                  <th>Marks</th>
                  <th>Cognitive Level</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {cognitive.rows.map((row) => (
                  <tr key={row.questionNumber}>
                    <td>{row.questionNumber}</td>
                    <td>{row.questionType}</td>
                    <td>{row.marks}</td>
                    <td>{row.cognitiveLevel}</td>
                    <td>{ORDER_LABELS[row.cognitiveOrder]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "framework" && framework && (
          <div className="rw-tab-content">
            <ul className="rw-compliance-list">
              {framework.checks.map((check) => (
                <li key={check.id} className={check.passed ? "is-pass" : "is-fail"}>
                  <span className="rw-check-icon">{check.passed ? "✓" : "✗"}</span>
                  <span>{check.label}</span>
                  {check.detail && <em>{check.detail}</em>}
                </li>
              ))}
            </ul>
            <div
              className={`rw-framework-status${framework.passed ? " is-pass" : " is-fail"}`}
            >
              Overall Status: <strong>{framework.overallStatus}</strong>
            </div>
          </div>
        )}

        {activeTab === "export" && (
          <div className="rw-tab-content">
            <p className="sc-page-subtitle">
              Download individual documents or the complete assessment pack for printing and distribution.
            </p>
            <div className="rw-export-grid">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("question-paper")}
              >
                Export Assessment PDF
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("memorandum")}
              >
                Export Memorandum PDF
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                onClick={() => handleExport("rubric")}
              >
                Export Rubric PDF
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-primary rw-export-pack"
                onClick={() => handleExport("complete-pack")}
              >
                Export Complete Assessment Pack PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {showEditPanel && editPanel && (
        <details className="rw-edit-details">
          <summary>Edit questions (optional)</summary>
          {editPanel}
        </details>
      )}

      <div className="marks-step-actions" style={{ marginTop: "1.5rem" }}>
        {onSaveEdits && (
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            disabled={saving}
            onClick={onSaveEdits}
          >
            {saving ? "Saving…" : "Save Edits"}
          </button>
        )}
        {canApprove && onContinueToApprove ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            disabled={saving}
            onClick={onContinueToApprove}
          >
            Continue to Approve
          </button>
        ) : (
          <p className="rw-approval-blocked">
            Approval is available after all review tabs pass validation: assessment paper, memorandum,
            rubric, cognitive analysis (40/40/20), and framework compliance.
          </p>
        )}
      </div>
    </div>
  );
}
