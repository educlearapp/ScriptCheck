import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { getMarkingOverview } from "../services/markingOverview";
import { createMarkingPack, finalizeQuickScan, reextractQuickScanQuestions } from "../services/markingPack";
import {
  getMarkingWorkbenchState,
  listMarkingJobs,
  prepareMarkingJob,
} from "../services/markingWorkbench";
import { ScriptError } from "../services/scriptMarking";
import { auditRequestMeta, logAudit } from "../services/auditLog";

const router = Router();

router.post(
  "/pack/:assessmentId/finalize-quick-scan",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_EDIT_OWN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await finalizeQuickScan(
        String(req.params.assessmentId),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "WORKFLOW_TRANSITION",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          assessmentId: result.assessmentId,
          markingPack: true,
          finalizeQuickScan: true,
          questionsCreated: result.questionsCreated,
          scriptMarksInitialized: result.scriptMarksInitialized,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[marking/pack/finalize-quick-scan]", err);
      return res.status(500).json({ error: "Failed to finalize Quick Scan" });
    }
  }
);

router.post(
  "/pack/:assessmentId/reextract-questions",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_EDIT_OWN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await reextractQuickScanQuestions(
        String(req.params.assessmentId),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "WORKFLOW_TRANSITION",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          assessmentId: result.assessmentId,
          markingPack: true,
          reextractQuickScan: true,
          questionsCreated: result.questionsCreated,
          memoAnswersReady: result.memoAnswersReady,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[marking/pack/reextract-questions]", err);
      return res.status(500).json({ error: "Failed to re-extract Quick Scan questions" });
    }
  }
);

router.post(
  "/pack",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_CREATE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const pack = await createMarkingPack(req.auth!.workspaceId, req.auth!.userId, {
        title: String(body.title ?? ""),
        curriculumId: String(body.curriculumId ?? ""),
        phaseId: String(body.phaseId ?? ""),
        gradeId: String(body.gradeId ?? ""),
        subjectId: String(body.subjectId ?? ""),
        term: body.term != null ? String(body.term) : undefined,
        pagesPerScript: body.pagesPerScript,
        totalMarks: body.totalMarks,
        questionCount: body.questionCount,
        scriptFormat: body.scriptFormat,
        markingMode: body.markingMode,
      });

      await logAudit({
        action: "ASSESSMENT_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { assessmentId: pack.assessmentId, markingPack: true, batchId: pack.batchId },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(pack);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[marking/pack]", err);
      return res.status(500).json({ error: "Failed to create marking pack" });
    }
  }
);

router.post(
  "/jobs/:batchId/prepare",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_EDIT_OWN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await prepareMarkingJob(
        String(req.params.batchId),
        req.auth!.workspaceId
      );

      await logAudit({
        action: "WORKFLOW_TRANSITION",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: {
          batchId: data.batchId,
          assessmentId: data.assessmentId,
          markingWorkbenchPrepare: true,
          aiMarkingImplemented: true,
        },
        ...auditRequestMeta(req),
      });

      return res.json(data);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[marking/jobs/prepare]", err);
      return res.status(500).json({ error: "Failed to prepare marking job" });
    }
  }
);

router.get(
  "/jobs",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await listMarkingJobs(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[marking/jobs]", err);
      return res.status(500).json({ error: "Failed to load marking jobs" });
    }
  }
);

router.get(
  "/jobs/:batchId",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getMarkingWorkbenchState(
        String(req.params.batchId),
        req.auth!.workspaceId
      );
      return res.json(data);
    } catch (err) {
      if (err instanceof ScriptError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[marking/jobs/:batchId]", err);
      return res.status(500).json({ error: "Failed to load marking workbench" });
    }
  }
);

router.get(
  "/overview",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getMarkingOverview(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[marking/overview]", err);
      return res.status(500).json({ error: "Failed to load marking overview" });
    }
  }
);

export default router;
