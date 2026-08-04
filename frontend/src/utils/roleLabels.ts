import type { WorkspaceRole } from "../types";

/** User-facing role labels. Internal enum values (e.g. HOD) are preserved for migration compatibility. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  TEACHER: "Teacher",
  HOD: "Department Head",
  MODERATOR: "Moderator",
  EXAMINATION_OFFICER: "Examination Officer",
  PRINCIPAL: "Principal",
  SCHOOL_ADMIN: "School Admin",
  SCHOOL_OWNER: "School Owner",
  EXAM_BODY_ADMIN: "Exam Body Admin",
  EXAMINATION_BODY: "Examination Body",
};

const ROLE_DESCRIPTIONS: Partial<Record<WorkspaceRole, string>> = {
  HOD: "Department Head",
};

export function getRoleLabel(role: WorkspaceRole | string): string {
  return WORKSPACE_ROLE_LABELS[role as WorkspaceRole] ?? role.replaceAll("_", " ");
}

export function getRoleDisplay(role: WorkspaceRole | string): string {
  const label = getRoleLabel(role);
  const desc = ROLE_DESCRIPTIONS[role as WorkspaceRole];
  return desc ? `${label} (${desc})` : label;
}
