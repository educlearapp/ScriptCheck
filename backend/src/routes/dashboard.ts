import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { getAcademicDashboard } from "../services/academicDashboard";

const router = Router();

router.get(
  "/academic",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getAcademicDashboard(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/academic]", err);
      return res.status(500).json({ error: "Failed to load academic dashboard" });
    }
  }
);

export default router;
