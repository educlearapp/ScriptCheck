import { Response, NextFunction } from "express";
import { WorkspaceRole } from "@prisma/client";
import { AuthenticatedRequest } from "./auth";
import {
  requireAnyRole,
  requirePermission,
} from "./requirePermission";

export { requirePermission, requireAnyRole };

/** @deprecated Use requirePermission or requireAnyRole instead */
export function requireRole(...roles: WorkspaceRole[]) {
  return requireAnyRole(...roles);
}

export function requireAuthOnly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}
