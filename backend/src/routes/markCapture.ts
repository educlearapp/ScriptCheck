import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta } from "../services/auditLog";
import { canAccessResults, ResultsError } from "../services/assessmentResults";
import { prisma } from "../prisma";
import {
  getBulkCaptureGrid,
  listMarksForAssessment,
  listMarksForLearner,
  saveBulkCaptureMarks,
} from "../services/markCapture";
import { refreshAssessmentAnalytics } from "../services/markImport";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ResultsError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[mark-capture]", err);
  return res.status(500).json({ error: "Mark capture operation failed" });
}

router.get(
  "/assessments/:assessmentId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const marks = await listMarksForAssessment(
        req.auth!.workspaceId,
        String(req.params.assessmentId)
      );
      return res.json(marks);
    } catch (err) {
      console.error("[mark-capture/assessment]", err);
      return res.status(500).json({ error: "Failed to load captured marks" });
    }
  }
);

router.get(
  "/learners/:learnerId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const marks = await listMarksForLearner(
        req.auth!.workspaceId,
        String(req.params.learnerId)
      );
      return res.json(marks);
    } catch (err) {
      console.error("[mark-capture/learner]", err);
      return res.status(500).json({ error: "Failed to load learner mark history" });
    }
  }
);

router.get(
  "/assessments/:assessmentId/grid",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.assessmentId);
      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, workspaceId: req.auth!.workspaceId },
        select: { creatorTeacherId: true },
      });
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      if (
        !canAccessResults(
          req.access!,
          req.auth!.workspaceId,
          assessment.creatorTeacherId
        )
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const grid = await getBulkCaptureGrid(req.auth!.workspaceId, assessmentId);
      return res.json(grid);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.put(
  "/assessments/:assessmentId/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_IMPORT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assessmentId = String(req.params.assessmentId);
      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, workspaceId: req.auth!.workspaceId },
        select: { creatorTeacherId: true, totalMarks: true },
      });
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      if (
        !canAccessResults(
          req.access!,
          req.auth!.workspaceId,
          assessment.creatorTeacherId
        )
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { entries } = req.body as {
        entries: Array<{ learnerId: string; mark: number | null; comment?: string | null }>;
      };

      if (!entries?.length) {
        return res.status(400).json({ error: "entries are required" });
      }

      const result = await saveBulkCaptureMarks(
        req.auth!.workspaceId,
        assessmentId,
        req.auth!.userId,
        entries,
        auditRequestMeta(req)
      );

      await refreshAssessmentAnalytics(
        assessmentId,
        req.auth!.workspaceId,
        req.access!
      );

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
