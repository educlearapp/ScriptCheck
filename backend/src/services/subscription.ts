import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";

const TRIAL_DURATION_DAYS = 14;

export type SubscriptionInfo = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialExpiresAt: string | null;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  canExport: boolean;
  canPublish: boolean;
  watermarkRequired: boolean;
};

export async function isTrialWorkspace(workspaceId: string): Promise<boolean> {
  const info = await getSubscriptionInfo(workspaceId);
  return info.isTrial;
}

export function parseRegistrationPlan(value: unknown): SubscriptionPlan {
  return value === "trial" ? SubscriptionPlan.TRIAL : SubscriptionPlan.PAID;
}

function computeDaysRemaining(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const diff = expiresAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function getSubscriptionInfo(
  workspaceId: string
): Promise<SubscriptionInfo> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialExpiresAt: true,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  let status = workspace.subscriptionStatus;
  let trialExpiresAt = workspace.trialExpiresAt;

  if (
    workspace.subscriptionPlan === SubscriptionPlan.TRIAL &&
    !trialExpiresAt
  ) {
    trialExpiresAt = new Date(
      Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
    );
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { trialExpiresAt, subscriptionStatus: SubscriptionStatus.TRIAL },
    });
    status = SubscriptionStatus.TRIAL;
  }

  const isExpired =
    workspace.subscriptionPlan === SubscriptionPlan.TRIAL &&
    trialExpiresAt != null &&
    trialExpiresAt.getTime() < Date.now();

  if (isExpired && status !== SubscriptionStatus.EXPIRED) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
    });
    status = SubscriptionStatus.EXPIRED;
  }

  const isTrial =
    workspace.subscriptionPlan === SubscriptionPlan.TRIAL && !isExpired;

  return {
    plan: workspace.subscriptionPlan,
    status,
    trialExpiresAt: trialExpiresAt?.toISOString() ?? null,
    isTrial,
    isExpired,
    daysRemaining: isTrial ? computeDaysRemaining(trialExpiresAt) : null,
    canExport: !isTrial && !isExpired,
    canPublish: !isTrial && !isExpired,
    watermarkRequired: isTrial,
  };
}

export async function upgradeSubscription(
  workspaceId: string,
  actorId: string
): Promise<SubscriptionInfo> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      subscriptionPlan: SubscriptionPlan.PAID,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      trialExpiresAt: null,
    },
  });

  await logAudit({
    action: "SUBSCRIPTION_UPGRADED",
    workspaceId,
    actorId,
    metadata: { plan: "PAID" },
  });

  return getSubscriptionInfo(workspaceId);
}

export async function downgradeSubscription(
  workspaceId: string,
  actorId: string
): Promise<SubscriptionInfo> {
  const trialExpiresAt = new Date(
    Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      subscriptionPlan: SubscriptionPlan.TRIAL,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      trialExpiresAt,
    },
  });

  await logAudit({
    action: "SUBSCRIPTION_DOWNGRADED",
    workspaceId,
    actorId,
    metadata: { plan: "TRIAL" },
  });

  return getSubscriptionInfo(workspaceId);
}

export async function assertSubscriptionAllows(
  workspaceId: string,
  action: "export" | "publish"
): Promise<void> {
  const info = await getSubscriptionInfo(workspaceId);

  if (info.isExpired) {
    throw new SubscriptionError(
      "Your trial has expired. Please upgrade to continue.",
      "TRIAL_EXPIRED"
    );
  }

  if (action === "export" && !info.canExport) {
    throw new SubscriptionError(
      "Export requires a paid subscription.",
      "TRIAL_UPGRADE_REQUIRED"
    );
  }

  if (action === "publish" && !info.canPublish) {
    throw new SubscriptionError(
      "Publishing requires a paid subscription.",
      "TRIAL_UPGRADE_REQUIRED"
    );
  }
}

export class SubscriptionError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "SubscriptionError";
  }
}
