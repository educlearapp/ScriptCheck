import jwt from "jsonwebtoken";
import { PortalUserType } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export type PortalTokenPayload = {
  kind: "portal";
  portalAccountId: string;
  workspaceId: string;
  portalType: PortalUserType;
  learnerIds: string[];
  email?: string;
  fullName?: string;
};

export function signPortalToken(payload: Omit<PortalTokenPayload, "kind">): string {
  return jwt.sign({ ...payload, kind: "portal" as const }, JWT_SECRET, {
    expiresIn: "24h",
  });
}

export function verifyPortalToken(token: string): PortalTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as PortalTokenPayload;
  if (payload.kind !== "portal") {
    throw new Error("Invalid portal token");
  }
  return payload;
}

export type PortalSession = PortalTokenPayload;
