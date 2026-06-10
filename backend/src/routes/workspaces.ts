import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";

const router = Router();

router.get(
  "/current",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.auth!.workspaceId },
      });

      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      const membership = await prisma.workspaceMembership.findFirst({
        where: {
          userId: req.auth!.userId,
          workspaceId: workspace.id,
          isActive: true,
        },
        include: { roles: true },
      });

      return res.json({
        ...workspace,
        roles: membership?.roles.map((r) => r.role) ?? [],
      });
    } catch (err) {
      console.error("[workspaces/current]", err);
      return res.status(500).json({ error: "Failed to load workspace" });
    }
  }
);

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: req.auth!.userId, isActive: true },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            email: true,
            createdAt: true,
          },
        },
        roles: true,
      },
      orderBy: { workspace: { name: "asc" } },
    });

    return res.json(
      memberships.map((m) => ({
        ...m.workspace,
        roles: m.roles.map((r) => r.role),
        isActive: m.workspace.id === req.auth!.workspaceId,
      }))
    );
  } catch (err) {
    console.error("[workspaces]", err);
    return res.status(500).json({ error: "Failed to list workspaces" });
  }
});

router.get(
  "/audit-log",
  requireAuth,
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        where: { workspaceId: req.auth!.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
          targetUser: { select: { id: true, fullName: true, email: true } },
        },
      });
      return res.json(logs);
    } catch (err) {
      console.error("[workspaces/audit-log]", err);
      return res.status(500).json({ error: "Failed to load audit log" });
    }
  }
);

export default router;
