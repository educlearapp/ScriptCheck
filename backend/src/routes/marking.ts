import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { getMarkingOverview } from "../services/markingOverview";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getMarkingOverview(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[marking/overview]", err);
      return res.status(500).json({ error: "Failed to load marking overview" });
    }
  }
);

export default router;
