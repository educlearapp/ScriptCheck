import { PortalUserType } from "@prisma/client";
import { prisma } from "../prisma";
import { auditRequestMeta, logAudit } from "./auditLog";
import { signPortalToken } from "./portalToken";

export async function getLinkedLearnerIds(
  portalAccountId: string,
  portalType: PortalUserType,
  learnerId: string | null
): Promise<string[]> {
  if (portalType === PortalUserType.LEARNER && learnerId) {
    return [learnerId];
  }

  const links = await prisma.parentLearnerLink.findMany({
    where: { parentAccountId: portalAccountId },
    select: { learnerId: true },
  });

  return links.map((l) => l.learnerId);
}

export class PortalAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "PortalAuthError";
  }
}

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolveWorkspace(workspaceSlug: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) throw new PortalAuthError("School not found", 404);
  return workspace;
}

export async function requestPortalOtp(input: {
  workspaceSlug: string;
  portalType: PortalUserType;
  email?: string;
  learnerNumber?: string;
}) {
  const workspace = await resolveWorkspace(input.workspaceSlug);

  let identifier: string;

  if (input.portalType === PortalUserType.PARENT) {
    if (!input.email) throw new PortalAuthError("Email is required for parent login");
    identifier = normalizeEmail(input.email);

    const account = await prisma.portalAccount.findFirst({
      where: {
        workspaceId: workspace.id,
        type: PortalUserType.PARENT,
        email: identifier,
        isActive: true,
      },
    });
    if (!account) {
      throw new PortalAuthError("No parent account found for this email", 404);
    }
  } else {
    if (!input.learnerNumber) {
      throw new PortalAuthError("Learner number is required");
    }
    identifier = input.learnerNumber.trim();

    const learner = await prisma.learner.findFirst({
      where: {
        workspaceId: workspace.id,
        learnerNumber: identifier,
        active: true,
      },
    });
    if (!learner) {
      throw new PortalAuthError("Learner not found", 404);
    }

    const account = await prisma.portalAccount.findFirst({
      where: {
        workspaceId: workspace.id,
        type: PortalUserType.LEARNER,
        learnerId: learner.id,
        isActive: true,
      },
    });
    if (!account) {
      throw new PortalAuthError("Portal access not enabled for this learner", 403);
    }
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await prisma.portalOtp.create({
    data: {
      workspaceId: workspace.id,
      identifier,
      portalType: input.portalType,
      code,
      expiresAt,
    },
  });

  const devMode =
    process.env.NODE_ENV !== "production" ||
    process.env.PORTAL_OTP_DEV === "true";

  if (devMode) {
    console.log(
      `[portal-otp] ${input.portalType} ${identifier} @ ${workspace.slug}: ${code}`
    );
  }

  return {
    ok: true,
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
    ...(devMode ? { devOtp: code } : {}),
  };
}

export async function verifyPortalOtp(
  input: {
    workspaceSlug: string;
    portalType: PortalUserType;
    email?: string;
    learnerNumber?: string;
    code: string;
  },
  meta?: { ipAddress?: string; userAgent?: string }
) {
  const workspace = await resolveWorkspace(input.workspaceSlug);
  const code = input.code.trim();

  if (!/^\d{6}$/.test(code)) {
    throw new PortalAuthError("Invalid OTP format");
  }

  let identifier: string;
  if (input.portalType === PortalUserType.PARENT) {
    if (!input.email) throw new PortalAuthError("Email is required");
    identifier = normalizeEmail(input.email);
  } else {
    if (!input.learnerNumber) throw new PortalAuthError("Learner number is required");
    identifier = input.learnerNumber.trim();
  }

  const otp = await prisma.portalOtp.findFirst({
    where: {
      workspaceId: workspace.id,
      identifier,
      portalType: input.portalType,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    await logAudit({
      action: "PORTAL_ACCESS_DENIED",
      workspaceId: workspace.id,
      metadata: {
        reason: "invalid_otp",
        portalType: input.portalType,
        identifier,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new PortalAuthError("Invalid or expired OTP", 401);
  }

  await prisma.portalOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  type LearnerSummary = {
    id: string;
    learnerNumber: string;
    fullName: string;
    className: string | null;
    grade: { id: string; name: string };
  };

  let accountId: string;
  let accountType: PortalUserType;
  let accountEmail: string | null;
  let accountFullName: string | null;
  let accountLearnerId: string | null;
  let learners: LearnerSummary[] = [];

  if (input.portalType === PortalUserType.PARENT) {
    const parentAccount = await prisma.portalAccount.findFirst({
      where: {
        workspaceId: workspace.id,
        type: PortalUserType.PARENT,
        email: identifier,
        isActive: true,
      },
      include: {
        parentLinks: {
          include: {
            learner: {
              select: {
                id: true,
                learnerNumber: true,
                firstName: true,
                lastName: true,
                className: true,
                grade: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!parentAccount) throw new PortalAuthError("Portal account not found", 404);

    accountId = parentAccount.id;
    accountType = parentAccount.type;
    accountEmail = parentAccount.email;
    accountFullName = parentAccount.fullName;
    accountLearnerId = parentAccount.learnerId;
    learners = parentAccount.parentLinks.map((l) => ({
      id: l.learner.id,
      learnerNumber: l.learner.learnerNumber,
      fullName: `${l.learner.firstName} ${l.learner.lastName}`.trim(),
      className: l.learner.className,
      grade: l.learner.grade,
    }));
  } else {
    const learner = await prisma.learner.findFirst({
      where: {
        workspaceId: workspace.id,
        learnerNumber: identifier,
        active: true,
      },
    });
    if (!learner) throw new PortalAuthError("Learner not found", 404);

    const learnerAccount = await prisma.portalAccount.findFirst({
      where: {
        workspaceId: workspace.id,
        type: PortalUserType.LEARNER,
        learnerId: learner.id,
        isActive: true,
      },
      include: {
        learner: {
          select: {
            id: true,
            learnerNumber: true,
            firstName: true,
            lastName: true,
            className: true,
            grade: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!learnerAccount?.learner) {
      throw new PortalAuthError("Portal account not found", 404);
    }

    accountId = learnerAccount.id;
    accountType = learnerAccount.type;
    accountEmail = learnerAccount.email;
    accountFullName = learnerAccount.fullName;
    accountLearnerId = learnerAccount.learnerId;
    learners = [
      {
        id: learnerAccount.learner.id,
        learnerNumber: learnerAccount.learner.learnerNumber,
        fullName: `${learnerAccount.learner.firstName} ${learnerAccount.learner.lastName}`.trim(),
        className: learnerAccount.learner.className,
        grade: learnerAccount.learner.grade,
      },
    ];
  }

  await prisma.portalAccount.update({
    where: { id: accountId },
    data: { lastLoginAt: new Date() },
  });

  const learnerIds = await getLinkedLearnerIds(
    accountId,
    accountType,
    accountLearnerId
  );

  const token = signPortalToken({
    portalAccountId: accountId,
    workspaceId: workspace.id,
    portalType: accountType,
    learnerIds,
    email: accountEmail ?? undefined,
    fullName: accountFullName ?? undefined,
  });

  await logAudit({
    action: "PORTAL_LOGIN",
    workspaceId: workspace.id,
    metadata: {
      portalAccountId: accountId,
      portalType: accountType,
      identifier,
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return {
    token,
    portalType: accountType,
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    learners,
    activeLearnerId: learners[0]?.id ?? null,
  };
}

export async function getPortalProfile(portalAccountId: string, workspaceId: string) {
  const account = await prisma.portalAccount.findFirst({
    where: { id: portalAccountId, workspaceId, isActive: true },
    include: {
      learner: {
        select: {
          id: true,
          learnerNumber: true,
          firstName: true,
          lastName: true,
          className: true,
          grade: { select: { id: true, name: true } },
        },
      },
      parentLinks: {
        include: {
          learner: {
            select: {
              id: true,
              learnerNumber: true,
              firstName: true,
              lastName: true,
              className: true,
              grade: { select: { id: true, name: true } },
            },
          },
        },
      },
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!account) throw new PortalAuthError("Portal account not found", 404);

  const learners =
    account.type === PortalUserType.PARENT
      ? account.parentLinks.map((l) => ({
          id: l.learner.id,
          learnerNumber: l.learner.learnerNumber,
          fullName: `${l.learner.firstName} ${l.learner.lastName}`.trim(),
          className: l.learner.className,
          grade: l.learner.grade,
        }))
      : account.learner
        ? [
            {
              id: account.learner.id,
              learnerNumber: account.learner.learnerNumber,
              fullName: `${account.learner.firstName} ${account.learner.lastName}`.trim(),
              className: account.learner.className,
              grade: account.learner.grade,
            },
          ]
        : [];

  return {
    portalAccountId: account.id,
    portalType: account.type,
    email: account.email,
    fullName: account.fullName,
    workspace: account.workspace,
    learners,
  };
}
