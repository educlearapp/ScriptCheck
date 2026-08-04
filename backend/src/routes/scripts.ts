import fs from "fs";
import { Router, type Response } from "express";
import multer from "multer";
import { AnnotationLayerType } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePaidPlan } from "../middleware/requirePaidPlan";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  completeLearnerScript,
  getLearnerScript,
  saveScriptMarks,
  ScriptError,
  updateTeacherReviewMeta,
} from "../services/scriptMarking";
import {
  getRubricMarksForScript,
  saveRubricMarks,
} from "../services/rubricMarking";
import {
  createLearnerFeedback,
  FeedbackError,
  listLearnerFeedback,
} from "../services/learnerFeedback";
import { generateLearnerResultPdf } from "../services/pdfReports";
import { ResultsError } from "../services/assessmentResults";
import {
  getScriptPageFile,
  listScriptPages,
  uploadScriptPages,
} from "../services/scriptPages";
import {
  getScriptLayers,
  updateScriptLayer,
  type AnnotationData,
} from "../services/scriptAnnotations";
import {
  getAnnotatedPageCompositePlan,
  renderAnnotatedPageCompositePdf,
  type CompositeViewMode,
} from "../services/annotatedScriptComposite";
import {
  finaliseScript,
  getScriptAuditTimeline,
  getScriptWorkflow,
} from "../services/scriptWorkflow";
import { MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE } from "../config/uploadLimits";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE, files: MAX_UPLOAD_FILES },
});

function handleError(res: Response, err: unknown) {
  if (err instanceof ScriptError || err instanceof FeedbackError || err instanceof ResultsError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[scripts]", err);
  return res.status(500).json({ error: "Script operation failed" });
}

router.get(
  "/:id/pages",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const pages = await listScriptPages(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(pages);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/pages/upload",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_CREATE),
  upload.array("files", MAX_UPLOAD_FILES),
  async (req: AuthenticatedRequest, res) => {
    const scriptId = String(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    try {
      const result = await uploadScriptPages(
        scriptId,
        req.auth!.workspaceId,
        req.auth!.userId,
        files.map((f) => ({
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          buffer: f.buffer,
        }))
      );

      await logAudit({
        action: "SCRIPT_PAGE_UPLOADED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          scriptId,
          pageCount: result.pageCount,
          uploadedPages: result.pages.length,
        },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/pages/:pageId/file",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const file = await getScriptPageFile(
        String(req.params.id),
        String(req.params.pageId),
        req.auth!.workspaceId
      );

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${file.fileName.replace(/"/g, "")}"`
      );

      const stream = fs.createReadStream(file.filePath);
      stream.pipe(res);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/pages/:pageId/composite-plan",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewMode = (String(req.query.viewMode ?? "all") ||
        "all") as CompositeViewMode;
      const plan = await getAnnotatedPageCompositePlan(
        String(req.params.id),
        String(req.params.pageId),
        req.auth!.workspaceId,
        viewMode
      );
      return res.json(plan);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/pages/:pageId/composite.pdf",
  requireAuth,
  requirePaidPlan,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const viewMode = (String(req.query.viewMode ?? "all") ||
        "all") as CompositeViewMode;
      const pdf = await renderAnnotatedPageCompositePdf(
        String(req.params.id),
        String(req.params.pageId),
        req.auth!.workspaceId,
        viewMode
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="annotated-page-${String(req.params.pageId).slice(0, 8)}.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/layers",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const layers = await getScriptLayers(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(layers);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.put(
  "/:id/layers/:layerType",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const scriptId = String(req.params.id);
    const layerType = String(req.params.layerType) as AnnotationLayerType;

    if (!Object.values(AnnotationLayerType).includes(layerType)) {
      return res.status(400).json({ error: "Invalid layer type" });
    }

    const annotationData = (req.body?.annotationData ?? req.body) as AnnotationData;

    try {
      const result = await updateScriptLayer(
        scriptId,
        layerType,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        annotationData
      );

      await logAudit({
        action: result.auditAction,
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { scriptId, layerType },
        ...auditRequestMeta(req),
      });

      return res.json(result.layer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/feedback",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const items = await listLearnerFeedback(
        String(req.params.id),
        req.auth!.workspaceId,
        req.access!
      );
      return res.json(items);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/feedback",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await createLearnerFeedback(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        req.body ?? {}
      );

      await logAudit({
        action: "LEARNER_FEEDBACK_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { scriptId: String(req.params.id), feedbackId: item.id },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/reports/learner.pdf",
  requireAuth,
  requirePaidPlan,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    const scriptId = String(req.params.id);

    try {
      const pdf = await generateLearnerResultPdf(
        scriptId,
        req.auth!.workspaceId,
        req.access!
      );

      await logAudit({
        action: "LEARNER_REPORT_GENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { scriptId },
        ...auditRequestMeta(req),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="learner-${scriptId.slice(0, 8)}.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/workflow",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workflow = await getScriptWorkflow(
        String(req.params.id),
        req.auth!.workspaceId,
        req.access!
      );
      return res.json(workflow);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/audit-timeline",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const timeline = await getScriptAuditTimeline(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(timeline);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/finalise",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_FINALISE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workflow = await finaliseScript(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(workflow);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const script = await getLearnerScript(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(script);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.put(
  "/:id/marks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];

    try {
      const result = await saveScriptMarks(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        marks
      );

      await logAudit({
        action: result.audit.markAction,
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          scriptId: String(req.params.id),
          varianceLevel: result.audit.varianceLevel,
          moderationVariancePercent: result.audit.moderationVariancePercent,
        },
        ...auditRequestMeta(req),
      });

      if (result.audit.varianceFlagged) {
        await logAudit({
          action: "SCRIPT_VARIANCE_FLAGGED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            scriptId: String(req.params.id),
            varianceLevel: result.audit.varianceLevel,
            moderationVariancePercent: result.audit.moderationVariancePercent,
          },
          ...auditRequestMeta(req),
        });
      }

      return res.json(result.script);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/teacher-review",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MARK),
  async (req: AuthenticatedRequest, res) => {
    try {
      const script = await updateTeacherReviewMeta(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        {
          flaggedForReview:
            typeof req.body?.flaggedForReview === "boolean"
              ? req.body.flaggedForReview
              : undefined,
          privateTeacherNotes:
            req.body?.privateTeacherNotes === undefined
              ? undefined
              : req.body.privateTeacherNotes,
        }
      );

      await logAudit({
        action: "SCRIPT_MARK_UPDATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          scriptId: String(req.params.id),
          kind: "teacher_review_meta",
          flaggedForReview: script.flaggedForReview,
          hasPrivateNotes: Boolean(script.privateTeacherNotes?.trim()),
        },
        ...auditRequestMeta(req),
      });

      return res.json(script);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/rubric-marks",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getRubricMarksForScript(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.put(
  "/:id/rubric-marks",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];

    try {
      const result = await saveRubricMarks(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        marks
      );

      await logAudit({
        action: "RUBRIC_MARK_CAPTURED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          scriptId: String(req.params.id),
          rubricTemplateId: result.rubricTemplate?.id,
          finalTotal: result.totals?.finalTotal,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/complete",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MARK),
  async (req: AuthenticatedRequest, res) => {
    try {
      const script = await completeLearnerScript(
        String(req.params.id),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "SCRIPT_MARKED_COMPLETE",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { scriptId: String(req.params.id) },
        ...auditRequestMeta(req),
      });

      return res.json(script);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
