import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import { PortalSession, verifyPortalToken } from "../services/portalToken";

export class PortalError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "PortalError";
  }
}

export type PortalRequest = Request & {
  portal?: PortalSession;
};

export async function requirePortalAuth(
  req: PortalRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    await logAudit({
      action: "PORTAL_ACCESS_DENIED",
      metadata: { reason: "missing_token", path: req.path },
      ...auditRequestMeta(req),
    });
    return res.status(401).json({ error: "Portal authentication required" });
  }

  try {
    const payload = verifyPortalToken(token);

    const account = await prisma.portalAccount.findFirst({
      where: {
        id: payload.portalAccountId,
        workspaceId: payload.workspaceId,
        isActive: true,
      },
    });

    if (!account) {
      await logAudit({
        action: "PORTAL_ACCESS_DENIED",
        workspaceId: payload.workspaceId,
        metadata: { reason: "account_inactive", portalAccountId: payload.portalAccountId },
        ...auditRequestMeta(req),
      });
      return res.status(401).json({ error: "Portal account not found or inactive" });
    }

    req.portal = payload;
    return next();
  } catch {
    await logAudit({
      action: "PORTAL_ACCESS_DENIED",
      metadata: { reason: "invalid_token", path: req.path },
      ...auditRequestMeta(req),
    });
    return res.status(401).json({ error: "Invalid or expired portal session" });
  }
}

export function assertLearnerAccess(
  session: PortalSession,
  learnerId: string,
  req?: Request
): void {
  if (!session.learnerIds.includes(learnerId)) {
    logAudit({
      action: "PORTAL_ACCESS_DENIED",
      workspaceId: session.workspaceId,
      metadata: {
        reason: "learner_not_linked",
        portalAccountId: session.portalAccountId,
        requestedLearnerId: learnerId,
        path: req?.path,
      },
      ...(req ? auditRequestMeta(req) : {}),
    }).catch(() => undefined);
    throw new PortalError("You do not have access to this learner", 403);
  }
}
