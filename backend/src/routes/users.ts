import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS, getRolesForWorkspaceType } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import { hashAuthPassword, normalizeAuthEmail } from "../services/authCredentials";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const memberships = await prisma.workspaceMembership.findMany({
        where: { workspaceId: req.auth!.workspaceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              isActive: true,
              createdAt: true,
            },
          },
          roles: true,
        },
        orderBy: { user: { fullName: "asc" } },
      });

      return res.json(
        memberships.map((m) => ({
          membershipId: m.id,
          ...m.user,
          roles: m.roles.map((r) => r.role),
          membershipActive: m.isActive,
          joinedAt: m.joinedAt,
        }))
      );
    } catch (err) {
      console.error("[users]", err);
      return res.status(500).json({ error: "Failed to list users" });
    }
  }
);

router.get("/roles", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.auth!.workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const roles = getRolesForWorkspaceType(workspace.type);
    return res.json(roles);
  } catch (err) {
    console.error("[users/roles]", err);
    return res.status(500).json({ error: "Failed to list roles" });
  }
});

router.post(
  "/invite",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_INVITE),
  async (req: AuthenticatedRequest, res) => {
    const email = normalizeAuthEmail(String(req.body?.email || ""));
    const fullName = String(req.body?.fullName || "").trim();
    const roles = (req.body?.roles ?? []) as WorkspaceRole[];
    const tempPassword = String(req.body?.tempPassword || "ScriptCheck2026!");

    if (!email || !fullName) {
      return res.status(400).json({ error: "Email and full name required" });
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: "At least one role required" });
    }

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.auth!.workspaceId },
      });
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      const allowedRoles = getRolesForWorkspaceType(workspace.type);
      for (const role of roles) {
        if (!allowedRoles.includes(role)) {
          return res.status(400).json({ error: `Role ${role} not allowed for this workspace type` });
        }
      }

      const meta = auditRequestMeta(req);
      const passwordHash = await hashAuthPassword(tempPassword);

      const result = await prisma.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { email } });

        if (!user) {
          user = await tx.user.create({
            data: { email, fullName, passwordHash },
          });
        }

        let membership = await tx.workspaceMembership.findUnique({
          where: {
            userId_workspaceId: {
              userId: user.id,
              workspaceId: workspace.id,
            },
          },
        });

        if (membership) {
          membership = await tx.workspaceMembership.update({
            where: { id: membership.id },
            data: { isActive: true, invitedAt: new Date() },
          });
        } else {
          membership = await tx.workspaceMembership.create({
            data: {
              userId: user.id,
              workspaceId: workspace.id,
              invitedAt: new Date(),
            },
          });
        }

        for (const role of roles) {
          await tx.membershipRole.upsert({
            where: {
              membershipId_role: { membershipId: membership.id, role },
            },
            update: {},
            create: { membershipId: membership.id, role },
          });
        }

        return { user, membership };
      });

      await logAudit({
        action: "USER_INVITED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        targetUserId: result.user.id,
        metadata: { email, fullName, roles },
        ...meta,
      });

      for (const role of roles) {
        await logAudit({
          action: "ROLE_ASSIGNED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          targetUserId: result.user.id,
          metadata: { role },
          ...meta,
        });
      }

      return res.status(201).json({
        membershipId: result.membership.id,
        userId: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        roles,
      });
    } catch (err) {
      console.error("[users/invite]", err);
      return res.status(500).json({ error: "Failed to invite user" });
    }
  }
);

router.post(
  "/:membershipId/roles",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  async (req: AuthenticatedRequest, res) => {
    const membershipId = String(req.params.membershipId);
    const role = req.body?.role as WorkspaceRole;

    if (!role || !Object.values(WorkspaceRole).includes(role)) {
      return res.status(400).json({ error: "Valid role required" });
    }

    try {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { id: membershipId, workspaceId: req.auth!.workspaceId },
        include: { workspace: true },
      });

      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      const allowedRoles = getRolesForWorkspaceType(membership.workspace.type);
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: `Role ${role} not allowed for this workspace type` });
      }

      await prisma.membershipRole.upsert({
        where: { membershipId_role: { membershipId, role } },
        update: {},
        create: { membershipId, role },
      });

      await logAudit({
        action: "ROLE_ASSIGNED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        targetUserId: membership.userId,
        metadata: { role },
        ...auditRequestMeta(req),
      });

      const updated = await prisma.workspaceMembership.findUnique({
        where: { id: membershipId },
        include: { roles: true },
      });

      return res.json({
        membershipId,
        roles: updated?.roles.map((r) => r.role) ?? [],
      });
    } catch (err) {
      console.error("[users/roles assign]", err);
      return res.status(500).json({ error: "Failed to assign role" });
    }
  }
);

router.delete(
  "/:membershipId/roles/:role",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  async (req: AuthenticatedRequest, res) => {
    const membershipId = String(req.params.membershipId);
    const role = String(req.params.role) as WorkspaceRole;

    try {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { id: membershipId, workspaceId: req.auth!.workspaceId },
      });

      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      await prisma.membershipRole.deleteMany({
        where: { membershipId, role },
      });

      await logAudit({
        action: "ROLE_REMOVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        targetUserId: membership.userId,
        metadata: { role },
        ...auditRequestMeta(req),
      });

      const updated = await prisma.workspaceMembership.findUnique({
        where: { id: membershipId },
        include: { roles: true },
      });

      return res.json({
        membershipId,
        roles: updated?.roles.map((r) => r.role) ?? [],
      });
    } catch (err) {
      console.error("[users/roles remove]", err);
      return res.status(500).json({ error: "Failed to remove role" });
    }
  }
);

export default router;
