import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  downgradeSubscription,
  getSubscriptionInfo,
  upgradeSubscription,
} from "../services/subscription";

const router = Router();

router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const info = await getSubscriptionInfo(req.auth!.workspaceId);
      return res.json(info);
    } catch (err) {
      console.error("[subscription/get]", err);
      return res.status(500).json({ error: "Failed to load subscription info" });
    }
  }
);

router.post(
  "/upgrade",
  requireAuth,
  requirePermission(PERMISSIONS.SUBSCRIPTION_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const info = await upgradeSubscription(
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json(info);
    } catch (err) {
      console.error("[subscription/upgrade]", err);
      return res.status(500).json({ error: "Failed to upgrade subscription" });
    }
  }
);

router.post(
  "/downgrade",
  requireAuth,
  requirePermission(PERMISSIONS.SUBSCRIPTION_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const info = await downgradeSubscription(
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json(info);
    } catch (err) {
      console.error("[subscription/downgrade]", err);
      return res.status(500).json({ error: "Failed to downgrade subscription" });
    }
  }
);

export default router;
