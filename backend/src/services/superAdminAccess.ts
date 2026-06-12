import { prisma } from "../prisma";

/** Comma-separated platform admin emails (bootstrap without DB flag). */
export function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveIsSuperAdmin(user: {
  email: string;
  isSuperAdmin: boolean;
}): boolean {
  if (user.isSuperAdmin) return true;
  return getSuperAdminEmails().includes(user.email.toLowerCase());
}

export async function userHasSuperAdminAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isSuperAdmin: true, isActive: true },
  });

  if (!user?.isActive) return false;
  return resolveIsSuperAdmin(user);
}
