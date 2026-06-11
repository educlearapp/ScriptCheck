export const FEEDBACK_CATEGORIES = [
  { value: "BUG_REPORT", label: "Bug Report" },
  { value: "WORKFLOW_ISSUE", label: "Workflow Issue" },
  { value: "SUGGESTION", label: "Suggestion" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "CONFUSING_SCREEN", label: "Confusing Screen" },
] as const;

export const FEEDBACK_SEVERITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export const FEEDBACK_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "FIXED", label: "Fixed" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number]["value"];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]["value"];
