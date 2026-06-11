export const WORKFLOW_ACTIONS = [
  "SUBMIT",
  "APPROVE",
  "RETURN",
  "PUBLISH",
  "ARCHIVE",
] as const;

export type WorkflowTransitionAction = (typeof WORKFLOW_ACTIONS)[number];
