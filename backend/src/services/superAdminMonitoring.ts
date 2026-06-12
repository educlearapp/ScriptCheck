import {
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
  WorkspaceRole,
} from "@prisma/client";
import { prisma } from "../prisma";

export type SuperAdminOverview = {
  totalWorkspaces: number;
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  expiredTrials: number;
  recentLogins: Array<{
    userId: string;
    fullName: string;
    email: string;
    lastLoginAt: string;
  }>;
};

export type SuperAdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  trialExpiresAt: string | null;
  userCount: number;
  isActive: boolean;
  createdAt: string;
};

export type SuperAdminUserRow = {
  id: string;
  fullName: string;
  email: string;
  roles: WorkspaceRole[];
  workspaces: Array<{ id: string; name: string }>;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

function workspaceIsActive(
  status: SubscriptionStatus,
  plan: SubscriptionPlan,
  trialExpiresAt: Date | null
): boolean {
  if (status === SubscriptionStatus.SUSPENDED) return false;
  if (status === SubscriptionStatus.EXPIRED) return false;
  if (
    plan === SubscriptionPlan.TRIAL &&
    trialExpiresAt &&
    trialExpiresAt.getTime() < Date.now()
  ) {
    return false;
  }
  return true;
}

export async function getSuperAdminOverview(): Promise<SuperAdminOverview> {
  const now = new Date();

  const [
    totalWorkspaces,
    totalUsers,
    activeUsers,
    trialUsers,
    expiredTrials,
    recentLogins,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({
      where: {
        memberships: {
          some: {
            isActive: true,
            workspace: {
              subscriptionPlan: SubscriptionPlan.TRIAL,
              subscriptionStatus: { not: SubscriptionStatus.EXPIRED },
            },
          },
        },
      },
    }),
    prisma.workspace.count({
      where: {
        OR: [
          { subscriptionStatus: SubscriptionStatus.EXPIRED },
          {
            subscriptionPlan: SubscriptionPlan.TRIAL,
            trialExpiresAt: { lt: now },
          },
        ],
      },
    }),
    prisma.user.findMany({
      where: { lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: "desc" },
      take: 10,
      select: {
        id: true,
        fullName: true,
        email: true,
        lastLoginAt: true,
      },
    }),
  ]);

  return {
    totalWorkspaces,
    totalUsers,
    activeUsers,
    trialUsers,
    expiredTrials,
    recentLogins: recentLogins.map((u) => ({
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      lastLoginAt: u.lastLoginAt!.toISOString(),
    })),
  };
}

export async function listSuperAdminWorkspaces(filters: {
  search?: string;
  trialStatus?: string;
  active?: string;
}): Promise<SuperAdminWorkspaceRow[]> {
  const where: Prisma.WorkspaceWhereInput = {};

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const trialStatus = filters.trialStatus?.toLowerCase();
  if (trialStatus === "trial") {
    where.subscriptionPlan = SubscriptionPlan.TRIAL;
    where.subscriptionStatus = { not: SubscriptionStatus.EXPIRED };
  } else if (trialStatus === "expired") {
    where.OR = [
      { subscriptionStatus: SubscriptionStatus.EXPIRED },
      {
        subscriptionPlan: SubscriptionPlan.TRIAL,
        trialExpiresAt: { lt: new Date() },
      },
    ];
  } else if (trialStatus === "paid") {
    where.subscriptionPlan = SubscriptionPlan.PAID;
  }

  const workspaces = await prisma.workspace.findMany({
    where,
    include: {
      memberships: {
        where: { isActive: true },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  let rows = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    type: w.type,
    subscriptionPlan: w.subscriptionPlan,
    subscriptionStatus: w.subscriptionStatus,
    trialExpiresAt: w.trialExpiresAt?.toISOString() ?? null,
    userCount: w.memberships.length,
    isActive: workspaceIsActive(
      w.subscriptionStatus,
      w.subscriptionPlan,
      w.trialExpiresAt
    ),
    createdAt: w.createdAt.toISOString(),
  }));

  const activeFilter = filters.active?.toLowerCase();
  if (activeFilter === "true" || activeFilter === "active") {
    rows = rows.filter((r) => r.isActive);
  } else if (activeFilter === "false" || activeFilter === "inactive") {
    rows = rows.filter((r) => !r.isActive);
  }

  return rows;
}

export async function listSuperAdminUsers(filters: {
  search?: string;
  workspaceSearch?: string;
  role?: string;
  active?: string;
  trialStatus?: string;
}): Promise<SuperAdminUserRow[]> {
  const where: Prisma.UserWhereInput = {};

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
    ];
  }

  const activeFilter = filters.active?.toLowerCase();
  if (activeFilter === "true" || activeFilter === "active") {
    where.isActive = true;
  } else if (activeFilter === "false" || activeFilter === "inactive") {
    where.isActive = false;
  }

  if (filters.workspaceSearch?.trim()) {
    const q = filters.workspaceSearch.trim();
    where.memberships = {
      some: {
        workspace: { name: { contains: q, mode: "insensitive" } },
      },
    };
  }

  if (filters.role?.trim()) {
    const role = filters.role.trim().toUpperCase() as WorkspaceRole;
    if (Object.values(WorkspaceRole).includes(role)) {
      where.memberships = {
        some: {
          roles: { some: { role } },
        },
      };
    }
  }

  const trialStatus = filters.trialStatus?.toLowerCase();
  if (trialStatus === "trial") {
    where.memberships = {
      some: {
        isActive: true,
        workspace: {
          subscriptionPlan: SubscriptionPlan.TRIAL,
          subscriptionStatus: { not: SubscriptionStatus.EXPIRED },
        },
      },
    };
  } else if (trialStatus === "expired") {
    where.memberships = {
      some: {
        workspace: {
          OR: [
            { subscriptionStatus: SubscriptionStatus.EXPIRED },
            {
              subscriptionPlan: SubscriptionPlan.TRIAL,
              trialExpiresAt: { lt: new Date() },
            },
          ],
        },
      },
    };
  } else if (trialStatus === "paid") {
    where.memberships = {
      some: {
        workspace: { subscriptionPlan: SubscriptionPlan.PAID },
      },
    };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      memberships: {
        where: { isActive: true },
        include: {
          workspace: { select: { id: true, name: true } },
          roles: { select: { role: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  return users.map((u) => {
    const roles = [
      ...new Set(
        u.memberships.flatMap((m) => m.roles.map((r) => r.role))
      ),
    ];
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      roles,
      workspaces: u.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
      })),
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  });
}
