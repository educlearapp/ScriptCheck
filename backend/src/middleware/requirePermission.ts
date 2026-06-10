import { Response, NextFunction } from "express";
import { WorkspaceRole } from "@prisma/client";
import { AuthenticatedRequest } from "./auth";
import { hasAnyRole, hasPermission, Permission } from "../services/permissions";

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !req.access) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const allowed = permissions.some((permission) =>
      hasPermission(req.access!, req.auth!.workspaceId, permission)
    );

    if (!allowed) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}

export function requireAnyRole(...roles: WorkspaceRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !req.access) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!hasAnyRole(req.access, req.auth.workspaceId, roles)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}
