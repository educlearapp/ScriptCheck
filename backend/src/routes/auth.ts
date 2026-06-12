import { Router } from "express";
import { WorkspaceType } from "@prisma/client";
import { getSubscriptionInfo, parseRegistrationPlan } from "../services/subscription";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  compareAuthPassword,
  hashAuthPassword,
  normalizeAuthEmail,
} from "../services/authCredentials";
import {
  requireAuth,
  signAuthToken,
  AuthenticatedRequest,
} from "../middleware/auth";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import { loadUserAccessContext } from "../services/userAccess";
import {
  getEffectivePermissions,
  WORKSPACE_ROLE_LABELS,
} from "../services/permissions";
import { resolveIsSuperAdmin } from "../services/superAdminAccess";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function buildAuthResponse(userId: string, workspaceId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { isActive: true },
        include: {
          workspace: true,
          roles: true,
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  const activeMembership = user.memberships.find(
    (m) => m.workspaceId === workspaceId
  );
  if (!activeMembership) throw new Error("Workspace membership not found");

  const access = await loadUserAccessContext(userId);
  const permissions = access
    ? getEffectivePermissions(access, workspaceId)
    : [];

  const token = signAuthToken({
    userId: user.id,
    workspaceId,
    email: user.email,
  });

  const subscription = await getSubscriptionInfo(workspaceId);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: resolveIsSuperAdmin(user),
      workspaceId: activeMembership.workspaceId,
      workspaceName: activeMembership.workspace.name,
      workspaceType: activeMembership.workspace.type,
      subscriptionPlan: activeMembership.workspace.subscriptionPlan,
      subscriptionStatus: subscription.status,
      trialExpiresAt: subscription.trialExpiresAt,
      isTrial: subscription.isTrial,
      isExpired: subscription.isExpired,
      daysRemaining: subscription.daysRemaining,
      roles: activeMembership.roles.map((r) => r.role),
      permissions,
    },
    workspaces: user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      type: m.workspace.type,
      subscriptionPlan: m.workspace.subscriptionPlan,
      roles: m.roles.map((r) => r.role),
    })),
  };
}

router.post("/register", async (req, res) => {
  const email = normalizeAuthEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");
  const fullName = String(req.body?.fullName || "").trim();
  const workspaceName = String(req.body?.workspaceName || "").trim();
  const workspaceType = String(
    req.body?.workspaceType || WorkspaceType.INDIVIDUAL_EDUCATOR
  ) as WorkspaceType;
  const subscriptionPlan = parseRegistrationPlan(req.body?.plan);

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: "Email, password, and full name required" });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  if (!Object.values(WorkspaceType).includes(workspaceType)) {
    return res.status(400).json({ error: "Invalid workspace type" });
  }

  const name = workspaceName || `${fullName}'s Workspace`;
  const baseSlug = slugify(name) || "workspace";

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashAuthPassword(password);
    const meta = auditRequestMeta(req);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, fullName },
      });

      let slug = baseSlug;
      let attempt = 0;
      while (await tx.workspace.findUnique({ where: { slug } })) {
        attempt += 1;
        slug = `${baseSlug}-${attempt}`;
      }

      const trialExpiresAt =
        subscriptionPlan === "TRIAL"
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          : null;

      const workspace = await tx.workspace.create({
        data: {
          name,
          slug,
          type: workspaceType,
          subscriptionPlan,
          subscriptionStatus:
            subscriptionPlan === "TRIAL"
              ? SubscriptionStatus.TRIAL
              : SubscriptionStatus.ACTIVE,
          trialExpiresAt,
          email,
        },
      });

      const membership = await tx.workspaceMembership.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          joinedAt: new Date(),
        },
      });

      const initialRole =
        workspaceType === WorkspaceType.EXAMINATION_BODY
          ? "EXAMINATION_BODY"
          : workspaceType === WorkspaceType.SCHOOL
            ? "SCHOOL_OWNER"
            : "TEACHER";

      await tx.membershipRole.create({
        data: {
          membershipId: membership.id,
          role: initialRole,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "USER_REGISTERED",
          actorId: user.id,
          targetUserId: user.id,
          metadata: { email, fullName },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "WORKSPACE_CREATED",
          actorId: user.id,
          workspaceId: workspace.id,
          metadata: { name, type: workspaceType, slug, subscriptionPlan },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ROLE_ASSIGNED",
          actorId: user.id,
          workspaceId: workspace.id,
          targetUserId: user.id,
          metadata: { role: initialRole },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });

      return { userId: user.id, workspaceId: workspace.id };
    });

    const response = await buildAuthResponse(result.userId, result.workspaceId);

    await logAudit({
      action: "LOGIN",
      actorId: result.userId,
      workspaceId: result.workspaceId,
      metadata: { method: "register" },
      ...meta,
    });

    return res.status(201).json(response);
  } catch (err) {
    console.error("[auth/register]", err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const email = normalizeAuthEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");
  const requestedWorkspaceId = req.body?.workspaceId
    ? String(req.body.workspaceId)
    : undefined;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        isActive: true,
      },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await compareAuthPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (user.memberships.length === 0) {
      return res.status(403).json({ error: "No workspace memberships found" });
    }

    const workspaceId =
      requestedWorkspaceId &&
      user.memberships.some((m) => m.workspaceId === requestedWorkspaceId)
        ? requestedWorkspaceId
        : user.memberships[0].workspaceId;

    const response = await buildAuthResponse(user.id, workspaceId);

    await logAudit({
      action: "LOGIN",
      actorId: user.id,
      workspaceId,
      ...auditRequestMeta(req),
    });

    return res.json(response);
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await logAudit({
      action: "LOGOUT",
      actorId: req.auth!.userId,
      workspaceId: req.auth!.workspaceId,
      ...auditRequestMeta(req),
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auth/logout]", err);
    return res.status(500).json({ error: "Logout failed" });
  }
});

router.post("/switch-workspace", requireAuth, async (req: AuthenticatedRequest, res) => {
  const workspaceId = String(req.body?.workspaceId || "");

  if (!workspaceId) {
    return res.status(400).json({ error: "workspaceId required" });
  }

  const isMember = req.access!.memberships.some(
    (m) => m.workspaceId === workspaceId
  );
  if (!isMember) {
    return res.status(403).json({ error: "Not a member of this workspace" });
  }

  try {
    const response = await buildAuthResponse(req.auth!.userId, workspaceId);
    return res.json(response);
  } catch (err) {
    console.error("[auth/switch-workspace]", err);
    return res.status(500).json({ error: "Failed to switch workspace" });
  }
});

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const response = await buildAuthResponse(
      req.auth!.userId,
      req.auth!.workspaceId
    );
    return res.json(response.user);
  } catch (err) {
    console.error("[auth/me]", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

router.get("/role-labels", (_req, res) => {
  return res.json(WORKSPACE_ROLE_LABELS);
});

export default router;
