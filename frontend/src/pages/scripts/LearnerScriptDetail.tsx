import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { hasPermission, isHodDashboard, usesTeacherGoldenPathNav } from "../../auth/permissions";
import type {
  AnnotationTool,
  LearnerFeedbackEntry,
  LearnerScriptDetail,
  LearnerScriptSummary,
  ScriptAuditEntry,
  ScriptLayerDetail,
  ScriptPageInfo,
  RubricMarkRow,
  RubricMarksResponse,
  ScriptQuestionMarkRow,
  ScriptWorkflowInfo,
  ViewMode,
  WorkspaceRole,
} from "../../types";
import { validateScriptMarks } from "../../utils/submitValidation";
import ModerationEscalateModal from "../moderation/shared/ModerationEscalateModal";
import ModerationReturnModal from "../moderation/shared/ModerationReturnModal";
import "../moderation/ModerationWorkflow.css";
import "./Scripts.css";

export default function LearnerScriptDetailPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();
  const teacherSimple = usesTeacherGoldenPathNav(user);

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
  const [saveMessage, setSaveMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [siblingScripts, setSiblingScripts] = useState<LearnerScriptSummary[]>([]);
  const [showAudit, setShowAudit] = useState(false);
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
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateRole, setEscalateRole] = useState<WorkspaceRole>("MODERATOR");
  const [escalateComment, setEscalateComment] = useState("");
  const [dirty, setDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "offline">(
    "idle"
  );
  const [flaggedForReview, setFlaggedForReview] = useState(false);
  const [privateTeacherNotes, setPrivateTeacherNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [submitIssues, setSubmitIssues] = useState<string[]>([]);
  const [showSubmitOverride, setShowSubmitOverride] = useState(false);

  const marksRef = useRef(marks);
  const dirtyRef = useRef(dirty);
  const notesDirtyRef = useRef(notesDirty);
  const savingRef = useRef(false);
  marksRef.current = marks;
  dirtyRef.current = dirty;
  notesDirtyRef.current = notesDirty;

  const canMark = hasPermission(user, "scripts.mark");
  const canEscalate = hasPermission(user, "moderation.request_approval");
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
      .then(async ([data, layerData, workflowData, auditData, feedbackData]) => {
        setScript(data);
        setPages(data.pages ?? []);
        setLayers(layerData);
        setWorkflow(workflowData);
        setAuditTimeline(auditData);
        setActiveQuestionIndex(0);
        setSaveMessage("");
        setDirty(false);
        setNotesDirty(false);
        setFlaggedForReview(Boolean(data.flaggedForReview));
        setPrivateTeacherNotes(data.privateTeacherNotes ?? "");
        setAutosaveStatus("idle");
        setShowAudit(false);
        setSubmitIssues([]);
        setShowSubmitOverride(false);
        const initial: Record<string, Partial<ScriptQuestionMarkRow>> = {};
        for (const m of data.questionMarks) {
          initial[m.assessmentQuestionId] = { ...m };
        }
        setMarks(initial);
        if (feedbackData) setFeedback(feedbackData);

        try {
          const batch = await apiFetch<{ learnerScripts: LearnerScriptSummary[] }>(
            `/script-batches/${data.batchId}`
          );
          setSiblingScripts(batch.learnerScripts ?? []);
        } catch {
          setSiblingScripts([]);
        }

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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty && !notesDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, notesDirty]);

  useEffect(() => {
    const onOnline = () => {
      if (dirtyRef.current || notesDirtyRef.current) {
        void handleSave({ silent: true }).then(() => {
          if (notesDirtyRef.current) void persistTeacherReviewMeta();
        });
      } else {
        setAutosaveStatus((s) => (s === "offline" ? "saved" : s));
      }
    };
    const onOffline = () => setAutosaveStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- silent autosave wiring
  }, [scriptId]);

  useEffect(() => {
    if (!dirty || (!teacherMode && !hodMode)) return;
    if (!navigator.onLine) {
      setAutosaveStatus("offline");
      return;
    }
    const timer = window.setTimeout(() => {
      void handleSave({ silent: true });
    }, 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, marks, teacherMode, hodMode]);

  useEffect(() => {
    if (!notesDirty || !teacherMode) return;
    if (!navigator.onLine) {
      setAutosaveStatus("offline");
      return;
    }
    const timer = window.setTimeout(() => {
      void persistTeacherReviewMeta();
    }, 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDirty, privateTeacherNotes, teacherMode]);

  useEffect(() => {
    if (!dirty && !notesDirty) return;
    const interval = window.setInterval(() => {
      if (!navigator.onLine) {
        setAutosaveStatus("offline");
        return;
      }
      if (dirtyRef.current) void handleSave({ silent: true });
      if (notesDirtyRef.current) void persistTeacherReviewMeta();
    }, 8000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, notesDirty, scriptId]);

  useEffect(() => {
    if (!pages.length) return;
    const synced = Math.min(activeQuestionIndex, pages.length - 1);
    setActivePageIndex(synced);
  }, [activeQuestionIndex, pages.length]);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showReturnModal) {
          setShowReturnModal(false);
          e.preventDefault();
        } else if (showEscalateModal) {
          setShowEscalateModal(false);
          e.preventDefault();
        } else if (showSubmitOverride) {
          setShowSubmitOverride(false);
          e.preventDefault();
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void handleSave({ silent: false });
        if (notesDirtyRef.current) void persistTeacherReviewMeta();
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (mod) return;

      const idx = siblingScripts.findIndex((s) => s.id === scriptId);
      const prev = idx > 0 ? siblingScripts[idx - 1] : null;
      const next =
        idx >= 0 && idx < siblingScripts.length - 1 ? siblingScripts[idx + 1] : null;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (prev) void goToSibling(prev.id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (next) void goToSibling(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveQuestionIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveQuestionIndex((i) =>
          Math.min(Math.max((script?.questionMarks.length ?? 1) - 1, 0), i + 1)
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showReturnModal,
    showEscalateModal,
    showSubmitOverride,
    siblingScripts,
    scriptId,
    script?.questionMarks.length,
  ]);

  // Marks update helpers continue below — handleSave is defined later and called via effects after mount.
  const updateMark = (
    questionId: string,
    field: keyof ScriptQuestionMarkRow,
    value: string
  ) => {
    setDirty(true);
    setSaveMessage("");
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

  const handleSave = async (opts?: { silent?: boolean }) => {
    if (!scriptId || savingRef.current) return false;
    if (!navigator.onLine) {
      setAutosaveStatus("offline");
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    if (!opts?.silent) setError("");
    setAutosaveStatus("saving");
    if (!opts?.silent) setSaveMessage("");
    try {
      const currentMarks = marksRef.current;
      const payload = Object.entries(currentMarks).map(([assessmentQuestionId, m]) => ({
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
      setDirty(false);
      setAutosaveStatus("saved");
      if (!opts?.silent) setSaveMessage("Mark saved.");
      const auditData = await apiFetch<ScriptAuditEntry[]>(
        `/scripts/${scriptId}/audit-timeline`
      );
      setAuditTimeline(auditData);
      return true;
    } catch (err) {
      if (!navigator.onLine) setAutosaveStatus("offline");
      else if (!opts?.silent) setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const persistTeacherReviewMeta = async (next?: {
    flaggedForReview?: boolean;
    privateTeacherNotes?: string;
  }) => {
    if (!scriptId || !teacherMode) return;
    if (!navigator.onLine) {
      setAutosaveStatus("offline");
      return;
    }
    try {
      setAutosaveStatus("saving");
      const updated = await apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}/teacher-review`, {
        method: "PATCH",
        body: JSON.stringify({
          flaggedForReview: next?.flaggedForReview ?? flaggedForReview,
          privateTeacherNotes: next?.privateTeacherNotes ?? privateTeacherNotes,
        }),
      });
      setScript(updated);
      setFlaggedForReview(Boolean(updated.flaggedForReview));
      setPrivateTeacherNotes(updated.privateTeacherNotes ?? "");
      setNotesDirty(false);
      setAutosaveStatus("saved");
    } catch {
      if (!navigator.onLine) setAutosaveStatus("offline");
    }
  };

  const confirmLeaveIfDirty = async () => {
    if (!dirtyRef.current && !notesDirtyRef.current) return true;
    const saved = await handleSave({ silent: true });
    if (notesDirtyRef.current) await persistTeacherReviewMeta();
    return saved || (!dirtyRef.current && !notesDirtyRef.current);
  };

  const goToSibling = async (targetId: string) => {
    const ok = await confirmLeaveIfDirty();
    if (!ok) return;
    navigate(`/scripts/${targetId}`);
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
    if (!scriptId || completing) return;
    setCompleting(true);
    setError("");
    try {
      await handleSave();
      const updated = await apiFetch<LearnerScriptDetail>(`/scripts/${scriptId}/complete`, {
        method: "POST",
      });
      setScript(updated);
      setDirty(false);
      setSaveMessage("Learner finished.");
      await refreshWorkflow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish this learner");
    } finally {
      setCompleting(false);
    }
  };

  const handleSubmitModerationSafe = async (force = false) => {
    if (!script?.batchId) return;
    const unfinished = siblingScripts.filter((s) => s.status !== "MARKED");
    if (unfinished.length > 0 && !force) {
      setError(
        `${unfinished.length} learner paper(s) still need to be finished. Open them and select “Finish This Learner” before sending.`
      );
      return;
    }

    if (!force) {
      const questionMarks = script.questionMarks.map((q) => {
        const m = marks[q.assessmentQuestionId] ?? q;
        return {
          questionNumber: q.questionNumber,
          maxMarks: q.maxMarks,
          teacherMark: m.teacherMark ?? null,
        };
      });
      const validation = validateScriptMarks({
        questionMarks,
        teacherTotal: script.teacherTotal,
      });
      if (!validation.ok) {
        setSubmitIssues(validation.issues.map((i) => i.message));
        setShowSubmitOverride(true);
        return;
      }
    }

    setShowSubmitOverride(false);
    setSubmitIssues([]);
    await runBatchAction("/submit-to-hod");
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

  const handleSubmitModeration = () => {
    void handleSubmitModerationSafe();
  };
  const handleStartReview = () => runBatchAction("/review");
  const handleApprove = () => runBatchAction("/approve");

  const handleReturnConfirm = async () => {
    if (!returnComment.trim() || !script?.batchId) return;
    setWorkflowBusy(true);
    setError("");
    try {
      await apiFetch(`/script-batches/${script.batchId}/return`, {
        method: "POST",
        body: JSON.stringify({ comment: returnComment.trim() }),
      });
      await refreshWorkflow();
      load();
      setShowReturnModal(false);
      setReturnComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleEscalate = async () => {
    if (!script?.assessment.id) return;
    setWorkflowBusy(true);
    setError("");
    try {
      await apiFetch(`/moderation-trail/assessments/${script.assessment.id}/approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          assignedRole: escalateRole,
          comment: escalateComment.trim() || undefined,
        }),
      });
      setShowEscalateModal(false);
      setEscalateComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setWorkflowBusy(false);
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

  if (loading) return <p>Opening learner paper…</p>;

  if (error && !script) {
    return (
      <div>
        <p className="sc-error">{error}</p>
        <Link to={teacherSimple ? "/marking" : "/assessments"} className="sc-btn sc-btn-ghost">
          {teacherSimple ? "Back to Mark Papers" : "Back"}
        </Link>
      </div>
    );
  }

  if (!script || !scriptId) return null;

  const activePage = pages[activePageIndex] ?? null;
  const siblingIndex = siblingScripts.findIndex((s) => s.id === scriptId);
  const prevSibling = siblingIndex > 0 ? siblingScripts[siblingIndex - 1] : null;
  const nextSibling =
    siblingIndex >= 0 && siblingIndex < siblingScripts.length - 1
      ? siblingScripts[siblingIndex + 1]
      : null;
  const finishedCount = siblingScripts.filter((s) => s.status === "MARKED").length;

  return (
    <div className={`sc-script-detail${teacherSimple ? " sc-script-detail-teacher" : ""}`}>
      <header className="sc-script-header">
        <Link
          to={teacherSimple ? "/marking" : `/assessments/${script.assessment.id}/scripts`}
          className="sc-detail-back"
          onClick={(e) => {
            e.preventDefault();
            void confirmLeaveIfDirty().then((ok) => {
              if (ok) {
                navigate(teacherSimple ? "/marking" : `/assessments/${script.assessment.id}/scripts`);
              }
            });
          }}
        >
          {teacherSimple ? "← Back to Mark Papers" : "← Scripts"}
        </Link>
        <div className="sc-script-header-main">
          <h1 className="sc-page-title">
            {script.learner.firstName} {script.learner.lastName}
          </h1>
          <p className="sc-page-subtitle">
            {script.assessment.title}
            {siblingScripts.length > 0 ? (
              <>
                {" "}
                · Learner {siblingIndex >= 0 ? siblingIndex + 1 : "—"} of {siblingScripts.length}
                {" "}
                · {finishedCount} of {siblingScripts.length} learners completed
              </>
            ) : (
              <> · Script #{script.scriptNumber}</>
            )}
          </p>
        </div>
        {siblingScripts.length > 1 ? (
          <div className="sc-script-learner-nav" role="group" aria-label="Learner navigation">
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!prevSibling}
              onClick={() => prevSibling && goToSibling(prevSibling.id)}
            >
              Previous learner
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              disabled={!nextSibling}
              onClick={() => nextSibling && goToSibling(nextSibling.id)}
            >
              Next learner
            </button>
          </div>
        ) : null}
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
        onReturn={() => setShowReturnModal(true)}
        onEscalate={
          canEscalate && canModerate
            ? () => {
                setEscalateRole("MODERATOR");
                setEscalateComment("");
                setShowEscalateModal(true);
              }
            : undefined
        }
        onFinalise={handleFinalise}
      />

      {showSubmitOverride && submitIssues.length > 0 ? (
        <div className="sc-submit-review-panel" role="region" aria-label="Submit validation">
          <h3>Review before Submit to HOD</h3>
          <ul>
            {submitIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <div className="sc-form-actions">
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              onClick={() => setShowSubmitOverride(false)}
            >
              Return to marking
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              onClick={() => {
                const ok = window.confirm(
                  "Override validation issues and submit to HOD anyway?"
                );
                if (ok) void handleSubmitModerationSafe(true);
              }}
            >
              Override and submit
            </button>
          </div>
        </div>
      ) : null}

      <ModerationReturnModal
        open={showReturnModal}
        itemName={
          script
            ? `${script.learner.firstName} ${script.learner.lastName} · Script #${script.scriptNumber}`
            : ""
        }
        comment={returnComment}
        onCommentChange={setReturnComment}
        busy={workflowBusy}
        onConfirm={handleReturnConfirm}
        onCancel={() => {
          setShowReturnModal(false);
          setReturnComment("");
        }}
        title="Return learner papers to teacher"
        confirmLabel="Return to teacher"
        placeholder="Reason for returning to teacher…"
      />

      <ModerationEscalateModal
        open={showEscalateModal}
        itemName={script?.assessment.title ?? ""}
        role={escalateRole}
        onRoleChange={setEscalateRole}
        comment={escalateComment}
        onCommentChange={setEscalateComment}
        busy={workflowBusy}
        onConfirm={() => void handleEscalate()}
        onCancel={() => {
          setShowEscalateModal(false);
          setEscalateComment("");
        }}
      />

      {error ? <p className="sc-error" role="alert">{error}</p> : null}
      {dirty ? (
        <p className="sc-unsaved-banner" role="status">
          You have unsaved mark changes.
        </p>
      ) : null}

      {isReadOnly ? (
        <div className="sc-readonly-banner">
          This learner paper is locked. Marks cannot be changed.
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
            saveMessage={saveMessage}
            autosaveStatus={autosaveStatus}
            onUpdateMark={updateMark}
            onSave={() => void handleSave()}
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
            activeQuestionIndex={activeQuestionIndex}
            onActiveQuestionIndexChange={setActiveQuestionIndex}
            flaggedForReview={flaggedForReview}
            privateTeacherNotes={privateTeacherNotes}
            canUseTeacherReviewTools={Boolean(teacherMode)}
            onToggleFlag={() => {
              if (!teacherMode) return;
              const next = !flaggedForReview;
              setFlaggedForReview(next);
              void persistTeacherReviewMeta({ flaggedForReview: next });
            }}
            onPrivateNotesChange={(value) => {
              if (!teacherMode) return;
              setPrivateTeacherNotes(value);
              setNotesDirty(true);
            }}
          />
        )}
      </div>

      <div className="sc-card sc-audit-panel">
        <button
          type="button"
          className="sc-btn sc-btn-ghost sc-audit-toggle"
          aria-expanded={showAudit}
          onClick={() => setShowAudit((v) => !v)}
        >
          {showAudit ? "Hide history" : "More actions · History"}
        </button>
        {showAudit ? (
          <>
            <h3 className="sc-script-panel-title">History</h3>
            <ScriptAuditTimeline entries={auditTimeline} />
          </>
        ) : null}
      </div>
    </div>
  );
}
