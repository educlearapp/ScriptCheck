import { apiFetch } from "../api";
import type { WorkflowStage } from "../types/phase2";

export function fetchWorkflowStages() {
  return apiFetch<{ stages: WorkflowStage[] }>("/workflow/stages");
}

export function saveWorkflowStages(stages: WorkflowStage[]) {
  return apiFetch("/workflow/stages", {
    method: "PUT",
    body: JSON.stringify({ stages }),
  });
}

export function fetchAssessmentWorkflow(assessmentId: string) {
  return apiFetch<{
    currentStatus: string;
    currentStage: WorkflowStage | null;
    nextStage: WorkflowStage | null;
    stages: WorkflowStage[];
    availableActions: string[];
    auditTrail: unknown[];
  }>(`/workflow/assessments/${assessmentId}`);
}

export function executeWorkflowTransition(
  assessmentId: string,
  action: string,
  comment?: string
) {
  return apiFetch(`/workflow/assessments/${assessmentId}/transition`, {
    method: "POST",
    body: JSON.stringify({ action, comment }),
  });
}
