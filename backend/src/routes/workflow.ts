import { Router } from "express";
import { WORKFLOW_ACTIONS, WorkflowTransitionAction } from "../core/workflow/workflowTypes";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  executeWorkflowTransition,
  getAssessmentWorkflowState,
  getWorkspaceWorkflowStages,
  saveWorkspaceWorkflowConfig,
  WorkflowError,
} from "../core/workflow/workflowEngine";
import { DEFAULT_WORKFLOW_STAGES } from "../core/workflow/workflowStages";

const router = Router();

router.get(
  "/stages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const stages = await getWorkspaceWorkflowStages(req.auth!.workspaceId);
      return res.json({ stages });
    } catch (err) {
      console.error("[workflow/stages]", err);
      return res.status(500).json({ error: "Failed to load workflow stages" });
    }
  }
);

router.put(
  "/stages",
  requireAuth,
  requirePermission(PERMISSIONS.WORKFLOW_CONFIGURE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const stages = req.body?.stages ?? DEFAULT_WORKFLOW_STAGES;
      const config = await saveWorkspaceWorkflowConfig(
        req.auth!.workspaceId,
        stages
      );
      await logAudit({
        action: "WORKFLOW_CONFIG_UPDATED",
        workspaceId: req.auth!.workspaceId,
        actorId: req.auth!.userId,
        ...auditRequestMeta(req),
      });
      return res.json({ config });
    } catch (err) {
      console.error("[workflow/stages PUT]", err);
      return res.status(500).json({ error: "Failed to save workflow config" });
    }
  }
);

router.get(
  "/assessments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSESSMENTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const state = await getAssessmentWorkflowState(
        String(req.params.id),
        req.auth!.workspaceId
      );
      return res.json(state);
    } catch (err) {
      if (err instanceof WorkflowError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[workflow/assessment]", err);
      return res.status(500).json({ error: "Failed to load workflow state" });
    }
  }
);

router.post(
  "/assessments/:id/transition",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const action = req.body?.action as WorkflowTransitionAction;
      if (!WORKFLOW_ACTIONS.includes(action)) {
        return res.status(400).json({ error: "Invalid workflow action" });
      }

      const result = await executeWorkflowTransition({
        assessmentId: String(req.params.id),
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        access: req.access!,
        action,
        comment: req.body?.comment,
      });

      await logAudit({
        action: "WORKFLOW_TRANSITION",
        workspaceId: req.auth!.workspaceId,
        actorId: req.auth!.userId,
        metadata: {
          assessmentId: req.params.id,
          action,
          from: result.workflow.fromStage.key,
          to: result.workflow.toStage.key,
        },
        ...auditRequestMeta(req),
      });

      return res.json(result);
    } catch (err) {
      if (err instanceof WorkflowError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[workflow/transition]", err);
      return res.status(500).json({ error: "Workflow transition failed" });
    }
  }
);

export default router;
