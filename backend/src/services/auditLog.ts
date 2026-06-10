import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export type AuditLogInput = {
  action: AuditAction;
  actorId?: string;
  workspaceId?: string;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function logAudit(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? null,
      workspaceId: input.workspaceId ?? null,
      targetUserId: input.targetUserId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export function auditRequestMeta(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;

  const userAgent =
    typeof req.headers?.["user-agent"] === "string"
      ? req.headers["user-agent"]
      : undefined;

  return { ipAddress: ip, userAgent };
}
