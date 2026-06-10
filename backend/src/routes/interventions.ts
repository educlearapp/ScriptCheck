import { Router, type Response } from "express";
import { InterventionStatus } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  createIntervention,
  getIntervention,
  InterventionError,
  listInterventions,
  updateIntervention,
} from "../services/learnerInterventions";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof InterventionError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[interventions]", err);
  return res.status(500).json({ error: "Intervention request failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.query.status
        ? (String(req.query.status) as InterventionStatus)
        : undefined;
      const learnerId = req.query.learnerId ? String(req.query.learnerId) : undefined;
      const data = await listInterventions(req.auth!.workspaceId, { status, learnerId });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getIntervention(req.auth!.workspaceId, String(req.params.id));
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createIntervention(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await updateIntervention(
        req.auth!.workspaceId,
        String(req.params.id),
        req.auth!.userId,
        req.body
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
