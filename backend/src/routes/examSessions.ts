import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  createExamSession,
  endExamDeviceSession,
  endExamSession,
  getExamSession,
  registerExamDevice,
} from "../services/examSession";
import { ScriptError } from "../services/scriptMarking";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ScriptError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[exam-sessions]", err);
  return res.status(500).json({ error: "Exam session operation failed" });
}

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.EXAM_SESSION_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const session = await createExamSession(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.body ?? {}
      );

      await logAudit({
        action: "EXAM_SESSION_STARTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { examSessionId: session.id, title: session.title },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(session);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXAM_SESSION_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const session = await getExamSession(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(session);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/register-device",
  requireAuth,
  requirePermission(PERMISSIONS.EXAM_SESSION_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);
    try {
      const device = await registerExamDevice(
        String(req.params.id),
        req.auth!.workspaceId,
        {
          learnerId: String(req.body?.learnerId ?? ""),
          deviceId: String(req.body?.deviceId ?? ""),
          deviceLabel: req.body?.deviceLabel,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
        }
      );

      await logAudit({
        action: "EXAM_DEVICE_REGISTERED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          examSessionId: String(req.params.id),
          learnerId: device.learnerId,
          deviceId: device.deviceId,
        },
        ...meta,
      });

      return res.status(201).json(device);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/end-device",
  requireAuth,
  requirePermission(PERMISSIONS.EXAM_SESSION_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const device = await endExamDeviceSession(
        String(req.params.id),
        req.auth!.workspaceId,
        {
          learnerId: String(req.body?.learnerId ?? ""),
          deviceId: String(req.body?.deviceId ?? ""),
        }
      );

      await logAudit({
        action: "EXAM_DEVICE_SESSION_ENDED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          examSessionId: String(req.params.id),
          deviceSessionId: device.id,
        },
        ...auditRequestMeta(req),
      });

      return res.json(device);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/end",
  requireAuth,
  requirePermission(PERMISSIONS.EXAM_SESSION_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const session = await endExamSession(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(session);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
