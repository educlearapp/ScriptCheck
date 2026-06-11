import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiOpenPdf } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import {
  hasPermission,
  isAssessmentReadOnly,
} from "../../auth/permissions";
import BetaBanner from "../beta/BetaBanner";
import ConcessionAlerts from "../concessions/ConcessionAlerts";
import AssessmentHealthReport from "../intelligence/AssessmentHealthReport";
import AssessmentIntelligenceBadge from "../intelligence/AssessmentIntelligenceBadge";
import { useAssessmentIntelligence } from "../../hooks/useAssessmentIntelligence";
import { useAssessmentQuestions } from "../../hooks/useAssessmentQuestions";
import { useAssessmentWorkflow } from "../../hooks/useAssessmentWorkflow";
import { useTrialGate } from "../../trial/TrialGateContext";
import type { AssessmentDetail, QuestionsResponse } from "../../types";
import AssessmentTabBar, { type AssessmentTab } from "./AssessmentTabBar";
import WorkflowStageBadge from "./workflow/WorkflowStageBadge";
import WorkflowActions from "./workflow/WorkflowActions";
import AssessmentQuestionsTab from "./tabs/AssessmentQuestionsTab";
import AssessmentMemorandumTab from "./tabs/AssessmentMemorandumTab";
import AssessmentRubricTab from "./tabs/AssessmentRubricTab";
import AssessmentIntelligenceTab from "./tabs/AssessmentIntelligenceTab";
import AssessmentWorkflowTab from "./tabs/AssessmentWorkflowTab";
import AssessmentModerationTab from "./tabs/AssessmentModerationTab";
import AssessmentMarkingTab from "./tabs/AssessmentMarkingTab";
import AssessmentAuditTab from "./tabs/AssessmentAuditTab";
import AssessmentFilesTab from "./tabs/AssessmentFilesTab";
import "../intelligence/AssessmentHealthReport.css";
import "./AssessmentCommandCentre.css";
import "../../pages/assessments/AssessmentDetail.css";

type Props = {
  assessmentId: string;
};

export default function AssessmentCommandCentre({ assessmentId }: Props) {
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AssessmentTab>("assessment");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  const intelligence = useAssessmentIntelligence(assessmentId);
  const workflow = useAssessmentWorkflow(assessmentId);

  const readOnly = assessment && user
    ? isAssessmentReadOnly(user, assessment.creatorTeacher.id, assessment.status)
    : true;

  const refreshAssessment = useCallback(async () => {
    const detail = await apiFetch<AssessmentDetail>(`/assessments/${assessmentId}`);
    setAssessment(detail);
    return detail;
  }, [assessmentId]);

  const q = useAssessmentQuestions(assessmentId, assessment, user, readOnly);

  const reloadAll = useCallback(async () => {
    await refreshAssessment();
    await q.loadQuestions();
    await intelligence.refresh();
    await workflow.refresh();
  }, [refreshAssessment, intelligence, workflow, q]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detail, questionsData] = await Promise.all([
        apiFetch<AssessmentDetail>(`/assessments/${assessmentId}`),
        apiFetch<QuestionsResponse>(`/assessments/${assessmentId}/questions`),
      ]);
      setAssessment(detail);
      setTemplateName(detail.title);
      q.setFromResponse(questionsData);
      await q.loadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assessment");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, q]);

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  const workflowLabel =
    workflow.currentStage?.label ?? assessment?.status.replaceAll("_", " ") ?? "";
  const moderationStatus =
    assessment?.status === "SUBMITTED_TO_HOD" || assessment?.status === "HOD_REVIEW"
      ? "DH Review"
      : assessment?.status === "APPROVED"
        ? "Approved"
        : assessment?.status === "PUBLISHED"
          ? "Published"
          : "Pending";

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      await apiFetch(`/assessment-templates/from-assessment/${assessmentId}`, {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || null,
        }),
      });
      setTemplateOpen(false);
    } finally {
      setTemplateSaving(false);
    }
  };

  if (loading && !assessment) {
    return <p>Loading assessment command centre…</p>;
  }

  if (error || !assessment) {
    return (
      <div>
        <p className="sc-error">{error || "Assessment not found"}</p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost">Back</Link>
      </div>
    );
  }

  const summary = q.marksSummary || assessment.marksSummary;
  const canSaveTemplate =
    hasPermission(user, "assessmentTemplates.create") && q.questions.length > 0;

  return (
    <div className="sc-assessment-detail">
      <BetaBanner note="Assessment Command Centre — ScriptCheck Beta testing version." />
      <div className="sc-assessment-command-header">
        <div>
          <Link to="/assessments" className="sc-detail-back">← Assessments</Link>
          <h1 className="sc-page-title">{assessment.title}</h1>
          <p className="sc-page-subtitle">
            {assessment.subject.name} · {assessment.grade.name} · {assessment.curriculum.code}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <WorkflowStageBadge stage={workflow.currentStage} fallbackStatus={assessment.status} />
            {assessment.setupComplete ? (
              <span className="sc-badge sc-badge-success">Setup Complete</span>
            ) : (
              <span className="sc-badge sc-badge-muted">Setup Pending</span>
            )}
            <AssessmentIntelligenceBadge assessmentId={assessmentId} compact />
          </div>
        </div>
        <div className="sc-detail-actions">
          {!assessment.setupComplete && hasPermission(user, "assessments.edit_own") ? (
            <Link to={`/assessments/${assessmentId}/setup`} className="sc-btn sc-btn-primary">
              Setup Wizard
            </Link>
          ) : null}
          {hasPermission(user, "paperVault.view") ? (
            <Link to={`/assessments/${assessmentId}/paper-vault`} className="sc-btn sc-btn-ghost">
              Paper Vault
            </Link>
          ) : null}
          {hasPermission(user, "export.assessment_pack") ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => {
                gateProductionAction(() => {
                  void apiOpenPdf(`/export/assessments/${assessmentId}/pack.pdf`);
                });
              }}
            >
              Export Pack
            </button>
          ) : null}
          {hasPermission(user, "reports.generate") ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => {
                gateProductionAction(() => {
                  void apiOpenPdf(`/assessments/${assessmentId}/reports/exam-prep.pdf`);
                });
              }}
            >
              Exam Prep PDF
            </button>
          ) : null}
          {canSaveTemplate && !readOnly ? (
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setTemplateOpen(true)}>
              Save Template
            </button>
          ) : null}
          {q.canSaveToBank && q.questions.length > 0 ? (
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              disabled={q.bankSaving === "all"}
              onClick={() => void q.handleSaveAllToBank()}
            >
              Save to Bank
            </button>
          ) : null}
        </div>
      </div>

      {q.actionError ? <p className="sc-error">{q.actionError}</p> : null}

      {hasPermission(user, "concessions.view") ? (
        <ConcessionAlerts assessmentId={assessmentId} />
      ) : null}

      <AssessmentHealthReport
        report={intelligence.report}
        workflowLabel={workflowLabel}
        moderationStatus={moderationStatus}
        loading={intelligence.loading}
        canGenerate={hasPermission(user, "intelligence.generate")}
        generating={intelligence.generating}
        onGenerate={() => void intelligence.generate()}
      />

      <div className="sc-card sc-card-padded" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Quick Workflow</h3>
        <WorkflowActions
          availableActions={workflow.availableActions}
          transitioning={workflow.transitioning}
          error={workflow.error}
          onAction={workflow.transition}
          onSuccess={() => void reloadAll()}
        />
      </div>

      <div className="sc-grid-3 sc-detail-info-grid">
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Declared marks</div>
          <div className="sc-stat-value" style={{ fontSize: "1.4rem" }}>{assessment.totalMarks}</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">From questions</div>
          <div className="sc-stat-value" style={{ fontSize: "1.4rem" }}>
            {summary?.calculatedFromQuestions ?? 0}
          </div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-detail-label">Teacher</div>
          <div>{assessment.creatorTeacher.fullName}</div>
        </div>
      </div>

      <AssessmentTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "assessment" ? (
        <AssessmentQuestionsTab user={user} q={q} onReload={reloadAll} />
      ) : null}
      {activeTab === "memorandum" ? <AssessmentMemorandumTab questions={q.questions} /> : null}
      {activeTab === "rubric" ? (
        <AssessmentRubricTab assessment={assessment} questions={q.questions} />
      ) : null}
      {activeTab === "intelligence" ? (
        <AssessmentIntelligenceTab
          assessmentId={assessmentId}
          workflowLabel={workflowLabel}
          moderationStatus={moderationStatus}
        />
      ) : null}
      {activeTab === "workflow" ? (
        <AssessmentWorkflowTab assessmentId={assessmentId} onTransition={() => void reloadAll()} />
      ) : null}
      {activeTab === "moderation" ? <AssessmentModerationTab assessmentId={assessmentId} /> : null}
      {activeTab === "marking" ? (
        <AssessmentMarkingTab
          assessmentId={assessmentId}
          user={user}
          creatorTeacherId={assessment.creatorTeacher.id}
        />
      ) : null}
      {activeTab === "files" ? <AssessmentFilesTab assessmentId={assessmentId} /> : null}
      {activeTab === "audit" ? <AssessmentAuditTab assessmentId={assessmentId} /> : null}

      {templateOpen ? (
        <div className="sc-qb-picker-overlay" onClick={() => setTemplateOpen(false)}>
          <div className="sc-qb-picker-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2>Save As Template</h2>
            <input className="sc-input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            <textarea className="sc-input" rows={3} value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} />
            <div className="sc-form-actions">
              <button type="button" className="sc-btn sc-btn-primary" disabled={templateSaving} onClick={() => void handleSaveTemplate()}>
                Save
              </button>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setTemplateOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
