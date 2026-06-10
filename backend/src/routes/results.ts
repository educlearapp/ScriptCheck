import { Router } from "express";
import { AssessmentStatus } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { listDepartmentResults } from "../services/academicDashboard";
import { PERMISSIONS } from "../services/permissions";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const status = req.query.status
      ? (String(req.query.status) as AssessmentStatus)
      : undefined;

    if (status && !Object.values(AssessmentStatus).includes(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    try {
      const items = await listDepartmentResults(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!,
        {
          curriculumId: req.query.curriculumId
            ? String(req.query.curriculumId)
            : undefined,
          phaseId: req.query.phaseId ? String(req.query.phaseId) : undefined,
          gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
          subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
          teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
          status,
        }
      );
      return res.json(items);
    } catch (err) {
      console.error("[results]", err);
      return res.status(500).json({ error: "Failed to list results" });
    }
  }
);

export default router;
