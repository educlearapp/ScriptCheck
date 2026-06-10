import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  listMarksForAssessment,
  listMarksForLearner,
} from "../services/markCapture";

const router = Router();

router.get(
  "/assessments/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const marks = await listMarksForAssessment(
        req.auth!.workspaceId,
        String(req.params.assessmentId)
      );
      return res.json(marks);
    } catch (err) {
      console.error("[mark-capture/assessment]", err);
      return res.status(500).json({ error: "Failed to load captured marks" });
    }
  }
);

router.get(
  "/learners/:learnerId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const marks = await listMarksForLearner(
        req.auth!.workspaceId,
        String(req.params.learnerId)
      );
      return res.json(marks);
    } catch (err) {
      console.error("[mark-capture/learner]", err);
      return res.status(500).json({ error: "Failed to load learner mark history" });
    }
  }
);

export default router;
