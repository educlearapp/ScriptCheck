import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDownload, apiFetch, apiOpenPdf, apiUpload } from "../../api";
import { useTrialGate } from "../../trial/TrialGateContext";
import ScriptAuditTimeline from "../../components/scripts/ScriptAuditTimeline";
import ScriptMarkingPanel from "../../components/scripts/ScriptMarkingPanel";
import RubricMarkingPanel from "../../components/scripts/RubricMarkingPanel";
import ScriptPageList from "../../components/scripts/ScriptPageList";
import ScriptViewer from "../../components/scripts/ScriptViewer";
import ScriptWorkflowBar from "../../components/scripts/ScriptWorkflowBar";
import ConcessionAlerts from "../../components/concessions/ConcessionAlerts";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission, isHodDashboard } from "../../auth/permissions";
import type {
  AnnotationTool,
  LearnerFeedbackEntry,
  LearnerScriptDetail,
  ScriptAuditEntry,
  ScriptLayerDetail,
  ScriptPageInfo,
  RubricMarkRow,
  RubricMarksResponse,
  ScriptQuestionMarkRow,
  ScriptWorkflowInfo,
  ViewMode,
} from "../../types";
import "./Scripts.css";

export default function LearnerScriptDetailPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();

  const [script, setScript] = useState<LearnerScriptDetail | null>(null);
  const [pages, setPages] = useState<ScriptPageInfo[]>([]);
  const [layers, setLayers] = useState<ScriptLayerDetail[]>([]);
  const [marks, setMarks] = useState<Record<string, Partial<ScriptQuestionMarkRow>>>({});
  const [rubricData, setRubricData] = useState<RubricMarksResponse | null>(null);
  const [rubricMarks, setRubricMarks] = useState<Record<string, Partial<RubricMarkRow>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activeTool, setActiveTool] = useState<AnnotationTool>("draw");
  const [feedback, setFeedback] = useState<LearnerFeedbackEntry[]>([]);
  const [feedbackForm, setFeedbackForm] = useState({
    teacherFeedback: "",
    improvementNotes: "",
    hodFeedback: "",
    interventionNotes: "",
  });
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [workflow, setWorkflow] = useState<ScriptWorkflowInfo | null>(null);
  const [auditTimeline, setAuditTimeline] = useState<ScriptAuditEntry[]>([]);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const canMark = hasPermission(user, "scripts.mark");
  const canFinalise = hasPermission(user, "scripts.finalise");
  const canModerate = hasPermission(user, "scripts.moderate");
  const canUpload = hasPermission(user, "scripts.create");
  const canViewFeedback = hasPermission(user, "feedback.view");
  const canCreateFeedback = hasPermission(user, "feedback.create");
  const canGenerateReports = hasPermission(user, "reports.generate");
  const hodFeedbackMode = isHodDashboard(user) || canModerate;

  const isReadOnly = script?.isReadOnly ?? false;

  const teacherMode =
    canMark && script && !isReadOnly && (script.canEditTeacherLayer ?? false);

  const hodMode =
    canModerate && script && !isReadOnly && (script.canEditHodLayer ?? false);

  const canAnnotateTeacher = Boolean(teacherMode);
  const canAnnotateHod = Boolean(hodMode);
  const canUploadPages = canUpload && !isReadOnly;

  const load = useCallback(() => {
    if (!scriptId) return;
    setLoading(true);

    const requests: [
      Promise<LearnerScriptDetail>,
      Promise<ScriptLayerDetail[]>,
      Promise<ScriptWorkflowInfo>,
      Promise<ScriptAuditEntry[]>,
      Promise<LearnerFeedbackEntry[] | null>,
    ] = [
      apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}`),
      apiFetch<ScriptLayerDetail[]>(`/scripts/${scriptId}/layers`),
      apiFetch<ScriptWorkflowInfo>(`/scripts/${scriptId}/workflow`),
      apiFetch<ScriptAuditEntry[]>(`/scripts/${scriptId}/audit-timeline`),
      canViewFeedback
        ? apiFetch<LearnerFeedbackEntry[]>(`/scripts/${scriptId}/feedback`)
        : Promise.resolve(null),
    ];

    Promise.all(requests)
      .then(([data, layerData, workflowData, auditData, feedbackData]) => {
        setScript(data);
        setPages(data.pages ?? []);
        setLayers(layerData);
        setWorkflow(workflowData);
        setAuditTimeline(auditData);
        const initial: Record<string, Partial<ScriptQuestionMarkRow>> = {};
        for (const m of data.questionMarks) {
          initial[m.assessmentQuestionId] = { ...m };
        }
        setMarks(initial);
        if (feedbackData) setFeedback(feedbackData);

        if (data.assessment.rubricTemplateId) {
          apiFetch<RubricMarksResponse>(`/scripts/${scriptId}/rubric-marks`)
            .then((rubric) => {
              setRubricData(rubric);
              const rubricInitial: Record<string, Partial<RubricMarkRow>> = {};
              for (const m of rubric.marks) {
                rubricInitial[m.rubricCriterionId] = { ...m };
              }
              setRubricMarks(rubricInitial);
            })
            .catch(() => setRubricData(null));
        } else {
          setRubricData(null);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load script")
      )
      .finally(() => setLoading(false));
  }, [scriptId, canViewFeedback]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (hodMode) setViewMode("hod");
    else if (teacherMode) setViewMode("teacher");
  }, [hodMode, teacherMode]);

  const updateMark = (
    questionId: string,
    field: keyof ScriptQuestionMarkRow,
    value: string
  ) => {
    setMarks((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: field.includes("Mark") ? (value === "" ? null : Number(value)) : value,
      },
    }));
  };

  const updateRubricMark = (
    criterionId: string,
    field: "teacherMark" | "hodMark" | "teacherComment" | "hodComment",
    value: string
  ) => {
    setRubricMarks((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        [field]: field.includes("Mark") ? (value === "" ? null : Number(value)) : value,
      },
    }));
  };

  const handleSaveRubric = async () => {
    if (!scriptId) return;
    setSaving(true);
    setError("");
    try {
      const payload = Object.entries(rubricMarks).map(([rubricCriterionId, m]) => ({
        rubricCriterionId,
        ...(teacherMode
          ? { teacherMark: m.teacherMark ?? null, teacherComment: m.teacherComment ?? null }
          : {}),
        ...(hodMode
          ? { hodMark: m.hodMark ?? null, hodComment: m.hodComment ?? null }
          : {}),
      }));

      const result = await apiFetch<RubricMarksResponse>(`/scripts/${scriptId}/rubric-marks`, {
        method: "PUT",
        body: JSON.stringify({ marks: payload }),
      });
      setRubricData(result);
      const rubricInitial: Record<string, Partial<RubricMarkRow>> = {};
      for (const m of result.marks) {
        rubricInitial[m.rubricCriterionId] = { ...m };
      }
      setRubricMarks(rubricInitial);

      const updated = await apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}`);
      setScript(updated);
      const auditData = await apiFetch<ScriptAuditEntry[]>(
        `/scripts/${scriptId}/audit-timeline`
      );
      setAuditTimeline(auditData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!scriptId) return;
    setSaving(true);
    setError("");
    try {
      const payload = Object.entries(marks).map(([assessmentQuestionId, m]) => ({
        assessmentQuestionId,
        ...(teacherMode
          ? {
              teacherMark: m.teacherMark ?? null,
              teacherComment: m.teacherComment ?? null,
              teacherAnnotatedText: m.teacherAnnotatedText ?? null,
            }
          : {}),
        ...(hodMode
          ? {
              hodMark: m.hodMark ?? null,
              hodComment: m.hodComment ?? null,
              hodAnnotatedText: m.hodAnnotatedText ?? null,
            }
          : {}),
      }));

      const updated = await apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}/marks`, {
        method: "PUT",
        body: JSON.stringify({ marks: payload }),
      });
      setScript(updated);
      const auditData = await apiFetch<ScriptAuditEntry[]>(
        `/scripts/${scriptId}/audit-timeline`
      );
      setAuditTimeline(auditData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!scriptId) return;
    setFeedbackSaving(true);
    setFeedbackError("");
    try {
      const item = await apiFetch<LearnerFeedbackEntry>(`/scripts/${scriptId}/feedback`, {
        method: "POST",
        body: JSON.stringify(feedbackForm),
      });
      setFeedback((prev) => [item, ...prev]);
      setFeedbackForm({
        teacherFeedback: "",
        improvementNotes: "",
        hodFeedback: "",
        interventionNotes: "",
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!scriptId || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    setError("");
    try {
      const result = await apiUpload<{
        pages: ScriptPageInfo[];
        pageCount: number;
      }>(
        `/scripts/${scriptId}/pages/upload`,
        files,
        (percent) => setUploadProgress(percent)
      );

      setPages((prev) => {
        const merged = [...prev, ...result.pages].sort(
          (a, b) => a.pageNumber - b.pageNumber
        );
        return merged;
      });
      if (script) {
        setScript({ ...script, pageCount: result.pageCount });
      }
      if (pages.length === 0 && result.pages.length > 0) {
        setActivePageIndex(0);
      }
      setUploadProgress(100);
      await refreshWorkflow();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError(message);
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadLearnerPdf = async () => {
    if (!scriptId) return;
    if (!gateProductionAction()) return;
    try {
      await apiDownload(`/scripts/${scriptId}/reports/learner.pdf`, "learner-report.pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF download failed");
    }
  };

  const handlePrintLearnerPdf = async () => {
    if (!scriptId) return;
    if (!gateProductionAction()) return;
    try {
      await apiOpenPdf(`/scripts/${scriptId}/reports/learner.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open PDF");
    }
  };

  const refreshWorkflow = async () => {
    if (!scriptId) return;
    const [workflowData, auditData, scriptData] = await Promise.all([
      apiFetch<ScriptWorkflowInfo>(`/scripts/${scriptId}/workflow`),
      apiFetch<ScriptAuditEntry[]>(`/scripts/${scriptId}/audit-timeline`),
      apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}`),
    ]);
    setWorkflow(workflowData);
    setAuditTimeline(auditData);
    setScript(scriptData);
  };

  const handleComplete = async () => {
    if (!scriptId) return;
    setCompleting(true);
    setError("");
    try {
      await handleSave();
      const updated = await apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}/complete`, {
        method: "POST",
      });
      setScript(updated);
      await refreshWorkflow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    } finally {
      setCompleting(false);
    }
  };

  const runBatchAction = async (
    path: string,
    body?: Record<string, string>
  ) => {
    if (!script?.batchId) return;
    setWorkflowBusy(true);
    setError("");
    try {
      await apiFetch(`/script-batches/${script.batchId}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await refreshWorkflow();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow action failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleSubmitModeration = () => runBatchAction("/submit-to-hod");
  const handleStartReview = () => runBatchAction("/review");
  const handleApprove = () => runBatchAction("/approve");
  const handleReturn = () => {
    const comment = window.prompt("Reason for returning to teacher:");
    if (comment?.trim()) {
      void runBatchAction("/return", { comment: comment.trim() });
    }
  };

  const handleFinalise = async () => {
    if (!scriptId || !canFinalise) return;
    if (!window.confirm("Finalise this script? It will become read-only.")) return;
    setWorkflowBusy(true);
    setError("");
    try {
      await apiFetch(`/scripts/${scriptId}/finalise`, { method: "POST" });
      await refreshWorkflow();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalise failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  if (loading) return <p>Loading script…</p>;

  if (error && !script) {
    return (
      <div>
        <p className="sc-error">{error}</p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost">Back</Link>
      </div>
    );
  }

  if (!script || !scriptId) return null;

  const activePage = pages[activePageIndex] ?? null;

  return (
    <div className="sc-script-detail">
      <header className="sc-script-header">
        <Link to={`/assessments/${script.assessment.id}/scripts`} className="sc-detail-back">
          ← Scripts
        </Link>
        <div>
          <h1 className="sc-page-title">
            {script.learner.firstName} {script.learner.lastName}
          </h1>
          <p className="sc-page-subtitle">
            {script.assessment.title} · Script #{script.scriptNumber}
            {script.pageCount > 0 ? ` · ${script.pageCount} pages` : ""}
          </p>
        </div>
      </header>

      {hasPermission(user, "concessions.view") ? (
        <ConcessionAlerts assessmentId={script.assessment.id} compact />
      ) : null}

      <ScriptWorkflowBar
        workflow={workflow}
        busy={workflowBusy || completing}
        onComplete={handleComplete}
        onSubmitModeration={handleSubmitModeration}
        onStartReview={handleStartReview}
        onApprove={handleApprove}
        onReturn={handleReturn}
        onFinalise={handleFinalise}
      />

      {error ? <p className="sc-error">{error}</p> : null}

      {isReadOnly ? (
        <div className="sc-readonly-banner">
          This script is finalised and read-only. Annotations and marks cannot be changed.
        </div>
      ) : null}

      <div className="sc-script-workspace">
        <ScriptPageList
          scriptId={scriptId}
          pages={pages}
          activePageIndex={activePageIndex}
          onSelectPage={setActivePageIndex}
          canUpload={canUploadPages}
          onUpload={handleUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
        />

        <ScriptViewer
          scriptId={scriptId}
          page={activePage}
          layers={layers}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          canAnnotateTeacher={canAnnotateTeacher}
          canAnnotateHod={canAnnotateHod}
          onLayersUpdate={setLayers}
          activePageIndex={activePageIndex}
          totalPages={Math.max(pages.length, 1)}
          onPrevPage={() => setActivePageIndex((i) => Math.max(0, i - 1))}
          onNextPage={() =>
            setActivePageIndex((i) => Math.min(pages.length - 1, i + 1))
          }
          onSelectPage={setActivePageIndex}
        />

        {rubricData?.rubricTemplate ? (
          <RubricMarkingPanel
            data={rubricData}
            marks={rubricMarks}
            teacherMode={Boolean(teacherMode)}
            hodMode={Boolean(hodMode)}
            saving={saving}
            onUpdateMark={updateRubricMark}
            onSave={handleSaveRubric}
            finalFeedback={feedbackForm.teacherFeedback}
            onFinalFeedbackChange={(v) =>
              setFeedbackForm((f) => ({ ...f, teacherFeedback: v }))
            }
            onSaveFeedback={handleSaveFeedback}
            feedbackSaving={feedbackSaving}
          />
        ) : (
          <ScriptMarkingPanel
            script={script}
            marks={marks}
            teacherMode={Boolean(teacherMode)}
            hodMode={Boolean(hodMode)}
            saving={saving}
            completing={completing}
            onUpdateMark={updateMark}
            onSave={handleSave}
            onComplete={handleComplete}
            canGenerateReports={canGenerateReports}
            onDownloadPdf={handleDownloadLearnerPdf}
            onPrintPdf={handlePrintLearnerPdf}
            canViewFeedback={canViewFeedback}
            canCreateFeedback={canCreateFeedback}
            hodFeedbackMode={hodFeedbackMode}
            feedback={feedback}
            feedbackForm={feedbackForm}
            feedbackSaving={feedbackSaving}
            feedbackError={feedbackError}
            onFeedbackFormChange={(field, value) =>
              setFeedbackForm((f) => ({ ...f, [field]: value }))
            }
            onSaveFeedback={handleSaveFeedback}
          />
        )}
      </div>

      <div className="sc-card sc-audit-panel">
        <h3 className="sc-script-panel-title">Audit Timeline</h3>
        <ScriptAuditTimeline entries={auditTimeline} />
      </div>
    </div>
  );
}
