import { AssessmentStatus, LearnerScriptStatus, ScriptBatchStatus } from "@prisma/client";

/** User-facing status labels. Internal enum values are preserved for migration compatibility. */
const ASSESSMENT_STATUS_LABELS: Partial<Record<AssessmentStatus, string>> = {
  SUBMITTED_TO_HOD: "Submitted to DH",
  HOD_REVIEW: "DH Review",
  RETURNED_TO_TEACHER: "Returned to Teacher",
};

const SCRIPT_BATCH_STATUS_LABELS: Partial<Record<ScriptBatchStatus, string>> = {
  SUBMITTED_TO_HOD: "Submitted to DH",
  HOD_REVIEW: "DH Review",
  RETURNED_TO_TEACHER: "Returned to Teacher",
};

const LEARNER_SCRIPT_STATUS_LABELS: Partial<Record<LearnerScriptStatus, string>> = {
  SUBMITTED_TO_HOD: "Submitted to DH",
  HOD_REVIEW: "DH Review",
  MODERATED: "DH Moderated",
};

export function formatStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function getAssessmentStatusLabel(status: AssessmentStatus): string {
  return ASSESSMENT_STATUS_LABELS[status] ?? formatStatusLabel(status);
}

export function getScriptBatchStatusLabel(status: ScriptBatchStatus): string {
  return SCRIPT_BATCH_STATUS_LABELS[status] ?? formatStatusLabel(status);
}

export function getLearnerScriptStatusLabel(status: LearnerScriptStatus): string {
  return LEARNER_SCRIPT_STATUS_LABELS[status] ?? formatStatusLabel(status);
}
