import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadUserAccessContext } from "../services/userAccess";
import { UserAccessContext } from "../services/permissions";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export type AuthTokenPayload = {
  userId: string;
  workspaceId: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthTokenPayload;
  access?: UserAccessContext;
};

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.auth = payload;

    const access = await loadUserAccessContext(payload.userId);
    if (!access) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    const isMember = access.memberships.some(
      (m) => m.workspaceId === payload.workspaceId
    );
    if (!isMember) {
      return res.status(403).json({ error: "Not a member of the active workspace" });
    }

    req.access = access;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
