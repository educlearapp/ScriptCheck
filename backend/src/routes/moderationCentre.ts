import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { getModerationCentre } from "../services/moderationCentre";
import { generateModerationVarianceReport } from "../services/moderationVariance";
import { getDhModerationOverview } from "../services/moderationOverview";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_QUEUE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getModerationCentre(req.auth!.workspaceId, req.auth!.userId);
      return res.json(data);
    } catch (err) {
      console.error("[moderation-centre]", err);
      return res.status(500).json({ error: "Failed to load moderation centre" });
    }
  }
);

router.get(
  "/dh-overview",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_QUEUE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getDhModerationOverview(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      console.error("[moderation/dh-overview]", err);
      return res.status(500).json({ error: "Failed to load DH moderation overview" });
    }
  }
);

router.get(
  "/variance",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_QUEUE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await generateModerationVarianceReport(
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json(data);
    } catch (err) {
      console.error("[moderation-variance]", err);
      return res.status(500).json({ error: "Failed to generate variance report" });
    }
  }
);

export default router;
