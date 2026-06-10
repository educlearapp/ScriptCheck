import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { createLearner, listLearners, ScriptError } from "../services/scriptMarking";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ScriptError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[learners]", err);
  return res.status(500).json({ error: "Learner operation failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const learners = await listLearners(
        req.auth!.workspaceId,
        req.query.gradeId ? String(req.query.gradeId) : undefined
      );
      return res.json(learners);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SCRIPTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.learnerNumber || !body.firstName || !body.lastName || !body.gradeId) {
      return res.status(400).json({
        error: "learnerNumber, firstName, lastName, and gradeId are required",
      });
    }

    try {
      const learner = await createLearner(req.auth!.workspaceId, {
        learnerNumber: String(body.learnerNumber),
        firstName: String(body.firstName),
        lastName: String(body.lastName),
        gradeId: String(body.gradeId),
        className: body.className,
      });
      return res.status(201).json(learner);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
