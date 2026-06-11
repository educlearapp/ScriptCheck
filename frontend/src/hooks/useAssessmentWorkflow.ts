import { useCallback, useEffect, useState } from "react";
import {
  executeWorkflowTransition,
  fetchAssessmentWorkflow,
} from "../services/workflowApi";
import type { WorkflowStage } from "../types/phase2";

type WorkflowAudit = {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  createdAt: string;
  performedBy: { id: string; fullName: string };
};

export function useAssessmentWorkflow(assessmentId: string | undefined) {
  const [currentStage, setCurrentStage] = useState<WorkflowStage | null>(null);
  const [nextStage, setNextStage] = useState<WorkflowStage | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [auditTrail, setAuditTrail] = useState<WorkflowAudit[]>([]);
  const [currentStatus, setCurrentStatus] = useState("");
  const [loading, setLoading] = useState(Boolean(assessmentId));
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAssessmentWorkflow(assessmentId);
      setCurrentStage(data.currentStage);
      setNextStage(data.nextStage);
      setStages(data.stages);
      setAvailableActions(data.availableActions);
      setAuditTrail(data.auditTrail as WorkflowAudit[]);
      setCurrentStatus(data.currentStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const transition = useCallback(
    async (action: string, comment?: string) => {
      if (!assessmentId) return false;
      setTransitioning(true);
      setError("");
      try {
        await executeWorkflowTransition(assessmentId, action, comment);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Workflow action failed");
        return false;
      } finally {
        setTransitioning(false);
      }
    },
    [assessmentId, refresh]
  );

  return {
    currentStage,
    nextStage,
    stages,
    availableActions,
    auditTrail,
    currentStatus,
    loading,
    transitioning,
    error,
    refresh,
    transition,
  };
}
