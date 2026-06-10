import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { ResultsError } from "../services/assessmentResults";
import { getPublishedResultsView } from "../services/publishedResults";
import { PERMISSIONS } from "../services/permissions";

const router = Router();

router.get(
  "/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getPublishedResultsView(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      if (err instanceof ResultsError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[published-results]", err);
      return res.status(500).json({ error: "Failed to load published results" });
    }
  }
);

export default router;
