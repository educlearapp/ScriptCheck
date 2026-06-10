import { Router, type Response } from "express";
import { ConcessionType } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  ConcessionError,
  createConcession,
  deleteConcession,
  getAssessmentConcessionAlerts,
  listConcessions,
  updateConcession,
} from "../services/concessions";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ConcessionError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[concessions]", err);
  return res.status(500).json({ error: "Concession operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.CONCESSIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const activeOnly = req.query.activeOnly === "true";
      const learnerId = req.query.learnerId
        ? String(req.query.learnerId)
        : undefined;

      const records = await listConcessions(req.auth!.workspaceId, {
        learnerId,
        activeOnly,
      });
      return res.json(records);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.CONCESSIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        learnerId,
        concessionType,
        description,
        effectiveDate,
        expiryDate,
        active,
      } = req.body as {
        learnerId: string;
        concessionType: ConcessionType;
        description?: string;
        effectiveDate: string;
        expiryDate?: string;
        active?: boolean;
      };

      if (!learnerId || !concessionType || !effectiveDate) {
        return res
          .status(400)
          .json({ error: "learnerId, concessionType and effectiveDate are required" });
      }

      const record = await createConcession(req.auth!.workspaceId, {
        learnerId,
        concessionType,
        description,
        effectiveDate,
        expiryDate,
        active,
      });

      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.CONCESSIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const record = await updateConcession(
        req.auth!.workspaceId,
        String(req.params.id),
        req.body
      );
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.CONCESSIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      await deleteConcession(req.auth!.workspaceId, String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/assessments/:assessmentId/alerts",
  requireAuth,
  requirePermission(PERMISSIONS.CONCESSIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const alerts = await getAssessmentConcessionAlerts(
        String(req.params.assessmentId),
        req.auth!.workspaceId
      );
      return res.json(alerts);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
