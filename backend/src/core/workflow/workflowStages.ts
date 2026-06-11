import { AssessmentStatus, WorkspaceRole } from "@prisma/client";

export type WorkflowStageKey =
  | "draft"
  | "under_review"
  | "moderation"
  | "approved"
  | "published"
  | "archived";

export type WorkflowStageDefinition = {
  key: WorkflowStageKey;
  label: string;
  mappedStatus: AssessmentStatus;
  responsibleRoles: WorkspaceRole[];
  orderIndex: number;
  isTerminal: boolean;
  allowedActions: ("submit" | "approve" | "return" | "publish" | "archive")[];
};

/** Default lifecycle: Teacher → HOD → Moderator → Examination Body → Published */
export const DEFAULT_WORKFLOW_STAGES: WorkflowStageDefinition[] = [
  {
    key: "draft",
    label: "Draft",
    mappedStatus: AssessmentStatus.DRAFT,
    responsibleRoles: [WorkspaceRole.TEACHER],
    orderIndex: 0,
    isTerminal: false,
    allowedActions: ["submit"],
  },
  {
    key: "under_review",
    label: "Under Review",
    mappedStatus: AssessmentStatus.SUBMITTED_TO_HOD,
    responsibleRoles: [WorkspaceRole.HOD],
    orderIndex: 1,
    isTerminal: false,
    allowedActions: ["approve", "return"],
  },
  {
    key: "moderation",
    label: "Moderation",
    mappedStatus: AssessmentStatus.HOD_REVIEW,
    responsibleRoles: [WorkspaceRole.MODERATOR, WorkspaceRole.HOD],
    orderIndex: 2,
    isTerminal: false,
    allowedActions: ["approve", "return"],
  },
  {
    key: "approved",
    label: "Approved",
    mappedStatus: AssessmentStatus.APPROVED,
    responsibleRoles: [
      WorkspaceRole.EXAMINATION_BODY,
      WorkspaceRole.EXAM_BODY_ADMIN,
      WorkspaceRole.EXAMINATION_OFFICER,
    ],
    orderIndex: 3,
    isTerminal: false,
    allowedActions: ["publish", "return"],
  },
  {
    key: "published",
    label: "Published",
    mappedStatus: AssessmentStatus.PUBLISHED,
    responsibleRoles: [WorkspaceRole.PRINCIPAL, WorkspaceRole.SCHOOL_OWNER],
    orderIndex: 4,
    isTerminal: false,
    allowedActions: ["archive"],
  },
  {
    key: "archived",
    label: "Archived",
    mappedStatus: AssessmentStatus.ARCHIVED,
    responsibleRoles: [WorkspaceRole.SCHOOL_OWNER, WorkspaceRole.SCHOOL_ADMIN],
    orderIndex: 5,
    isTerminal: true,
    allowedActions: [],
  },
];

export const STATUS_TO_STAGE_KEY: Partial<Record<AssessmentStatus, WorkflowStageKey>> = {
  [AssessmentStatus.DRAFT]: "draft",
  [AssessmentStatus.RETURNED_TO_TEACHER]: "draft",
  [AssessmentStatus.SUBMITTED_TO_HOD]: "under_review",
  [AssessmentStatus.UNDER_REVIEW]: "under_review",
  [AssessmentStatus.HOD_REVIEW]: "moderation",
  [AssessmentStatus.MODERATION]: "moderation",
  [AssessmentStatus.AI_REVIEW]: "moderation",
  [AssessmentStatus.APPROVED]: "approved",
  [AssessmentStatus.WRITTEN]: "approved",
  [AssessmentStatus.MARKING]: "approved",
  [AssessmentStatus.MARKED]: "approved",
  [AssessmentStatus.PUBLISHED]: "published",
  [AssessmentStatus.ARCHIVED]: "archived",
};

export function getStageForStatus(
  status: AssessmentStatus,
  stages: WorkflowStageDefinition[] = DEFAULT_WORKFLOW_STAGES
): WorkflowStageDefinition | undefined {
  const key = STATUS_TO_STAGE_KEY[status];
  if (key) {
    return stages.find((s) => s.key === key);
  }
  return stages.find((s) => s.mappedStatus === status);
}

export function getNextStage(
  currentKey: WorkflowStageKey,
  stages: WorkflowStageDefinition[] = DEFAULT_WORKFLOW_STAGES
): WorkflowStageDefinition | undefined {
  const current = stages.find((s) => s.key === currentKey);
  if (!current) return undefined;
  return stages.find((s) => s.orderIndex === current.orderIndex + 1);
}

export function getPreviousStage(
  currentKey: WorkflowStageKey,
  stages: WorkflowStageDefinition[] = DEFAULT_WORKFLOW_STAGES
): WorkflowStageDefinition | undefined {
  const current = stages.find((s) => s.key === currentKey);
  if (!current || current.orderIndex === 0) return undefined;
  return stages.find((s) => s.orderIndex === current.orderIndex - 1);
}
