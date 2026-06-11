import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  addModerationComment,
  createApprovalRequest,
  getModerationTrail,
  ModerationTrailError,
  respondToApprovalRequest,
  resolveModerationComment,
} from "../services/moderation/moderationTrail";
import { listMarkAdjustments } from "../services/marking/markAudit";

const router = Router();

router.get(
  "/assessments/:id/trail",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_QUEUE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const trail = await getModerationTrail(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(trail);
    } catch (err) {
      if (err instanceof ModerationTrailError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[moderation/trail]", err);
      return res.status(500).json({ error: "Failed to load moderation trail" });
    }
  }
);

router.post(
  "/assessments/:id/comments",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_COMMENT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const comment = await addModerationComment({
        assessmentId: String(req.params.id),
        workspaceId: req.auth!.workspaceId,
        authorId: req.auth!.userId,
        body: String(req.body?.body || ""),
        type: req.body?.type,
        parentId: req.body?.parentId,
      });
      return res.status(201).json(comment);
    } catch (err) {
      if (err instanceof ModerationTrailError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[moderation/comments]", err);
      return res.status(500).json({ error: "Failed to add comment" });
    }
  }
);

router.post(
  "/comments/:commentId/resolve",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const comment = await resolveModerationComment(
        String(req.params.commentId),
        req.auth!.workspaceId
      );
      return res.json(comment);
    } catch (err) {
      if (err instanceof ModerationTrailError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[moderation/resolve]", err);
      return res.status(500).json({ error: "Failed to resolve comment" });
    }
  }
);

router.post(
  "/assessments/:id/approval-requests",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_REQUEST_APPROVAL),
  async (req: AuthenticatedRequest, res) => {
    try {
      const request = await createApprovalRequest({
        assessmentId: String(req.params.id),
        workspaceId: req.auth!.workspaceId,
        requestedById: req.auth!.userId,
        assignedRole: req.body?.assignedRole,
        comment: req.body?.comment,
      });
      return res.status(201).json(request);
    } catch (err) {
      if (err instanceof ModerationTrailError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[moderation/approval-request]", err);
      return res.status(500).json({ error: "Failed to create approval request" });
    }
  }
);

router.post(
  "/approval-requests/:requestId/respond",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await respondToApprovalRequest({
        requestId: String(req.params.requestId),
        workspaceId: req.auth!.workspaceId,
        respondedById: req.auth!.userId,
        status: req.body?.status,
        comment: req.body?.comment,
      });
      return res.json(result);
    } catch (err) {
      if (err instanceof ModerationTrailError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[moderation/respond]", err);
      return res.status(500).json({ error: "Failed to respond to approval request" });
    }
  }
);

router.get(
  "/assessments/:id/mark-audit",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_AUDIT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const audits = await listMarkAdjustments(
        String(req.params.id),
        req.auth!.workspaceId,
        { learnerScriptId: req.query.scriptId as string | undefined }
      );
      return res.json({ audits });
    } catch (err) {
      console.error("[moderation/mark-audit]", err);
      return res.status(500).json({ error: "Failed to load mark audit trail" });
    }
  }
);

export default router;
