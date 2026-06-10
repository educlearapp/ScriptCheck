import { Router, type Response } from "express";
import { QuestionBankStatus } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  approveQuestionBankItem,
  archiveQuestionBankItem,
  createQuestionBankItem,
  getSavedFromAssessmentMap,
  listQuestionBankItems,
  QuestionBankError,
  saveAssessmentQuestionsToBank,
  saveGeneratedQuestionsToBank,
  updateQuestionBankItem,
} from "../services/questionBank";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof QuestionBankError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[question-bank]", err);
  return res.status(500).json({ error: "Question bank operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const items = await listQuestionBankItems({
        workspaceId: req.auth!.workspaceId,
        curriculumId: req.query.curriculumId
          ? String(req.query.curriculumId)
          : undefined,
        phaseId: req.query.phaseId ? String(req.query.phaseId) : undefined,
        gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
        topic: req.query.topic ? String(req.query.topic) : undefined,
        subtopic: req.query.subtopic ? String(req.query.subtopic) : undefined,
        difficulty: req.query.difficulty ? String(req.query.difficulty) : undefined,
        marks: req.query.marks ? Number(req.query.marks) : undefined,
        status: req.query.status
          ? (String(req.query.status) as QuestionBankStatus)
          : undefined,
        forPicker: req.query.forPicker === "true",
      });
      return res.json(items);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/saved-from-assessment/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const map = await getSavedFromAssessmentMap(
        req.auth!.workspaceId,
        String(req.params.assessmentId)
      );
      return res.json(map);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const marks = Number(body.marks);

    if (!body.questionText || !body.curriculumId || !body.phaseId || !body.gradeId || !body.subjectId) {
      return res.status(400).json({
        error: "questionText, curriculumId, phaseId, gradeId, and subjectId are required",
      });
    }

    try {
      const item = await createQuestionBankItem({
        workspaceId: req.auth!.workspaceId,
        curriculumId: String(body.curriculumId),
        phaseId: String(body.phaseId),
        gradeId: String(body.gradeId),
        subjectId: String(body.subjectId),
        topic: body.topic,
        subtopic: body.subtopic,
        questionText: String(body.questionText),
        expectedAnswer: body.expectedAnswer,
        memoNotes: body.memoNotes,
        rubricNotes: body.rubricNotes,
        marks,
        difficulty: body.difficulty,
        cognitiveLevel: body.cognitiveLevel,
        source: body.source ?? "TEACHER_CREATED",
        createdById: req.auth!.userId,
      });

      await logAudit({
        action: "QUESTION_BANK_ITEM_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { itemId: item.id, source: item.source },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await updateQuestionBankItem(
        String(req.params.id),
        req.auth!.workspaceId,
        req.access!,
        req.body ?? {}
      );
      return res.json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await approveQuestionBankItem(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "QUESTION_BANK_ITEM_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { itemId: item.id },
        ...auditRequestMeta(req),
      });

      return res.json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/archive",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_ARCHIVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await archiveQuestionBankItem(
        String(req.params.id),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "QUESTION_BANK_ITEM_ARCHIVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { itemId: item.id },
        ...auditRequestMeta(req),
      });

      return res.json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/from-assessment/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await saveAssessmentQuestionsToBank(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "QUESTION_BANK_SAVED_FROM_ASSESSMENT",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          assessmentId: String(req.params.assessmentId),
          saved: result.saved,
          skipped: result.skipped,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/from-assessment/:assessmentId/questions/:questionId",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await saveAssessmentQuestionsToBank(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.auth!.userId,
        String(req.params.questionId)
      );

      await logAudit({
        action: "QUESTION_BANK_SAVED_FROM_ASSESSMENT",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          assessmentId: String(req.params.assessmentId),
          questionId: String(req.params.questionId),
          saved: result.saved,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/from-generation/:requestId",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await saveGeneratedQuestionsToBank(
        String(req.params.requestId),
        req.auth!.workspaceId,
        req.auth!.userId
      );

      await logAudit({
        action: "QUESTION_BANK_SAVED_FROM_ASSESSMENT",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          generationRequestId: String(req.params.requestId),
          saved: result.saved,
          skipped: result.skipped,
          source: "AI_GENERATED",
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
