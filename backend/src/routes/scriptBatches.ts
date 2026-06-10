import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  addLearnerScriptToBatch,
  approveScriptBatch,
  getScriptBatch,
  listScriptModerationQueue,
  returnScriptBatch,
  ScriptError,
  startHodReview,
  submitBatchToHod,
} from "../services/scriptMarking";
import {
  exportBatchMarksCsv,
  getBatchModerationAnalytics,
  getHodModerationDashboard,
  getMarkerPerformanceAnalytics,
} from "../services/scriptModerationAnalytics";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ScriptError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[script-batches]", err);
  return res.status(500).json({ error: "Script batch operation failed" });
}

router.get(
  "/moderation-dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MODERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getHodModerationDashboard(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/moderation-queue",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MODERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const queue = await listScriptModerationQueue(req.auth!.workspaceId);
      return res.json(queue);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/analytics",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const analytics = await getBatchModerationAnalytics(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(analytics);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/marker-performance",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getMarkerPerformanceAnalytics(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/export.csv",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_EXPORT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const csv = await exportBatchMarksCsv(
        String(req.params.id),
        req.auth!.workspaceId
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="batch-${String(req.params.id).slice(0, 8)}-marks.csv"`
      );
      return res.send(csv);
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
      const batch = await getScriptBatch(String(req.params.id), req.auth!.workspaceId);
      return res.json(batch);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/scripts",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    try {
      const script = await addLearnerScriptToBatch(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          learnerId: body.learnerId,
          learner: body.learner,
          pageCount: body.pageCount != null ? Number(body.pageCount) : undefined,
        }
      );

      await logAudit({
        action: "LEARNER_SCRIPT_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          scriptId: script.id,
          batchId: String(req.params.id),
          learnerId: script.learnerId,
        },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(script);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/submit-to-hod",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_SUBMIT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const batch = await submitBatchToHod(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "SCRIPT_BATCH_SUBMITTED_TO_HOD",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { batchId: batch.id },
        ...auditRequestMeta(req),
      });

      return res.json(batch);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/review",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MODERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const batch = await startHodReview(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(batch);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const batch = await approveScriptBatch(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "SCRIPT_BATCH_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { batchId: batch.id },
        ...auditRequestMeta(req),
      });

      return res.json(batch);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/return",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_MODERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await returnScriptBatch(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        String(req.body?.comment ?? "")
      );

      await logAudit({
        action: "SCRIPT_BATCH_RETURNED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { batchId: result.batchId, comment: result.comment },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
