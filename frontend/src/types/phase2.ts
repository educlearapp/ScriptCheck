/** Phase 2 domain types — kept modular to avoid bloating types/index.ts */

export type SubscriptionStatus = "ACTIVE" | "TRIAL" | "EXPIRED" | "SUSPENDED";

export type SubscriptionInfo = {
  plan: "TRIAL" | "PAID";
  status: SubscriptionStatus;
  trialExpiresAt: string | null;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  canExport: boolean;
  canPublish: boolean;
  watermarkRequired: boolean;
};

export type WorkflowStageKey =
  | "draft"
  | "under_review"
  | "moderation"
  | "approved"
  | "published"
  | "archived";

export type WorkflowStage = {
  key: WorkflowStageKey;
  label: string;
  mappedStatus: string;
  responsibleRoles: string[];
  orderIndex: number;
  isTerminal: boolean;
  allowedActions: string[];
};

export type IntelligenceReport = {
  assessmentId: string;
  complianceScore: number;
  capsCompliance: number;
  cognitiveBalance: number;
  missingRubrics: boolean;
  missingMemorandums: boolean;
  riskIndicators: Array<{
    code: string;
    severity: "low" | "medium" | "high";
    message: string;
  }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    category: string;
    message: string;
  }>;
  generatedAt: string;
};

export type ModeratorDashboardData = {
  role: "moderator";
  stats: {
    awaitingModeration: number;
    moderationCompleted: number;
    moderationOverdue: number;
    assessmentsAwaitingHod: number;
    varianceFlagged: number;
    moderationCompliance: number;
    pendingApprovals: number;
    lowComplianceCount: number;
  };
  moderationQueue: Array<{
    id: string;
    title: string;
    status: string;
    subject: string;
    creator: string;
    complianceScore: number | null;
    riskCount: number;
  }>;
  pendingApprovals: Array<{
    id: string;
    assignedRole: string;
    assessment: { id: string; title: string };
    requestedBy: { fullName: string };
  }>;
  lowComplianceAssessments: Array<{
    assessmentId: string;
    title: string;
    subject: string;
    complianceScore: number;
  }>;
};

export type ExaminationBodyDashboardData = {
  role: "examination_body";
  stats: {
    awaitingApproval: number;
    publishedCount: number;
    archivedCount: number;
    moderatedBatches: number;
    averageComplianceScore: number | null;
  };
  approvalPipeline: Array<{
    id: string;
    title: string;
    status: string;
    subject: string;
    grade: string;
    creator: string;
    complianceScore: number | null;
  }>;
  recentActivity: Array<{
    assessmentTitle: string;
    action: string;
    fromStatus: string;
    toStatus: string;
    performedBy: string;
    createdAt: string;
  }>;
};
