import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  generateIntelligenceReport,
  getIntelligenceReport,
  IntelligenceError,
} from "../services/intelligence/assessmentIntelligence";

const router = Router();

router.get(
  "/assessments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INTELLIGENCE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const report = await getIntelligenceReport(
        String(req.params.id),
        req.auth!.workspaceId
      );
      if (!report) {
        return res.status(404).json({ error: "Intelligence report not yet generated" });
      }
      return res.json(report);
    } catch (err) {
      if (err instanceof IntelligenceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[intelligence/get]", err);
      return res.status(500).json({ error: "Failed to load intelligence report" });
    }
  }
);

router.post(
  "/assessments/:id/generate",
  requireAuth,
  requirePermission(PERMISSIONS.INTELLIGENCE_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const report = await generateIntelligenceReport(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json(report);
    } catch (err) {
      if (err instanceof IntelligenceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[intelligence/generate]", err);
      return res.status(500).json({ error: "Failed to generate intelligence report" });
    }
  }
);

export default router;
