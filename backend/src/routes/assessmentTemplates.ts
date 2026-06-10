import { Router, type Response } from "express";
import { AssessmentType } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  archiveAssessmentTemplate,
  createTemplateFromAssessment,
  getTemplatePreview,
  listAssessmentTemplates,
  TemplateError,
  useAssessmentTemplate,
} from "../services/assessmentTemplates";
import { QuestionError } from "../services/assessmentQuestions";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof TemplateError || err instanceof QuestionError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[assessment-templates]", err);
  return res.status(500).json({ error: "Template operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENT_TEMPLATES_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await listAssessmentTemplates(req.auth!.workspaceId, {
        curriculumId: req.query.curriculumId
          ? String(req.query.curriculumId)
          : undefined,
        phaseId: req.query.phaseId ? String(req.query.phaseId) : undefined,
        gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
      });
      return res.json(templates);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/from-assessment/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENT_TEMPLATES_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    try {
      const template = await createTemplateFromAssessment(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        {
          name: String(body.name ?? ""),
          description: body.description,
        }
      );

      await logAudit({
        action: "ASSESSMENT_TEMPLATE_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          templateId: template.id,
          assessmentId: String(req.params.assessmentId),
          questionCount: template.questionCount,
        },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(template);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/preview",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENT_TEMPLATES_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const preview = await getTemplatePreview(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(preview);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/use",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENT_TEMPLATES_USE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    try {
      const result = await useAssessmentTemplate(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          title: body.title,
          assessmentType: body.assessmentType as AssessmentType | undefined,
          totalMarks: body.totalMarks != null ? Number(body.totalMarks) : undefined,
        }
      );

      await logAudit({
        action: "ASSESSMENT_TEMPLATE_USED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          templateId: String(req.params.id),
          assessmentId: result.assessmentId,
        },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/:id/archive",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENT_TEMPLATES_ARCHIVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const template = await archiveAssessmentTemplate(
        String(req.params.id),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "ASSESSMENT_TEMPLATE_ARCHIVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { templateId: template.id },
        ...auditRequestMeta(req),
      });

      return res.json({ id: template.id, status: template.status });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
