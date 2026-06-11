import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { getSubscriptionInfo } from "../services/subscription";

export const TRIAL_UPGRADE_MESSAGE =
  "Your free trial lets you test ScriptCheck's assessment intelligence tools. To print, export, send or publish official assessments, please upgrade to a paid plan.";

export async function requirePaidPlan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const info = await getSubscriptionInfo(req.auth!.workspaceId);

    if (info.isExpired) {
      return res.status(403).json({
        error: "Trial expired",
        code: "TRIAL_EXPIRED",
        message: "Your trial has expired. Please upgrade to continue using export and publish features.",
        daysRemaining: 0,
      });
    }

    if (info.isTrial) {
      return res.status(403).json({
        error: "Upgrade required",
        code: "TRIAL_UPGRADE_REQUIRED",
        message: TRIAL_UPGRADE_MESSAGE,
        daysRemaining: info.daysRemaining,
      });
    }

    return next();
  } catch (err) {
    console.error("[requirePaidPlan]", err);
    return res.status(500).json({ error: "Failed to verify subscription" });
  }
}
