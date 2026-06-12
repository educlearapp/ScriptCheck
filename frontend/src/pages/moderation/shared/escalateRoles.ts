import type { WorkspaceRole } from "../../../types";

export const ESCALATE_ROLES: { value: WorkspaceRole; label: string }[] = [
  { value: "MODERATOR", label: "Moderator" },
  { value: "EXAMINATION_OFFICER", label: "Examination Officer" },
  { value: "PRINCIPAL", label: "Principal" },
];
