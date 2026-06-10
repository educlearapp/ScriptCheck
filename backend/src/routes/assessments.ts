import { Router, type Response } from "express";
import { AssessmentStatus, AssessmentType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { hasPermission, PERMISSIONS } from "../services/permissions";
import {
  CurriculumValidationError,
  validateCurriculumSelection,
} from "../services/curriculumValidation";
import {
  approveAssessment,
  listModerationAudit,
  listModerationQueue,
  ModerationError,
  returnAssessmentToTeacher,
  submitAssessmentToHod,
} from "../services/assessmentModeration";
import {
  createScriptBatch,
  listBatchesForAssessment,
  ScriptError,
} from "../services/scriptMarking";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  createAssessmentFromQuestionBank,
  QuestionBankError,
  saveApprovedAssessmentQuestionsToBank,
} from "../services/questionBank";
import { calculateMarksSummary } from "../services/assessmentQuestions";
import {
  getAssessmentResults,
  getAssessmentResultsCsv,
  ResultsError,
} from "../services/assessmentResults";
import {
  publishAssessmentResults,
  reopenAssessmentResults,
  requestResultsPublish,
} from "../services/resultsPublishing";
import {
  assertReportableAssessment,
  generateAssessmentSummaryPdf,
} from "../services/pdfReports";
import assessmentQuestionsRoutes from "./assessmentQuestions";

const router = Router();

const assessmentInclude = {
  curriculum: { select: { id: true, code: true, name: true } },
  phase: { select: { id: true, code: true, name: true } },
  grade: { select: { id: true, code: true, name: true } },
  subject: { select: { id: true, code: true, name: true, category: true } },
  creatorTeacher: { select: { id: true, fullName: true } },
  assignedUser: { select: { id: true, fullName: true } },
} satisfies Prisma.AssessmentInclude;

type AssessmentWithRelations = Prisma.AssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;

function serializeAssessment(
  assessment: AssessmentWithRelations & {
    weightingPercent?: number | null;
    assessmentDate?: Date | null;
    dueDate?: Date | null;
    markingDeadline?: Date | null;
    moderationDeadline?: Date | null;
    rubricTemplateId?: string | null;
  }
) {
  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    curriculum: assessment.curriculum,
    phase: assessment.phase,
    grade: assessment.grade,
    subject: assessment.subject,
    assessmentType: assessment.assessmentType,
    term: assessment.term,
    session: assessment.session,
    totalMarks: assessment.totalMarks,
    weightingPercent: assessment.weightingPercent ?? null,
    durationMinutes: assessment.durationMinutes,
    assessmentDate: assessment.assessmentDate?.toISOString() ?? null,
    dueDate: assessment.dueDate?.toISOString() ?? null,
    markingDeadline: assessment.markingDeadline?.toISOString() ?? null,
    moderationDeadline: assessment.moderationDeadline?.toISOString() ?? null,
    rubricTemplateId: assessment.rubricTemplateId ?? null,
    status: assessment.status,
    creatorTeacher: assessment.creatorTeacher,
    assignedUser: assessment.assignedUser,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

function handleModerationError(res: Response, err: unknown) {
  if (err instanceof ModerationError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessments/moderation]", err);
  return res.status(500).json({ error: "Moderation action failed" });
}

function handleCreateError(res: Response, err: unknown) {
  if (err instanceof CurriculumValidationError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof QuestionBankError || err instanceof ScriptError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessments/create]", err);
  return res.status(500).json({ error: "Failed to create assessment" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const status = req.query.status as AssessmentStatus | undefined;
    const curriculumId = req.query.curriculumId
      ? String(req.query.curriculumId)
      : undefined;

    try {
      const assessments = await prisma.assessment.findMany({
        where: {
          workspaceId: req.auth!.workspaceId,
          ...(status ? { status } : {}),
          ...(curriculumId ? { curriculumId } : {}),
        },
        include: assessmentInclude,
        orderBy: { updatedAt: "desc" },
      });

      return res.json(assessments.map(serializeAssessment));
    } catch (err) {
      console.error("[assessments]", err);
      return res.status(500).json({ error: "Failed to list assessments" });
    }
  }
);

router.get(
  "/moderation-queue",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_QUEUE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const queue = await listModerationQueue(req.auth!.workspaceId);
      return res.json(queue.map(serializeAssessment));
    } catch (err) {
      console.error("[assessments/moderation-queue]", err);
      return res.status(500).json({ error: "Failed to load moderation queue" });
    }
  }
);

router.get(
  "/:assessmentId/script-batches",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const batches = await listBatchesForAssessment(
        req.auth!.workspaceId,
        String(req.params.assessmentId)
      );
      return res.json(batches);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: "Failed to list script batches" });
    }
  }
);

router.post(
  "/:assessmentId/script-batches",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title ?? "").trim();

    try {
      const batch = await createScriptBatch(
        req.auth!.workspaceId,
        req.auth!.userId,
        String(req.params.assessmentId),
        title
      );

      await logAudit({
        action: "SCRIPT_BATCH_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { batchId: batch.id, assessmentId: String(req.params.assessmentId) },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(batch);
    } catch (err) {
      return handleCreateError(res, err);
    }
  }
);

router.use("/:id/questions", assessmentQuestionsRoutes);

function handleResultsError(res: Response, err: unknown) {
  if (err instanceof ResultsError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessments/results]", err);
  return res.status(500).json({ error: "Failed to load assessment results" });
}

router.get(
  "/:id/reports/assessment.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      await assertReportableAssessment(id, req.auth!.workspaceId);
      const pdf = await generateAssessmentSummaryPdf(
        id,
        req.auth!.workspaceId,
        req.access!
      );

      const assessment = await prisma.assessment.findFirst({
        where: { id, workspaceId: req.auth!.workspaceId },
        select: { title: true },
      });

      const safeTitle = (assessment?.title ?? "assessment")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .slice(0, 80);

      await logAudit({
        action: "ASSESSMENT_REPORT_GENERATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: id },
        ...auditRequestMeta(req),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeTitle}-summary.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.get(
  "/:id/results.csv",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_EXPORT),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const csv = await getAssessmentResultsCsv(
        id,
        req.auth!.workspaceId,
        req.access!
      );

      const assessment = await prisma.assessment.findFirst({
        where: { id, workspaceId: req.auth!.workspaceId },
        select: { title: true },
      });

      const safeTitle = (assessment?.title ?? "assessment")
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .slice(0, 80);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeTitle}-results.csv"`
      );
      return res.send(csv);
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.get(
  "/:id/results",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const results = await getAssessmentResults(
        id,
        req.auth!.workspaceId,
        req.access!
      );
      return res.json(results);
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.post(
  "/:id/request-publish",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const assessment = await requestResultsPublish(
        id,
        req.auth!.workspaceId,
        req.access!
      );

      await logAudit({
        action: "RESULTS_PUBLISH_REQUESTED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: id },
        ...auditRequestMeta(req),
      });

      return res.json({ assessment });
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.post(
  "/:id/publish-results",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_PUBLISH),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const result = await publishAssessmentResults(
        id,
        req.auth!.workspaceId,
        req.access!
      );

      await logAudit({
        action: "RESULTS_PUBLISHED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: id },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.post(
  "/:id/reopen-results",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_REOPEN),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const assessment = await reopenAssessmentResults(
        id,
        req.auth!.workspaceId,
        req.access!
      );

      await logAudit({
        action: "RESULTS_REOPENED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: id },
        ...auditRequestMeta(req),
      });

      return res.json({ assessment });
    } catch (err) {
      return handleResultsError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const assessment = await prisma.assessment.findFirst({
        where: { id, workspaceId: req.auth!.workspaceId },
        include: assessmentInclude,
      });

      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      const marksSummary = await calculateMarksSummary(
        assessment.id,
        assessment.totalMarks
      );

      return res.json({
        ...serializeAssessment(assessment),
        marksSummary,
      });
    } catch (err) {
      console.error("[assessments/:id]", err);
      return res.status(500).json({ error: "Failed to load assessment" });
    }
  }
);

router.get(
  "/:id/moderation-audit",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const audits = await listModerationAudit(id, req.auth!.workspaceId);
      return res.json(audits);
    } catch (err) {
      return handleModerationError(res, err);
    }
  }
);

router.post(
  "/:id/submit-to-hod",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const result = await submitAssessmentToHod({
        assessmentId: id,
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        access: req.access!,
        comment: req.body?.comment,
      });

      const assessment = await prisma.assessment.findFirst({
        where: { id: result.assessment.id },
        include: assessmentInclude,
      });

      return res.json({
        assessment: assessment ? serializeAssessment(assessment) : result.assessment,
        audit: result.audit,
      });
    } catch (err) {
      return handleModerationError(res, err);
    }
  }
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const saveToQuestionBank = req.body?.saveToQuestionBank === true;

      const result = await approveAssessment({
        assessmentId: id,
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        access: req.access!,
        comment: req.body?.comment,
      });

      let bankSaveResult = null;
      if (saveToQuestionBank) {
        bankSaveResult = await saveApprovedAssessmentQuestionsToBank(
          id,
          req.auth!.workspaceId,
          req.auth!.userId
        );

        await logAudit({
          action: "QUESTION_BANK_SAVED_FROM_ASSESSMENT",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: {
            assessmentId: id,
            hodApproved: true,
            saved: bankSaveResult.saved,
          },
          ...auditRequestMeta(req),
        });
      }

      const assessment = await prisma.assessment.findFirst({
        where: { id: result.assessment.id },
        include: assessmentInclude,
      });

      return res.json({
        assessment: assessment ? serializeAssessment(assessment) : result.assessment,
        audit: result.audit,
        questionBank: bankSaveResult,
      });
    } catch (err) {
      return handleModerationError(res, err);
    }
  }
);

router.post(
  "/:id/return",
  requireAuth,
  requirePermission(PERMISSIONS.MODERATION_RETURN),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);

    try {
      const result = await returnAssessmentToTeacher({
        assessmentId: id,
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        access: req.access!,
        comment: req.body?.comment,
      });

      const assessment = await prisma.assessment.findFirst({
        where: { id: result.assessment.id },
        include: assessmentInclude,
      });

      return res.json({
        assessment: assessment ? serializeAssessment(assessment) : result.assessment,
        audit: result.audit,
      });
    } catch (err) {
      return handleModerationError(res, err);
    }
  }
);

router.post(
  "/from-question-bank",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const itemIds = Array.isArray(body.itemIds) ? (body.itemIds as string[]) : [];

    if (
      !body.title ||
      !body.curriculumId ||
      !body.phaseId ||
      !body.gradeId ||
      !body.subjectId
    ) {
      return res.status(400).json({
        error: "title, curriculumId, phaseId, gradeId, subjectId, and itemIds are required",
      });
    }

    try {
      await validateCurriculumSelection({
        curriculumId: String(body.curriculumId),
        phaseId: String(body.phaseId),
        gradeId: String(body.gradeId),
        subjectId: String(body.subjectId),
      });

      const result = await createAssessmentFromQuestionBank(
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          title: String(body.title),
          curriculumId: String(body.curriculumId),
          phaseId: String(body.phaseId),
          gradeId: String(body.gradeId),
          subjectId: String(body.subjectId),
          assessmentType: body.assessmentType,
          totalMarks: body.totalMarks != null ? Number(body.totalMarks) : undefined,
          itemIds,
        }
      );

      for (const itemId of result.usedItemIds) {
        await logAudit({
          action: "QUESTION_BANK_ITEM_USED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          metadata: { itemId, assessmentId: result.assessmentId, fromCreate: true },
          ...auditRequestMeta(req),
        });
      }

      return res.status(201).json(result);
    } catch (err) {
      return handleCreateError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const {
      title,
      description,
      curriculumId,
      phaseId,
      gradeId,
      subjectId,
      assessmentType,
      term,
      session,
      totalMarks,
      durationMinutes,
      assignedUserId,
    } = req.body ?? {};

    if (
      !title ||
      !curriculumId ||
      !phaseId ||
      !gradeId ||
      !subjectId ||
      !assessmentType
    ) {
      return res.status(400).json({
        error:
          "title, curriculumId, phaseId, gradeId, subjectId, and assessmentType are required",
      });
    }

    if (!Object.values(AssessmentType).includes(assessmentType)) {
      return res.status(400).json({ error: "Invalid assessment type" });
    }

    const marks = Number(totalMarks);
    if (!Number.isFinite(marks) || marks <= 0) {
      return res.status(400).json({ error: "totalMarks must be a positive number" });
    }

    try {
      await validateCurriculumSelection({
        curriculumId: String(curriculumId),
        phaseId: String(phaseId),
        gradeId: String(gradeId),
        subjectId: String(subjectId),
      });

      if (assignedUserId) {
        const assigneeMembership = await prisma.workspaceMembership.findFirst({
          where: {
            userId: assignedUserId,
            workspaceId: req.auth!.workspaceId,
            isActive: true,
          },
        });
        if (!assigneeMembership) {
          return res.status(400).json({ error: "Assigned user not found in workspace" });
        }
      }

      const body = req.body ?? {};
      const weighting = body.weightingPercent != null ? Number(body.weightingPercent) : null;
      if (weighting != null && (!Number.isFinite(weighting) || weighting < 0 || weighting > 100)) {
        return res.status(400).json({ error: "weightingPercent must be between 0 and 100" });
      }

      const assessment = await prisma.assessment.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          curriculumId: String(curriculumId),
          phaseId: String(phaseId),
          gradeId: String(gradeId),
          subjectId: String(subjectId),
          assessmentType,
          term: term ? String(term).trim() : null,
          session: session ? String(session).trim() : null,
          totalMarks: marks,
          weightingPercent: weighting,
          durationMinutes:
            durationMinutes != null && durationMinutes !== ""
              ? Number(durationMinutes)
              : null,
          assessmentDate: body.assessmentDate ? new Date(body.assessmentDate) : null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          markingDeadline: body.markingDeadline ? new Date(body.markingDeadline) : null,
          moderationDeadline: body.moderationDeadline ? new Date(body.moderationDeadline) : null,
          rubricTemplateId: body.rubricTemplateId ? String(body.rubricTemplateId) : null,
          status: AssessmentStatus.DRAFT,
          creatorTeacherId: req.auth!.userId,
          assignedUserId: assignedUserId || null,
        },
        include: assessmentInclude,
      });

      await logAudit({
        action: "ASSESSMENT_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: assessment.id, title: assessment.title },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(serializeAssessment(assessment));
    } catch (err) {
      return handleCreateError(res, err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const body = req.body ?? {};

    try {
      const existing = await prisma.assessment.findFirst({
        where: { id, workspaceId: req.auth!.workspaceId },
      });
      if (!existing) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      const canEdit =
        hasPermission(req.access!, req.auth!.workspaceId, PERMISSIONS.ASSESSMENTS_EDIT) ||
        (hasPermission(req.access!, req.auth!.workspaceId, PERMISSIONS.ASSESSMENTS_EDIT_OWN) &&
          existing.creatorTeacherId === req.auth!.userId);

      if (!canEdit) {
        return res.status(403).json({ error: "Not permitted to edit this assessment" });
      }

      if (!["DRAFT", "RETURNED_TO_TEACHER"].includes(existing.status)) {
        return res.status(403).json({ error: "Assessment cannot be edited in its current status" });
      }

      if (
        body.assessmentType &&
        !Object.values(AssessmentType).includes(body.assessmentType)
      ) {
        return res.status(400).json({ error: "Invalid assessment type" });
      }

      if (body.totalMarks != null) {
        const marks = Number(body.totalMarks);
        if (!Number.isFinite(marks) || marks <= 0) {
          return res.status(400).json({ error: "totalMarks must be a positive number" });
        }
      }

      const assessment = await prisma.assessment.update({
        where: { id },
        data: {
          ...(body.title != null ? { title: String(body.title).trim() } : {}),
          ...(body.description !== undefined
            ? { description: body.description ? String(body.description).trim() : null }
            : {}),
          ...(body.assessmentType != null ? { assessmentType: body.assessmentType } : {}),
          ...(body.term !== undefined ? { term: body.term ? String(body.term).trim() : null } : {}),
          ...(body.session !== undefined
            ? { session: body.session ? String(body.session).trim() : null }
            : {}),
          ...(body.totalMarks != null ? { totalMarks: Number(body.totalMarks) } : {}),
          ...(body.weightingPercent !== undefined
            ? { weightingPercent: body.weightingPercent != null ? Number(body.weightingPercent) : null }
            : {}),
          ...(body.durationMinutes !== undefined
            ? {
                durationMinutes:
                  body.durationMinutes != null && body.durationMinutes !== ""
                    ? Number(body.durationMinutes)
                    : null,
              }
            : {}),
          ...(body.assessmentDate !== undefined
            ? { assessmentDate: body.assessmentDate ? new Date(body.assessmentDate) : null }
            : {}),
          ...(body.dueDate !== undefined
            ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
            : {}),
          ...(body.markingDeadline !== undefined
            ? {
                markingDeadline: body.markingDeadline
                  ? new Date(body.markingDeadline)
                  : null,
              }
            : {}),
          ...(body.moderationDeadline !== undefined
            ? {
                moderationDeadline: body.moderationDeadline
                  ? new Date(body.moderationDeadline)
                  : null,
              }
            : {}),
          ...(body.rubricTemplateId !== undefined
            ? { rubricTemplateId: body.rubricTemplateId ? String(body.rubricTemplateId) : null }
            : {}),
        },
        include: assessmentInclude,
      });

      await logAudit({
        action: "ASSESSMENT_UPDATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: assessment.id },
        ...auditRequestMeta(req),
      });

      return res.json(serializeAssessment(assessment));
    } catch (err) {
      console.error("[assessments/patch]", err);
      return res.status(500).json({ error: "Failed to update assessment" });
    }
  }
);

export default router;
