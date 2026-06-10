import { Router } from "express";
import { RubricTemplateScope } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  approveRubricTemplate,
  archiveRubricTemplate,
  createRubricTemplate,
  getRubricTemplate,
  listRubricTemplates,
  RubricError,
  updateRubricTemplate,
} from "../services/rubrics";

const router = Router();

function handleRubricError(res: import("express").Response, err: unknown) {
  if (err instanceof RubricError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[rubrics]", err);
  return res.status(500).json({ error: "Rubric operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await listRubricTemplates(req.auth!.workspaceId, {
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
        scope: req.query.scope
          ? (String(req.query.scope) as RubricTemplateScope)
          : undefined,
        includeArchived: req.query.includeArchived === "true",
      });
      return res.json(templates);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const template = await getRubricTemplate(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(template);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const criteria = Array.isArray(body.criteria) ? body.criteria : [];

    if (!body.name || !body.scope || criteria.length === 0) {
      return res.status(400).json({
        error: "name, scope, and criteria are required",
      });
    }

    if (!Object.values(RubricTemplateScope).includes(body.scope)) {
      return res.status(400).json({ error: "Invalid rubric scope" });
    }

    try {
      const template = await createRubricTemplate(
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          name: String(body.name),
          description: body.description ?? null,
          subjectId: body.subjectId ?? null,
          scope: body.scope,
          criteria,
          submitForApproval: body.submitForApproval === true,
        }
      );

      await logAudit({
        action: "RUBRIC_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { rubricId: template.id, name: template.name, totalMarks: template.totalMarks },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(template);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    try {
      const template = await updateRubricTemplate(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          name: body.name != null ? String(body.name) : undefined,
          description: body.description,
          subjectId: body.subjectId,
          scope: body.scope,
          criteria: Array.isArray(body.criteria) ? body.criteria : undefined,
          submitForApproval: body.submitForApproval === true,
        }
      );

      await logAudit({
        action: "RUBRIC_UPDATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { rubricId: template.id, totalMarks: template.totalMarks },
        ...auditRequestMeta(req),
      });

      return res.json(template);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_APPROVE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const template = await approveRubricTemplate(
        req.auth!.workspaceId,
        String(req.params.id),
        req.auth!.userId
      );

      await logAudit({
        action: "RUBRIC_APPROVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { rubricId: template.id, name: template.name },
        ...auditRequestMeta(req),
      });

      return res.json(template);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

router.post(
  "/:id/archive",
  requireAuth,
  requirePermission(PERMISSIONS.RUBRICS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const template = await archiveRubricTemplate(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(template);
    } catch (err) {
      return handleRubricError(res, err);
    }
  }
);

export default router;
