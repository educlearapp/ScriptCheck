import { WorkspaceRole } from "@prisma/client";
import { prisma } from "../prisma";
import { UserAccessContext } from "./permissions";

export async function loadUserAccessContext(
  userId: string
): Promise<UserAccessContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    include: {
      memberships: {
        where: { isActive: true },
        include: { roles: true },
      },
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    memberships: user.memberships.map((m) => ({
      workspaceId: m.workspaceId,
      roles: m.roles.map((r) => r.role),
    })),
  };
}

export async function loadMembershipForWorkspace(
  userId: string,
  workspaceId: string
) {
  return prisma.workspaceMembership.findFirst({
    where: { userId, workspaceId, isActive: true },
    include: {
      roles: true,
      workspace: true,
      user: {
        select: { id: true, email: true, fullName: true, isActive: true },
      },
    },
  });
}

export async function getUserWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}

export async function assertWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole[]> {
  const membership = await loadMembershipForWorkspace(userId, workspaceId);
  if (!membership) {
    throw new Error("Not a member of this workspace");
  }
  return membership.roles.map((r) => r.role);
}
