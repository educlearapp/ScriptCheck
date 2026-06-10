import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { getAssessmentSchedule } from "../services/assessmentSchedule";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SCHEDULE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const now = new Date();
    const rangeStart = req.query.start
      ? new Date(String(req.query.start))
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = req.query.end
      ? new Date(String(req.query.end))
      : new Date(now.getFullYear(), now.getMonth() + 2, 0);

    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    try {
      const schedule = await getAssessmentSchedule(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        rangeStart,
        rangeEnd
      );
      return res.json(schedule);
    } catch (err) {
      console.error("[schedule]", err);
      return res.status(500).json({ error: "Failed to load assessment schedule" });
    }
  }
);

export default router;
