import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  createAssessmentQuestion,
  deleteAssessmentQuestion,
  listAssessmentQuestions,
  QuestionError,
  updateAssessmentQuestion,
} from "../services/assessmentQuestions";
import {
  addQuestionBankItemsToAssessment,
  QuestionBankError,
} from "../services/questionBank";

const router = Router({ mergeParams: true });

function handleQuestionError(res: Response, err: unknown) {
  if (err instanceof QuestionError || err instanceof QuestionBankError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessment-questions]", err);
  return res.status(500).json({ error: "Question operation failed" });
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  const assessmentId = String(req.params.id);

  try {
    const result = await listAssessmentQuestions(
      assessmentId,
      req.auth!.workspaceId
    );
    return res.json(result);
  } catch (err) {
    return handleQuestionError(res, err);
  }
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  const assessmentId = String(req.params.id);

  try {
    const result = await createAssessmentQuestion(
      assessmentId,
      req.auth!.workspaceId,
      req.auth!.userId,
      req.access!,
      req.body ?? {}
    );
    return res.status(201).json(result);
  } catch (err) {
    return handleQuestionError(res, err);
  }
});

router.post(
  "/from-bank",
  requireAuth,
  requirePermission(PERMISSIONS.QUESTION_BANK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const assessmentId = String(req.params.id);
    const itemIds = Array.isArray(req.body?.itemIds)
      ? (req.body.itemIds as string[])
      : [];

    try {
      const result = await addQuestionBankItemsToAssessment(
        assessmentId,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        itemIds
      );

      for (const itemId of result.usedItemIds) {
        await logAudit({
          action: "QUESTION_BANK_ITEM_USED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: { itemId, assessmentId },
          ...auditRequestMeta(req),
        });
      }

      return res.status(201).json(result);
    } catch (err) {
      return handleQuestionError(res, err);
    }
  }
);

router.put(
  "/:questionId",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const assessmentId = String(req.params.id);
    const questionId = String(req.params.questionId);

    try {
      const result = await updateAssessmentQuestion(
        assessmentId,
        questionId,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        req.body ?? {}
      );
      return res.json(result);
    } catch (err) {
      return handleQuestionError(res, err);
    }
  }
);

router.delete(
  "/:questionId",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const assessmentId = String(req.params.id);
    const questionId = String(req.params.questionId);

    try {
      const result = await deleteAssessmentQuestion(
        assessmentId,
        questionId,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(result);
    } catch (err) {
      return handleQuestionError(res, err);
    }
  }
);

export default router;
