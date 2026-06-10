import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  AuditAction,
  PaperDocumentType,
  PaperVaultStatus,
  Prisma,
  WorkspaceRole,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  UserAccessContext,
  WORKSPACE_ROLE_LABELS,
} from "./permissions";
import { applyPdfWatermark } from "./paperVaultWatermark";
import { logAudit } from "./auditLog";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const EDITABLE_STATUSES: PaperVaultStatus[] = [PaperVaultStatus.DRAFT];
const NON_EDITABLE_STATUSES: PaperVaultStatus[] = [
  PaperVaultStatus.APPROVED,
  PaperVaultStatus.LOCKED,
  PaperVaultStatus.RELEASED,
  PaperVaultStatus.ARCHIVED,
];

export class PaperVaultError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "PaperVaultError";
  }
}

export type UploadedVaultFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function vaultUploadDir(workspaceId: string, assessmentId: string) {
  return path.join(UPLOAD_ROOT, workspaceId, "paper-vault", assessmentId);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function hasAdminPaperAccess(access: UserAccessContext, workspaceId: string): boolean {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.PAPER_VAULT_RELEASE) ||
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  );
}

function hasHodPaperAccess(access: UserAccessContext, workspaceId: string): boolean {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.PAPER_VAULT_APPROVE) ||
    hasAnyRole(access, workspaceId, [WorkspaceRole.HOD])
  );
}

function isAssignedModerator(
  access: UserAccessContext,
  workspaceId: string,
  assignedUserId: string | null | undefined
): boolean {
  if (!assignedUserId || assignedUserId !== access.userId) return false;
  return (
    hasAnyRole(access, workspaceId, [WorkspaceRole.MODERATOR, WorkspaceRole.EXAMINATION_OFFICER]) ||
    hasPermission(access, workspaceId, PERMISSIONS.EXAMINATIONS_VIEW)
  );
}

async function loadAssessment(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      creatorTeacherId: true,
      assignedUserId: true,
    },
  });
  if (!assessment) throw new PaperVaultError("Assessment not found", 404);
  return assessment;
}

async function loadDocument(documentId: string, workspaceId: string) {
  const doc = await prisma.paperVaultDocument.findFirst({
    where: { id: documentId, workspaceId },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
      assessment: {
        select: { id: true, title: true, creatorTeacherId: true, assignedUserId: true },
      },
    },
  });
  if (!doc) throw new PaperVaultError("Document not found", 404);
  return doc;
}

type PaperAssessmentRef = {
  creatorTeacherId: string;
  assignedUserId?: string | null;
};

function canViewDocument(
  access: UserAccessContext,
  workspaceId: string,
  doc: { status: PaperVaultStatus; uploadedById: string; assessment: PaperAssessmentRef },
  includeArchived: boolean
): boolean {
  if (!includeArchived && doc.status === PaperVaultStatus.ARCHIVED) {
    return hasAdminPaperAccess(access, workspaceId);
  }

  if (hasAdminPaperAccess(access, workspaceId) || hasHodPaperAccess(access, workspaceId)) {
    return true;
  }

  if (isAssignedModerator(access, workspaceId, doc.assessment.assignedUserId)) {
    return true;
  }

  if (!hasPermission(access, workspaceId, PERMISSIONS.PAPER_VAULT_VIEW)) {
    return false;
  }

  return (
    doc.uploadedById === access.userId ||
    doc.assessment.creatorTeacherId === access.userId
  );
}

function assertCanUpload(
  access: UserAccessContext,
  workspaceId: string,
  assessment: { creatorTeacherId: string }
) {
  if (!hasPermission(access, workspaceId, PERMISSIONS.PAPER_VAULT_UPLOAD)) {
    throw new PaperVaultError("Not permitted to upload papers", 403);
  }
  if (
    !hasAdminPaperAccess(access, workspaceId) &&
    !hasHodPaperAccess(access, workspaceId) &&
    assessment.creatorTeacherId !== access.userId
  ) {
    throw new PaperVaultError("You can only upload papers for your own assessments", 403);
  }
}

export type DownloadDecision = {
  allowed: boolean;
  reason?: string;
  adminOverride: boolean;
};

export function evaluateDownloadAccess(
  access: UserAccessContext,
  workspaceId: string,
  doc: {
    status: PaperVaultStatus;
    releaseAt: Date | null;
    expiresAt: Date | null;
    uploadedById: string;
    assessment: PaperAssessmentRef;
  },
  now = new Date()
): DownloadDecision {
  if (!canViewDocument(access, workspaceId, doc, true)) {
    return { allowed: false, reason: "Not permitted to view this document", adminOverride: false };
  }

  const adminOverride = hasAdminPaperAccess(access, workspaceId);

  if (doc.status === PaperVaultStatus.DRAFT || doc.status === PaperVaultStatus.PENDING_REVIEW) {
    if (adminOverride || hasHodPaperAccess(access, workspaceId)) {
      return { allowed: true, adminOverride };
    }
    if (
      doc.uploadedById === access.userId ||
      doc.assessment.creatorTeacherId === access.userId
    ) {
      return { allowed: true, adminOverride: false };
    }
    return { allowed: false, reason: "Draft papers are restricted to owner and reviewers", adminOverride: false };
  }

  if (doc.status === PaperVaultStatus.ARCHIVED && !adminOverride) {
    return { allowed: false, reason: "Archived document", adminOverride: false };
  }

  if (doc.releaseAt && now < doc.releaseAt && !adminOverride) {
    return { allowed: false, reason: "Document not yet released", adminOverride: false };
  }

  if (doc.expiresAt && now > doc.expiresAt && !adminOverride) {
    return { allowed: false, reason: "Download window has expired", adminOverride: false };
  }

  if (
    doc.status !== PaperVaultStatus.RELEASED &&
    doc.status !== PaperVaultStatus.LOCKED &&
    doc.status !== PaperVaultStatus.APPROVED &&
    doc.status !== PaperVaultStatus.ARCHIVED
  ) {
    if (!adminOverride && !hasHodPaperAccess(access, workspaceId)) {
      return { allowed: false, reason: "Document not released for download", adminOverride: false };
    }
  }

  return { allowed: true, adminOverride };
}

function serializeDocument(
  doc: Prisma.PaperVaultDocumentGetPayload<{
    include: { uploadedBy: { select: { id: true; fullName: true } } };
  }>
) {
  return {
    id: doc.id,
    assessmentId: doc.assessmentId,
    documentGroupId: doc.documentGroupId,
    documentType: doc.documentType,
    versionNumber: doc.versionNumber,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    status: doc.status,
    isCurrentVersion: doc.isCurrentVersion,
    uploadedBy: doc.uploadedBy,
    releaseAt: doc.releaseAt?.toISOString() ?? null,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    workflowComment: doc.workflowComment,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listPaperVaultDocuments(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext,
  options?: { includeArchived?: boolean; currentOnly?: boolean }
) {
  const assessment = await loadAssessment(assessmentId, workspaceId);
  const includeArchived = options?.includeArchived ?? false;
  const currentOnly = options?.currentOnly ?? true;

  const docs = await prisma.paperVaultDocument.findMany({
    where: {
      assessmentId,
      workspaceId,
      ...(currentOnly ? { isCurrentVersion: true } : {}),
      ...(includeArchived ? {} : { status: { not: PaperVaultStatus.ARCHIVED } }),
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
    orderBy: [{ documentType: "asc" }, { versionNumber: "desc" }],
  });

  return docs
    .filter((doc) => canViewDocument(access, workspaceId, { ...doc, assessment }, includeArchived))
    .map(serializeDocument);
}

export async function getPaperVersionHistory(
  documentGroupId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const docs = await prisma.paperVaultDocument.findMany({
    where: { documentGroupId, workspaceId },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
      assessment: { select: { creatorTeacherId: true, assignedUserId: true } },
    },
    orderBy: { versionNumber: "desc" },
  });
  if (!docs.length) throw new PaperVaultError("Document group not found", 404);

  return docs
    .filter((doc) => canViewDocument(access, workspaceId, doc, true))
    .map(serializeDocument);
}

export async function uploadPaperVaultDocument(
  assessmentId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  input: {
    documentType: PaperDocumentType;
    file: UploadedVaultFile;
    documentGroupId?: string;
  }
) {
  const assessment = await loadAssessment(assessmentId, workspaceId);
  assertCanUpload(access, workspaceId, assessment);

  if (!ALLOWED_MIME_TYPES.has(input.file.mimetype)) {
    throw new PaperVaultError("File type not allowed", 400);
  }
  if (input.file.size > MAX_FILE_SIZE) {
    throw new PaperVaultError("File exceeds 25 MB limit", 400);
  }

  let documentGroupId = input.documentGroupId;
  let versionNumber = 1;

  if (documentGroupId) {
    const latest = await prisma.paperVaultDocument.findFirst({
      where: { documentGroupId, workspaceId, isCurrentVersion: true },
    });
    if (!latest) throw new PaperVaultError("Document group not found", 404);
    if (NON_EDITABLE_STATUSES.includes(latest.status)) {
      throw new PaperVaultError("Cannot replace a document in its current status. Upload a new document instead.", 403);
    }
    if (!EDITABLE_STATUSES.includes(latest.status)) {
      throw new PaperVaultError("Only draft documents can be replaced", 403);
    }
    versionNumber = latest.versionNumber + 1;
    await prisma.paperVaultDocument.updateMany({
      where: { documentGroupId },
      data: { isCurrentVersion: false },
    });
  } else {
    documentGroupId = randomUUID();
  }

  const dir = vaultUploadDir(workspaceId, assessmentId);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}-${sanitizeFileName(input.file.originalname)}`;
  const storedPath = path.join(dir, storedName);
  fs.writeFileSync(storedPath, input.file.buffer);

  const doc = await prisma.paperVaultDocument.create({
    data: {
      workspaceId,
      assessmentId,
      documentGroupId,
      documentType: input.documentType,
      versionNumber,
      fileName: input.file.originalname,
      storedPath,
      mimeType: input.file.mimetype,
      fileSize: input.file.size,
      status: PaperVaultStatus.DRAFT,
      isCurrentVersion: true,
      uploadedById: userId,
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });

  return serializeDocument(doc);
}

async function transitionStatus(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext,
  targetStatus: PaperVaultStatus,
  extra?: { workflowComment?: string; releaseAt?: Date | null; expiresAt?: Date | null }
) {
  const doc = await loadDocument(documentId, workspaceId);

  if (doc.status === PaperVaultStatus.ARCHIVED) {
    throw new PaperVaultError("Archived documents cannot be modified", 403);
  }
  if (doc.status === PaperVaultStatus.LOCKED && targetStatus !== PaperVaultStatus.RELEASED && targetStatus !== PaperVaultStatus.ARCHIVED) {
    throw new PaperVaultError("Locked documents cannot be modified", 403);
  }
  if (doc.status === PaperVaultStatus.RELEASED && targetStatus !== PaperVaultStatus.ARCHIVED) {
    throw new PaperVaultError("Released documents are read-only", 403);
  }

  const updated = await prisma.paperVaultDocument.update({
    where: { id: documentId },
    data: {
      status: targetStatus,
      ...(extra?.workflowComment !== undefined ? { workflowComment: extra.workflowComment } : {}),
      ...(extra?.releaseAt !== undefined ? { releaseAt: extra.releaseAt } : {}),
      ...(extra?.expiresAt !== undefined ? { expiresAt: extra.expiresAt } : {}),
      ...(targetStatus === PaperVaultStatus.ARCHIVED ? { archivedAt: new Date() } : {}),
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });

  return serializeDocument(updated);
}

export async function submitPaperForReview(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  const doc = await loadDocument(documentId, workspaceId);
  if (doc.status !== PaperVaultStatus.DRAFT) {
    throw new PaperVaultError("Only draft documents can be submitted for review", 400);
  }
  if (
    doc.uploadedById !== access.userId &&
    !hasAdminPaperAccess(access, workspaceId) &&
    !hasHodPaperAccess(access, workspaceId)
  ) {
    throw new PaperVaultError("Not permitted", 403);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.PENDING_REVIEW);
}

export async function returnPaperForChanges(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext,
  comment?: string
) {
  if (!hasHodPaperAccess(access, workspaceId) && !hasAdminPaperAccess(access, workspaceId)) {
    throw new PaperVaultError("Not permitted to return papers", 403);
  }
  const doc = await loadDocument(documentId, workspaceId);
  if (doc.status !== PaperVaultStatus.PENDING_REVIEW) {
    throw new PaperVaultError("Only pending review documents can be returned", 400);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.DRAFT, {
    workflowComment: comment?.trim() || undefined,
  });
}

export async function approvePaper(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext,
  comment?: string
) {
  if (!hasHodPaperAccess(access, workspaceId) && !hasAdminPaperAccess(access, workspaceId)) {
    throw new PaperVaultError("Not permitted to approve papers", 403);
  }
  const doc = await loadDocument(documentId, workspaceId);
  if (doc.status !== PaperVaultStatus.PENDING_REVIEW) {
    throw new PaperVaultError("Only pending review documents can be approved", 400);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.APPROVED, {
    workflowComment: comment?.trim() || undefined,
  });
}

export async function lockPaper(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  if (!hasHodPaperAccess(access, workspaceId) && !hasAdminPaperAccess(access, workspaceId)) {
    throw new PaperVaultError("Not permitted to lock papers", 403);
  }
  const doc = await loadDocument(documentId, workspaceId);
  if (doc.status !== PaperVaultStatus.APPROVED) {
    throw new PaperVaultError("Only approved documents can be locked", 400);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.LOCKED);
}

export async function releasePaper(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext,
  releaseAt?: string | null,
  expiresAt?: string | null
) {
  if (!hasAdminPaperAccess(access, workspaceId)) {
    throw new PaperVaultError("Not permitted to release papers", 403);
  }
  const doc = await loadDocument(documentId, workspaceId);
  if (
    doc.status !== PaperVaultStatus.APPROVED &&
    doc.status !== PaperVaultStatus.LOCKED
  ) {
    throw new PaperVaultError("Only approved or locked documents can be released", 400);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.RELEASED, {
    releaseAt: releaseAt ? new Date(releaseAt) : new Date(),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
}

export async function archivePaper(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext
) {
  if (!hasAdminPaperAccess(access, workspaceId)) {
    throw new PaperVaultError("Not permitted to archive papers", 403);
  }
  return transitionStatus(documentId, workspaceId, access, PaperVaultStatus.ARCHIVED);
}

export async function downloadPaperVaultDocument(
  documentId: string,
  workspaceId: string,
  access: UserAccessContext,
  userName: string,
  roles: WorkspaceRole[]
) {
  const doc = await loadDocument(documentId, workspaceId);
  const decision = evaluateDownloadAccess(access, workspaceId, doc);

  if (!decision.allowed) {
    throw new PaperVaultError(decision.reason ?? "Download not permitted", 403);
  }

  if (!fs.existsSync(doc.storedPath)) {
    throw new PaperVaultError("File not found on server", 404);
  }

  const fileBuffer = fs.readFileSync(doc.storedPath);
  const roleLabel = roles.map((r) => WORKSPACE_ROLE_LABELS[r]).join(", ") || "User";

  const buffer = await applyPdfWatermark(fileBuffer, doc.mimeType, {
    userName,
    role: roleLabel,
    assessmentTitle: doc.assessment.title,
    versionNumber: doc.versionNumber,
    timestamp: new Date(),
  });

  return {
    buffer,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    document: serializeDocument(doc),
    adminOverride: decision.adminOverride,
  };
}

const PAPER_AUDIT_ACTIONS: AuditAction[] = [
  "PAPER_UPLOADED",
  "PAPER_UPDATED",
  "PAPER_SUBMITTED_FOR_REVIEW",
  "PAPER_RETURNED_FOR_CHANGES",
  "PAPER_APPROVED",
  "PAPER_LOCKED",
  "PAPER_RELEASED",
  "PAPER_ARCHIVED",
  "PAPER_DOWNLOADED",
  "PAPER_DOWNLOAD_BLOCKED",
];

export async function getPaperVaultAuditTimeline(
  assessmentId: string,
  workspaceId: string,
  documentGroupId?: string
) {
  const logs = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: { in: PAPER_AUDIT_ACTIONS },
    },
    include: {
      actor: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return logs
    .filter((log) => {
      const meta = log.metadata as Record<string, unknown> | null;
      if (!meta) return false;
      if (meta.assessmentId !== assessmentId) return false;
      if (documentGroupId && meta.documentGroupId !== documentGroupId) return false;
      return true;
    })
    .map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor,
      metadata: log.metadata,
    }));
}

export function getWorkflowActions(
  access: UserAccessContext,
  workspaceId: string,
  doc: { status: PaperVaultStatus; uploadedById: string; assessment: PaperAssessmentRef },
  userId: string
) {
  const isOwner =
    doc.uploadedById === userId || doc.assessment.creatorTeacherId === userId;
  const hod = hasHodPaperAccess(access, workspaceId);
  const admin = hasAdminPaperAccess(access, workspaceId);

  return {
    canSubmit: doc.status === PaperVaultStatus.DRAFT && (isOwner || hod || admin),
    canReturn: doc.status === PaperVaultStatus.PENDING_REVIEW && (hod || admin),
    canApprove: doc.status === PaperVaultStatus.PENDING_REVIEW && (hod || admin),
    canLock: doc.status === PaperVaultStatus.APPROVED && (hod || admin),
    canRelease:
      (doc.status === PaperVaultStatus.APPROVED ||
        doc.status === PaperVaultStatus.LOCKED) &&
      admin,
    canArchive: admin,
    canUploadNewVersion:
      doc.status === PaperVaultStatus.DRAFT && (isOwner || hod || admin),
    canDownload: true,
  };
}
