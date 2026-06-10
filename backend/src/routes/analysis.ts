import { Router, type Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  getClassAnalysis,
  getGradeAnalysis,
  getLearnerPerformanceHistory,
  getSubjectAnalysis,
} from "../services/academicAnalysis";
import { ResultsError } from "../services/assessmentResults";
import { listAtRiskLearners } from "../services/atRisk";
import { getSchoolAcademicTrends } from "../services/academicTrends";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ResultsError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[analysis]", err);
  return res.status(500).json({ error: "Analysis request failed" });
}

router.get(
  "/assessments/:assessmentId/class",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getClassAnalysis(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.access!,
        req.auth!.userId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/subject",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getSubjectAnalysis(
        req.auth!.workspaceId,
        req.access!,
        {
          subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
          term: req.query.term ? String(req.query.term) : undefined,
          assessmentId: req.query.assessmentId
            ? String(req.query.assessmentId)
            : undefined,
        },
        req.auth!.userId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/grade/:gradeId",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getGradeAnalysis(
        req.auth!.workspaceId,
        String(req.params.gradeId),
        req.access!,
        req.auth!.userId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/history",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getLearnerPerformanceHistory(
        req.auth!.workspaceId,
        String(req.params.learnerId),
        req.access!,
        req.auth!.userId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/at-risk",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const learners = await listAtRiskLearners(req.auth!.workspaceId);
      return res.json(learners);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/trends",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getSchoolAcademicTrends(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
