import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { userHasSuperAdminAccess } from "../services/superAdminAccess";

export async function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const allowed = await userHasSuperAdminAccess(req.auth.userId);
    if (!allowed) {
      return res.status(403).json({ error: "Super admin access required" });
    }
    return next();
  } catch (err) {
    console.error("[requireSuperAdmin]", err);
    return res.status(500).json({ error: "Failed to verify super admin access" });
  }
}
