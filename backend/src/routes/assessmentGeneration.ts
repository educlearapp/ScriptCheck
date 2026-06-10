import { Router, type Response } from "express";
import {
  AssessmentType,
  GenerationDifficulty,
  GenerationMode,
} from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  approveGeneratedRequest,
  createAndGenerateRequest,
  discardGenerationRequest,
  GenerationError,
  loadGenerationRequest,
  regenerateRequest,
  serializeGenerationRequest,
} from "../services/assessmentGeneration";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof GenerationError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessment-generation]", err);
  return res.status(500).json({ error: "Generation operation failed" });
}

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const topics = Array.isArray(body.topics)
      ? body.topics.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];

    const totalMarks = Number(body.totalMarks);
    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
      return res.status(400).json({ error: "totalMarks must be a positive number" });
    }

    const assessmentType = body.assessmentType as AssessmentType;
    const outputMode = body.outputMode as GenerationMode;
    const difficulty = body.difficulty as GenerationDifficulty;

    if (!body.title || !body.curriculumId || !body.phaseId || !body.gradeId || !body.subjectId) {
      return res.status(400).json({
        error: "title, curriculumId, phaseId, gradeId, and subjectId are required",
      });
    }

    if (!Object.values(AssessmentType).includes(assessmentType)) {
      return res.status(400).json({ error: "Invalid assessment type" });
    }

    if (!Object.values(GenerationMode).includes(outputMode)) {
      return res.status(400).json({ error: "Invalid output mode" });
    }

    if (!Object.values(GenerationDifficulty).includes(difficulty)) {
      return res.status(400).json({ error: "Invalid difficulty" });
    }

    if (topics.length === 0) {
      return res.status(400).json({ error: "At least one topic is required" });
    }

    const meta = auditRequestMeta(req);

    try {
      const result = await createAndGenerateRequest({
        workspaceId: req.auth!.workspaceId,
        createdById: req.auth!.userId,
        curriculumId: String(body.curriculumId),
        phaseId: String(body.phaseId),
        gradeId: String(body.gradeId),
        subjectId: String(body.subjectId),
        assessmentType,
        outputMode,
        term: body.term ?? null,
        title: String(body.title),
        totalMarks,
        difficulty,
        instructions: body.instructions ?? null,
        topics,
      });

      await logAudit({
        action: "ASSESSMENT_GENERATION_REQUESTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: result.request.id,
          title: result.request.title,
          topics,
          outputMode,
          difficulty,
        },
        ...meta,
      });

      await logAudit({
        action: "ASSESSMENT_GENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: result.request.id,
          version: 1,
          questionCount: result.generated.summary.questionCount,
          mock: true,
        },
        ...meta,
      });

      return res
        .status(201)
        .json(await serializeGenerationRequest(result.request));
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
      const request = await loadGenerationRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );

      if (!request) {
        return res.status(404).json({ error: "Generation request not found" });
      }

      return res.json(await serializeGenerationRequest(request));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/regenerate",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const meta = auditRequestMeta(req);

    try {
      const result = await regenerateRequest(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "ASSESSMENT_REGENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: result.request.id,
          version: result.request.generated[0]?.version,
          mock: true,
        },
        ...meta,
      });

      await logAudit({
        action: "ASSESSMENT_GENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: result.request.id,
          version: result.request.generated[0]?.version,
          regenerated: true,
          mock: true,
        },
        ...meta,
      });

      return res.json(await serializeGenerationRequest(result.request));
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
      const result = await approveGeneratedRequest(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "ASSESSMENT_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          requestId: String(req.params.id),
          assessmentId: result.assessment.id,
          version: result.version,
          title: result.assessment.title,
        },
        ...meta,
      });

      return res.json({
        assessmentId: result.assessment.id,
        assessment: result.assessment,
        version: result.version,
      });
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
      await discardGenerationRequest(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
