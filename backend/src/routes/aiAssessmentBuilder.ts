import { Router, type Response } from "express";
import multer from "multer";
import {
  AssessmentType,
  AiBloomLevel,
  AiQuestionType,
} from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import { AiUploadPurpose } from "@prisma/client";
import {
  AiBuilderError,
  approveBuilderRequest,
  confirmMaterialReview,
  createBuilderRequest,
  deleteStudyMaterial,
  discardBuilderRequest,
  exportBuilderPdf,
  extractAllContent,
  generateAiAssessment,
  getBlueprintPreview,
  loadBuilderRequest,
  refreshMaterialDuplicates,
  saveBuilderSettings,
  saveExtractedQuestionsToBank,
  serializeBuilderRequest,
  updateBuilderSource,
  updateDraft,
  updateMaterialText,
  uploadStudyMaterial,
} from "../services/aiAssessmentBuilder";
import type { AiGeneratedDraft } from "../services/aiAssessmentEngine";
import type { ExportType } from "../services/aiAssessmentExport";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

function handleError(res: Response, err: unknown) {
  if (err instanceof AiBuilderError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[ai-assessment-builder]", err);
  return res.status(500).json({ error: "AI Assessment Builder operation failed" });
}

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const request = await createBuilderRequest(
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.status(201).json(await serializeBuilderRequest(request));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const request = await loadBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );
      if (!request) {
        return res.status(404).json({ error: "Builder request not found" });
      }
      return res.json(await serializeBuilderRequest(request));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/materials/upload",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadPurpose = String(req.body?.uploadPurpose ?? "STUDY_MATERIAL") as AiUploadPurpose;
    if (!Object.values(AiUploadPurpose).includes(uploadPurpose)) {
      return res.status(400).json({ error: "Invalid uploadPurpose" });
    }

    try {
      const material = await uploadStudyMaterial(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
        uploadPurpose
      );

      await logAudit({
        action: "AI_MATERIAL_UPLOADED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          materialId: material.id,
          fileName: material.fileName,
          fileType: material.fileType,
          fileSize: material.fileSize,
          uploadPurpose: material.uploadPurpose,
        },
        ...meta,
      });

      if (uploadPurpose === "PAST_PAPER") {
        await logAudit({
          action: "PAST_PAPER_IMPORTED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            requestId: String(req.params.id),
            materialId: material.id,
            fileName: material.fileName,
          },
          ...meta,
        });
      }

      return res.status(201).json(material);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.delete(
  "/:id/materials/:materialId",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      await deleteStudyMaterial(
        String(req.params.id),
        String(req.params.materialId),
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/extract",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    try {
      await logAudit({
        action: "OCR_EXTRACTION_STARTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { requestId: String(req.params.id) },
        ...meta,
      });

      const results = await extractAllContent(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      const questionCount = results.reduce(
        (sum, r) => sum + (Array.isArray(r.extractedQuestions) ? r.extractedQuestions.length : 0),
        0
      );

      await logAudit({
        action: "OCR_EXTRACTION_COMPLETED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          materialCount: results.length,
          extractedCount: results.filter((r) => r.extractionStatus === "EXTRACTED").length,
          manualRequiredCount: results.filter((r) => r.extractionStatus === "MANUAL_REQUIRED").length,
          questionCount,
        },
        ...meta,
      });

      await logAudit({
        action: "AI_CONTENT_EXTRACTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          materialCount: results.length,
          questionCount,
        },
        ...meta,
      });

      if (questionCount > 0) {
        await logAudit({
          action: "QUESTION_BANK_QUESTION_EXTRACTED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: { requestId: String(req.params.id), questionCount },
          ...meta,
        });
      }

      const request = await loadBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(await serializeBuilderRequest(request!));
    } catch (err) {
      await logAudit({
        action: "OCR_EXTRACTION_FAILED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          error: err instanceof Error ? err.message : "Unknown error",
        },
        ...meta,
      });
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/materials/:materialId/text",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const manualText = String(body.manualText ?? "");

    try {
      const material = await updateMaterialText(
        String(req.params.id),
        String(req.params.materialId),
        req.auth!.workspaceId,
        req.auth!.userId,
        manualText
      );
      return res.json(material);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/materials/:materialId/confirm-review",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const material = await confirmMaterialReview(
        String(req.params.id),
        String(req.params.materialId),
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json(material);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/materials/:materialId/save-questions",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);
    const body = req.body ?? {};

    if (!body.curriculumId || !body.phaseId || !body.gradeId || !body.subjectId) {
      return res.status(400).json({
        error: "curriculumId, phaseId, gradeId, and subjectId are required",
      });
    }

    if (!Array.isArray(body.decisions)) {
      return res.status(400).json({ error: "decisions array is required" });
    }

    try {
      const result = await saveExtractedQuestionsToBank(
        String(req.params.id),
        String(req.params.materialId),
        req.auth!.workspaceId,
        req.auth!.userId,
        body.decisions,
        {
          curriculumId: String(body.curriculumId),
          phaseId: String(body.phaseId),
          gradeId: String(body.gradeId),
          subjectId: String(body.subjectId),
          term: body.term ?? null,
        }
      );

      for (const saved of result.saved) {
        await logAudit({
          action: "QUESTION_BANK_QUESTION_SAVED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            requestId: String(req.params.id),
            materialId: String(req.params.materialId),
            extractedId: saved.extractedId,
            itemId: saved.itemId,
          },
          ...meta,
        });
      }

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/materials/:materialId/duplicates",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    try {
      const duplicates = await refreshMaterialDuplicates(
        String(req.params.id),
        String(req.params.materialId),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      const flagged = duplicates.filter((d) => d.isDuplicate);
      if (flagged.length > 0) {
        await logAudit({
          action: "QUESTION_BANK_DUPLICATE_DETECTED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            requestId: String(req.params.id),
            materialId: String(req.params.materialId),
            duplicateCount: flagged.length,
          },
          ...meta,
        });
      }

      return res.json(duplicates);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/blueprint",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const blueprint = await getBlueprintPreview(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(blueprint);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/source",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const request = await updateBuilderSource(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          sourceMode: req.body?.sourceMode,
          selectedQuestionBankIds: Array.isArray(req.body?.selectedQuestionBankIds)
            ? req.body.selectedQuestionBankIds.map(String)
            : undefined,
          frameworkText: req.body?.frameworkText,
        }
      );
      return res.json(await serializeBuilderRequest(request!));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/settings",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const totalMarks = Number(body.totalMarks);

    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
      return res.status(400).json({ error: "totalMarks must be a positive number" });
    }

    const assessmentType = body.assessmentType as AssessmentType;
    if (!Object.values(AssessmentType).includes(assessmentType)) {
      return res.status(400).json({ error: "Invalid assessment type" });
    }

    const questionTypes = Array.isArray(body.questionTypes)
      ? body.questionTypes.filter((t: unknown) =>
          Object.values(AiQuestionType).includes(t as AiQuestionType)
        )
      : [];

    const bloomLevels = Array.isArray(body.bloomLevels)
      ? body.bloomLevels.filter((b: unknown) =>
          Object.values(AiBloomLevel).includes(b as AiBloomLevel)
        )
      : [];

    const difficulty = body.difficulty as "EASY" | "MODERATE" | "DIFFICULT" | "MIXED";
    if (!["EASY", "MODERATE", "DIFFICULT", "MIXED"].includes(difficulty)) {
      return res.status(400).json({ error: "Invalid difficulty" });
    }

    if (!body.title || !body.curriculumId || !body.phaseId || !body.gradeId || !body.subjectId) {
      return res.status(400).json({
        error: "title, curriculumId, phaseId, gradeId, and subjectId are required",
      });
    }

    try {
      const request = await saveBuilderSettings(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          curriculumId: String(body.curriculumId),
          phaseId: String(body.phaseId),
          gradeId: String(body.gradeId),
          subjectId: String(body.subjectId),
          assessmentType,
          title: String(body.title),
          term: body.term ?? null,
          totalMarks,
          durationMinutes: body.durationMinutes != null ? Number(body.durationMinutes) : null,
          difficulty,
          questionTypes,
          bloomLevels,
          instructions: body.instructions ?? null,
        }
      );

      return res.json(await serializeBuilderRequest(request!));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/generate",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    try {
      const result = await generateAiAssessment(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "AI_ASSESSMENT_GENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          questionCount: result.draft.questions.length,
          totalMarks: result.draft.totalMarks,
          mock: result.draft.mock,
        },
        ...meta,
      });

      const request = await loadBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(await serializeBuilderRequest(request!));
    } catch (err) {
      await logAudit({
        action: "AI_GENERATION_FAILED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          error: err instanceof Error ? err.message : "Unknown error",
        },
        ...auditRequestMeta(req),
      });
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/draft",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);
    const draft = req.body?.draft as AiGeneratedDraft | undefined;

    if (!draft?.questions) {
      return res.status(400).json({ error: "draft with questions is required" });
    }

    try {
      const result = await updateDraft(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        draft
      );

      await logAudit({
        action: "AI_ASSESSMENT_EDITED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          questionCount: draft.questions.length,
        },
        ...meta,
      });

      const request = await loadBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(await serializeBuilderRequest(request!));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    try {
      const result = await approveBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );

      await logAudit({
        action: "AI_ASSESSMENT_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          assessmentId: result.assessment.id,
          title: result.assessment.title,
          rubricTemplateId: result.rubricTemplateId,
        },
        ...meta,
      });

      return res.json({
        assessmentId: result.assessment.id,
        assessment: result.assessment,
        rubricTemplateId: result.rubricTemplateId,
      });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/export/:type",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);
    const exportType = String(req.params.type) as ExportType;

    if (!["question-paper", "memorandum", "rubric"].includes(exportType)) {
      return res.status(400).json({ error: "Invalid export type" });
    }

    try {
      const { buffer, filename, mimeType } = await exportBuilderPdf(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        exportType
      );

      await logAudit({
        action: "AI_ASSESSMENT_EXPORTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          exportType,
          fileName: filename,
        },
        ...meta,
      });

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      await discardBuilderRequest(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
