import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  archiveWorkspaceSubject,
  createWorkspaceSubject,
  listWorkspaceSubjects,
  SubjectError,
  updateWorkspaceSubject,
} from "../services/workspaceSubjects";

const router = Router();

function handleSubjectError(res: import("express").Response, err: unknown) {
  if (err instanceof SubjectError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[subjects]", err);
  return res.status(500).json({ error: "Subject operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SUBJECTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const active =
        req.query.active === "true"
          ? true
          : req.query.active === "false"
            ? false
            : undefined;

      const subjects = await listWorkspaceSubjects(req.auth!.workspaceId, {
        active,
        department: req.query.department ? String(req.query.department) : undefined,
        gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
      });

      return res.json(subjects);
    } catch (err) {
      return handleSubjectError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SUBJECTS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    if (!body.name || !body.code || !body.curriculumId || !body.phaseId || !body.gradeId) {
      return res.status(400).json({
        error: "name, code, curriculumId, phaseId, and gradeId are required",
      });
    }

    try {
      const subject = await createWorkspaceSubject(
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          name: String(body.name),
          code: String(body.code),
          curriculumId: String(body.curriculumId),
          phaseId: String(body.phaseId),
          gradeId: String(body.gradeId),
          catalogSubjectId: body.catalogSubjectId ?? null,
          department: body.department ?? null,
        }
      );

      await logAudit({
        action: "SUBJECT_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { subjectId: subject.id, code: subject.code },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(subject);
    } catch (err) {
      return handleSubjectError(res, err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SUBJECTS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    try {
      const subject = await updateWorkspaceSubject(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          name: body.name != null ? String(body.name) : undefined,
          code: body.code != null ? String(body.code) : undefined,
          curriculumId: body.curriculumId != null ? String(body.curriculumId) : undefined,
          phaseId: body.phaseId != null ? String(body.phaseId) : undefined,
          gradeId: body.gradeId != null ? String(body.gradeId) : undefined,
          catalogSubjectId: body.catalogSubjectId,
          department: body.department,
          active: body.active != null ? Boolean(body.active) : undefined,
        }
      );

      await logAudit({
        action: "SUBJECT_UPDATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { subjectId: subject.id },
        ...auditRequestMeta(req),
      });

      return res.json(subject);
    } catch (err) {
      return handleSubjectError(res, err);
    }
  }
);

router.post(
  "/:id/archive",
  requireAuth,
  requirePermission(PERMISSIONS.SUBJECTS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const subject = await archiveWorkspaceSubject(
        req.auth!.workspaceId,
        String(req.params.id)
      );

      await logAudit({
        action: "SUBJECT_ARCHIVED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { subjectId: subject.id, code: subject.code },
        ...auditRequestMeta(req),
      });

      return res.json(subject);
    } catch (err) {
      return handleSubjectError(res, err);
    }
  }
);

export default router;
