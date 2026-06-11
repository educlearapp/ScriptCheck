import { WorkspaceRole } from "@prisma/client";

/** User-facing role labels. Internal enum values (e.g. HOD) are preserved for migration compatibility. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  TEACHER: "Teacher",
  HOD: "DH",
  MODERATOR: "Moderator",
  EXAMINATION_OFFICER: "Examination Officer",
  PRINCIPAL: "Principal",
  SCHOOL_ADMIN: "School Admin",
  SCHOOL_OWNER: "School Owner",
  EXAM_BODY_ADMIN: "Exam Body Admin",
  EXAMINATION_BODY: "Examination Body",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Partial<Record<WorkspaceRole, string>> = {
  HOD: "Department Head",
};

export function getRoleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_LABELS[role] ?? role;
}

export function getRoleDisplay(role: WorkspaceRole): string {
  const label = getRoleLabel(role);
  const desc = WORKSPACE_ROLE_DESCRIPTIONS[role];
  return desc ? `${label} (${desc})` : label;
}
