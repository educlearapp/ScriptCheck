import fs from "fs/promises";
import path from "path";
import {
  BetaFeedbackCategory,
  BetaFeedbackSeverity,
  BetaFeedbackStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const SCREENSHOT_DIR = "beta-feedback";

export class BetaFeedbackError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "BetaFeedbackError";
  }
}

const CATEGORIES = new Set<string>(Object.values(BetaFeedbackCategory));
const SEVERITIES = new Set<string>(Object.values(BetaFeedbackSeverity));
const STATUSES = new Set<string>(Object.values(BetaFeedbackStatus));

export type BetaFeedbackItem = {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  userRole: string;
  subject: string;
  page: string;
  category: BetaFeedbackCategory;
  severity: BetaFeedbackSeverity;
  comment: string;
  screenshotUrl: string | null;
  status: BetaFeedbackStatus;
  createdAt: string;
  updatedAt: string;
};

function toItem(
  row: {
    id: string;
    workspaceId: string;
    userId: string;
    userName: string;
    userRole: string;
    subject: string;
    page: string;
    category: BetaFeedbackCategory;
    severity: BetaFeedbackSeverity;
    comment: string;
    screenshotPath: string | null;
    status: BetaFeedbackStatus;
    createdAt: Date;
    updatedAt: Date;
  },
  baseUrl: string
): BetaFeedbackItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    userName: row.userName,
    userRole: row.userRole,
    subject: row.subject,
    page: row.page,
    category: row.category,
    severity: row.severity,
    comment: row.comment,
    screenshotUrl: row.screenshotPath
      ? `${baseUrl}/beta-feedback/${row.id}/screenshot`
      : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function saveScreenshot(
  feedbackId: string,
  file: Express.Multer.File
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, SCREENSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(file.originalname) || ".png";
  const fileName = `${feedbackId}${ext}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, file.buffer);
  return path.join(SCREENSHOT_DIR, fileName);
}

export async function createBetaFeedback(
  access: UserAccessContext,
  workspaceId: string,
  userId: string,
  body: {
    userName?: string;
    userRole?: string;
    subject?: string;
    page?: string;
    category?: string;
    severity?: string;
    comment?: string;
  },
  screenshot?: Express.Multer.File
): Promise<BetaFeedbackItem> {
  if (!hasPermission(access, workspaceId, PERMISSIONS.BETA_FEEDBACK_CREATE)) {
    throw new BetaFeedbackError("Insufficient permissions to submit feedback", 403);
  }

  const userName = body.userName?.trim();
  const userRole = body.userRole?.trim();
  const subject = body.subject?.trim();
  const page = body.page?.trim();
  const comment = body.comment?.trim();
  const category = body.category?.trim();
  const severity = body.severity?.trim();

  if (!userName || !userRole || !subject || !page || !comment) {
    throw new BetaFeedbackError("Name, role, subject, page, and comment are required", 400);
  }
  if (!category || !CATEGORIES.has(category)) {
    throw new BetaFeedbackError("Valid category is required", 400);
  }
  if (!severity || !SEVERITIES.has(severity)) {
    throw new BetaFeedbackError("Valid severity is required", 400);
  }

  const item = await prisma.betaFeedback.create({
    data: {
      workspaceId,
      userId,
      userName,
      userRole,
      subject,
      page,
      category: category as BetaFeedbackCategory,
      severity: severity as BetaFeedbackSeverity,
      comment,
    },
  });

  let screenshotPath: string | null = null;
  if (screenshot) {
    screenshotPath = await saveScreenshot(item.id, screenshot);
    await prisma.betaFeedback.update({
      where: { id: item.id },
      data: { screenshotPath },
    });
  }

  return toItem({ ...item, screenshotPath }, "");
}

export async function listBetaFeedback(
  access: UserAccessContext,
  workspaceId: string
): Promise<BetaFeedbackItem[]> {
  if (!hasPermission(access, workspaceId, PERMISSIONS.BETA_FEEDBACK_VIEW)) {
    throw new BetaFeedbackError("Insufficient permissions to view beta feedback", 403);
  }

  const rows = await prisma.betaFeedback.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => toItem(row, ""));
}

export async function updateBetaFeedbackStatus(
  access: UserAccessContext,
  workspaceId: string,
  feedbackId: string,
  status: string
): Promise<BetaFeedbackItem> {
  if (!hasPermission(access, workspaceId, PERMISSIONS.BETA_FEEDBACK_MANAGE)) {
    throw new BetaFeedbackError("Insufficient permissions to manage beta feedback", 403);
  }
  if (!STATUSES.has(status)) {
    throw new BetaFeedbackError("Invalid status", 400);
  }

  const existing = await prisma.betaFeedback.findFirst({
    where: { id: feedbackId, workspaceId },
  });
  if (!existing) {
    throw new BetaFeedbackError("Feedback not found", 404);
  }

  const updated = await prisma.betaFeedback.update({
    where: { id: feedbackId },
    data: { status: status as BetaFeedbackStatus },
  });

  return toItem(updated, "");
}

export async function getBetaFeedbackScreenshot(
  access: UserAccessContext,
  workspaceId: string,
  feedbackId: string
): Promise<{ filePath: string; mimeType: string }> {
  if (!hasPermission(access, workspaceId, PERMISSIONS.BETA_FEEDBACK_VIEW)) {
    throw new BetaFeedbackError("Insufficient permissions", 403);
  }

  const item = await prisma.betaFeedback.findFirst({
    where: { id: feedbackId, workspaceId },
  });
  if (!item?.screenshotPath) {
    throw new BetaFeedbackError("Screenshot not found", 404);
  }

  const filePath = path.join(UPLOAD_ROOT, item.screenshotPath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : "image/png";

  return { filePath, mimeType };
}
