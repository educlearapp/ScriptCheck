import { Router, type Response } from "express";
import multer from "multer";
import { PaperDocumentType } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  approvePaper,
  archivePaper,
  downloadPaperVaultDocument,
  getPaperVaultAuditTimeline,
  getPaperVersionHistory,
  getWorkflowActions,
  listPaperVaultDocuments,
  lockPaper,
  PaperVaultError,
  releasePaper,
  returnPaperForChanges,
  submitPaperForReview,
  uploadPaperVaultDocument,
  evaluateDownloadAccess,
} from "../services/paperVault";
import { prisma } from "../prisma";

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

function handleError(res: Response, err: unknown) {
  if (err instanceof PaperVaultError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[paper-vault]", err);
  return res.status(500).json({ error: "Paper vault operation failed" });
}

function auditMeta(
  assessmentId: string,
  doc: {
    id: string;
    documentGroupId: string;
    documentType: string;
    versionNumber: number;
    fileName: string;
    status: string;
  },
  extra?: Record<string, unknown>
) {
  return {
    assessmentId,
    documentId: doc.id,
    documentGroupId: doc.documentGroupId,
    documentType: doc.documentType,
    versionNumber: doc.versionNumber,
    fileName: doc.fileName,
    status: doc.status,
    ...extra,
  };
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const includeArchived = req.query.includeArchived === "true";
      const documents = await listPaperVaultDocuments(
        assessmentId,
        req.auth!.workspaceId,
        req.access!,
        { includeArchived }
      );

      const enriched = await Promise.all(
        documents.map(async (doc) => {
          const full = await prisma.paperVaultDocument.findUnique({
            where: { id: doc.id },
            include: {
              assessment: { select: { creatorTeacherId: true, assignedUserId: true } },
            },
          });
          const workflow = full
            ? getWorkflowActions(req.access!, req.auth!.workspaceId, full, req.auth!.userId)
            : null;
          const download = full
            ? evaluateDownloadAccess(req.access!, req.auth!.workspaceId, full)
            : { allowed: false };
          return { ...doc, workflow, canDownload: download.allowed };
        })
      );

      return res.json({ documents: enriched });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/audit",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const documentGroupId =
        typeof req.query.documentGroupId === "string"
          ? req.query.documentGroupId
          : undefined;
      const entries = await getPaperVaultAuditTimeline(
        assessmentId,
        req.auth!.workspaceId,
        documentGroupId
      );
      return res.json({ entries });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/groups/:documentGroupId/versions",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const versions = await getPaperVersionHistory(
        String(req.params.documentGroupId),
        req.auth!.workspaceId,
        req.access!
      );
      return res.json({ versions });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/upload",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_UPLOAD),
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const documentType = req.body?.documentType as PaperDocumentType;
      const documentGroupId =
        typeof req.body?.documentGroupId === "string" ? req.body.documentGroupId : undefined;

      if (!documentType || !Object.values(PaperDocumentType).includes(documentType)) {
        return res.status(400).json({ error: "Valid documentType is required" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "File is required" });
      }

      const doc = await uploadPaperVaultDocument(
        assessmentId,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        {
          documentType,
          documentGroupId,
          file: {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            buffer: req.file.buffer,
          },
        }
      );

      await logAudit({
        action: documentGroupId ? "PAPER_UPDATED" : "PAPER_UPLOADED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc),
        ...auditRequestMeta(req),
      });

      return res.status(201).json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/submit",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_UPLOAD),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const doc = await submitPaperForReview(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!
      );
      await logAudit({
        action: "PAPER_SUBMITTED_FOR_REVIEW",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/return",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_REVIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const comment =
        typeof req.body?.comment === "string" ? req.body.comment : undefined;
      const doc = await returnPaperForChanges(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!,
        comment
      );
      await logAudit({
        action: "PAPER_RETURNED_FOR_CHANGES",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc, { comment }),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/approve",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const comment =
        typeof req.body?.comment === "string" ? req.body.comment : undefined;
      const doc = await approvePaper(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!,
        comment
      );
      await logAudit({
        action: "PAPER_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc, { comment }),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/lock",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_LOCK),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const doc = await lockPaper(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!
      );
      await logAudit({
        action: "PAPER_LOCKED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/release",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_RELEASE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const releaseAt =
        typeof req.body?.releaseAt === "string" ? req.body.releaseAt : null;
      const expiresAt =
        typeof req.body?.expiresAt === "string" ? req.body.expiresAt : null;
      const doc = await releasePaper(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!,
        releaseAt,
        expiresAt
      );
      await logAudit({
        action: "PAPER_RELEASED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc, { releaseAt, expiresAt }),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:documentId/archive",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_ARCHIVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const doc = await archivePaper(
        String(req.params.documentId),
        req.auth!.workspaceId,
        req.access!
      );
      await logAudit({
        action: "PAPER_ARCHIVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, doc),
        ...auditRequestMeta(req),
      });
      return res.json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:documentId/download",
  requireAuth,
  requirePermission(PERMISSIONS.PAPER_VAULT_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.id);
      const documentId = String(req.params.documentId);

      const existing = await prisma.paperVaultDocument.findFirst({
        where: { id: documentId, workspaceId: req.auth!.workspaceId },
        include: {
          assessment: {
            select: { creatorTeacherId: true, assignedUserId: true },
          },
        },
      });

      if (!existing) {
        return res.status(404).json({ error: "Document not found" });
      }

      const decision = evaluateDownloadAccess(
        req.access!,
        req.auth!.workspaceId,
        existing
      );

      if (!decision.allowed) {
        await logAudit({
          action: "PAPER_DOWNLOAD_BLOCKED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            assessmentId,
            documentId: existing.id,
            documentGroupId: existing.documentGroupId,
            reason: decision.reason,
          },
          ...auditRequestMeta(req),
        });
        return res.status(403).json({ error: decision.reason ?? "Download not permitted" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { fullName: true },
      });

      const membership = req.access!.memberships.find(
        (m) => m.workspaceId === req.auth!.workspaceId
      );

      const result = await downloadPaperVaultDocument(
        documentId,
        req.auth!.workspaceId,
        req.access!,
        user?.fullName ?? "Unknown",
        membership?.roles ?? []
      );

      await logAudit({
        action: "PAPER_DOWNLOADED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: auditMeta(assessmentId, result.document, {
          adminOverride: result.adminOverride,
        }),
        ...auditRequestMeta(req),
      });

      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName.replace(/"/g, "")}"`
      );
      return res.send(result.buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
