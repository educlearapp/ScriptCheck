import { WorkspaceRole } from "@prisma/client";

/**
 * Central permission registry — single source of truth.
 * Permissions are additive across roles; never hardcode checks in routes.
 */
export const PERMISSION_DEFINITIONS = {
  "assessments.view": { category: "assessments", label: "View assessments" },
  "assessments.create": { category: "assessments", label: "Create assessments" },
  "assessments.edit": { category: "assessments", label: "Edit any assessment" },
  "assessments.edit_own": { category: "assessments", label: "Edit own assessments" },
  "assessments.submit": { category: "assessments", label: "Submit for review" },
  "moderation.queue": { category: "moderation", label: "View moderation queue" },
  "moderation.approve": { category: "moderation", label: "Approve assessments" },
  "moderation.return": { category: "moderation", label: "Return assessments" },
  "moderation.comment": { category: "moderation", label: "Add moderation comments" },
  "moderation.request_approval": { category: "moderation", label: "Request approval" },
  "workflow.configure": { category: "workflow", label: "Configure workflow stages" },
  "workflow.transition": { category: "workflow", label: "Execute workflow transitions" },
  "intelligence.view": { category: "intelligence", label: "View intelligence reports" },
  "intelligence.generate": { category: "intelligence", label: "Generate intelligence" },
  "users.view": { category: "users", label: "View users" },
  "users.manage": { category: "users", label: "Manage users" },
  "users.invite": { category: "users", label: "Invite users" },
  "roles.assign": { category: "users", label: "Assign roles" },
  "curriculum.view": { category: "curriculum", label: "View curriculum" },
  "curriculum.manage": { category: "curriculum", label: "Manage curriculum" },
  "examinations.view": { category: "examinations", label: "View examinations" },
  "examinations.manage": { category: "examinations", label: "Manage examinations" },
  "workspace.manage": { category: "workspace", label: "Manage workspace" },
  "audit.view": { category: "audit", label: "View audit logs" },
  "subscription.manage": { category: "subscription", label: "Manage subscription" },
  "export.assessment_pack": { category: "export", label: "Export assessment packs" },
  "questionBank.view": { category: "questionBank", label: "View question library" },
  "questionBank.create": { category: "questionBank", label: "Create questions" },
  "questionBank.edit": { category: "questionBank", label: "Edit questions" },
  "questionBank.approve": { category: "questionBank", label: "Approve questions" },
  "questionBank.archive": { category: "questionBank", label: "Archive questions" },
  "curriculumTopics.manage": { category: "curriculum", label: "Manage topics" },
  "assessmentTemplates.view": { category: "templates", label: "View templates" },
  "assessmentTemplates.create": { category: "templates", label: "Create templates" },
  "assessmentTemplates.use": { category: "templates", label: "Use templates" },
  "assessmentTemplates.archive": { category: "templates", label: "Archive templates" },
  "scripts.view": { category: "scripts", label: "View scripts" },
  "scripts.create": { category: "scripts", label: "Create script batches" },
  "scripts.mark": { category: "scripts", label: "Mark scripts" },
  "scripts.submit": { category: "scripts", label: "Submit scripts" },
  "scripts.moderate": { category: "scripts", label: "Moderate scripts" },
  "scripts.approve": { category: "scripts", label: "Approve scripts" },
  "scripts.finalise": { category: "scripts", label: "Finalise scripts" },
  "examSession.view": { category: "examSession", label: "View exam sessions" },
  "examSession.manage": { category: "examSession", label: "Manage exam sessions" },
  "results.view": { category: "results", label: "View results" },
  "results.export": { category: "results", label: "Export results" },
  "results.publish": { category: "results", label: "Publish results" },
  "results.reopen": { category: "results", label: "Reopen results" },
  "dashboard.academic.view": { category: "dashboard", label: "View academic dashboard" },
  "feedback.create": { category: "feedback", label: "Create feedback" },
  "feedback.view": { category: "feedback", label: "View feedback" },
  "betaFeedback.create": { category: "beta", label: "Submit beta feedback" },
  "betaFeedback.view": { category: "beta", label: "View beta feedback" },
  "betaFeedback.manage": { category: "beta", label: "Manage beta feedback" },
  "reports.generate": { category: "reports", label: "Generate reports" },
  "subjects.view": { category: "subjects", label: "View subjects" },
  "subjects.manage": { category: "subjects", label: "Manage subjects" },
  "rubrics.view": { category: "rubrics", label: "View rubrics" },
  "rubrics.create": { category: "rubrics", label: "Create rubrics" },
  "rubrics.approve": { category: "rubrics", label: "Approve rubrics" },
  "schedule.view": { category: "schedule", label: "View schedule" },
  "paperVault.view": { category: "paperVault", label: "View paper vault" },
  "paperVault.upload": { category: "paperVault", label: "Upload papers" },
  "paperVault.review": { category: "paperVault", label: "Review papers" },
  "paperVault.approve": { category: "paperVault", label: "Approve papers" },
  "paperVault.lock": { category: "paperVault", label: "Lock papers" },
  "paperVault.release": { category: "paperVault", label: "Release papers" },
  "paperVault.archive": { category: "paperVault", label: "Archive papers" },
  "concessions.view": { category: "concessions", label: "View concessions" },
  "concessions.manage": { category: "concessions", label: "Manage concessions" },
  "marks.import": { category: "marks", label: "Import marks" },
  "marks.audit": { category: "marks", label: "View mark audit trail" },
  "timetable.view": { category: "timetable", label: "View school timetable setup" },
  "timetable.manage": { category: "timetable", label: "Manage school timetable setup" },
  "timetable.publish": { category: "timetable", label: "Publish school timetables" },
} as const;

export type Permission = keyof typeof PERMISSION_DEFINITIONS;

export const PERMISSIONS = Object.fromEntries(
  Object.keys(PERMISSION_DEFINITIONS).map((key) => [
    key.replace(/\./g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase().replace(/\./g, "_"),
    key,
  ])
) as Record<string, Permission>;

// Build PERMISSIONS object with stable SCREAMING_SNAKE keys matching existing code
export const P = {
  ASSESSMENTS_VIEW: "assessments.view",
  ASSESSMENTS_CREATE: "assessments.create",
  ASSESSMENTS_EDIT: "assessments.edit",
  ASSESSMENTS_EDIT_OWN: "assessments.edit_own",
  ASSESSMENTS_SUBMIT: "assessments.submit",
  MODERATION_QUEUE: "moderation.queue",
  MODERATION_APPROVE: "moderation.approve",
  MODERATION_RETURN: "moderation.return",
  MODERATION_COMMENT: "moderation.comment",
  MODERATION_REQUEST_APPROVAL: "moderation.request_approval",
  WORKFLOW_CONFIGURE: "workflow.configure",
  WORKFLOW_TRANSITION: "workflow.transition",
  INTELLIGENCE_VIEW: "intelligence.view",
  INTELLIGENCE_GENERATE: "intelligence.generate",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  USERS_INVITE: "users.invite",
  ROLES_ASSIGN: "roles.assign",
  CURRICULUM_VIEW: "curriculum.view",
  CURRICULUM_MANAGE: "curriculum.manage",
  EXAMINATIONS_VIEW: "examinations.view",
  EXAMINATIONS_MANAGE: "examinations.manage",
  WORKSPACE_MANAGE: "workspace.manage",
  AUDIT_VIEW: "audit.view",
  SUBSCRIPTION_MANAGE: "subscription.manage",
  EXPORT_ASSESSMENT_PACK: "export.assessment_pack",
  QUESTION_BANK_VIEW: "questionBank.view",
  QUESTION_BANK_CREATE: "questionBank.create",
  QUESTION_BANK_EDIT: "questionBank.edit",
  QUESTION_BANK_APPROVE: "questionBank.approve",
  QUESTION_BANK_ARCHIVE: "questionBank.archive",
  CURRICULUM_TOPICS_MANAGE: "curriculumTopics.manage",
  ASSESSMENT_TEMPLATES_VIEW: "assessmentTemplates.view",
  ASSESSMENT_TEMPLATES_CREATE: "assessmentTemplates.create",
  ASSESSMENT_TEMPLATES_USE: "assessmentTemplates.use",
  ASSESSMENT_TEMPLATES_ARCHIVE: "assessmentTemplates.archive",
  SCRIPTS_VIEW: "scripts.view",
  SCRIPTS_CREATE: "scripts.create",
  SCRIPTS_MARK: "scripts.mark",
  SCRIPTS_SUBMIT: "scripts.submit",
  SCRIPTS_MODERATE: "scripts.moderate",
  SCRIPTS_APPROVE: "scripts.approve",
  SCRIPTS_FINALISE: "scripts.finalise",
  EXAM_SESSION_VIEW: "examSession.view",
  EXAM_SESSION_MANAGE: "examSession.manage",
  RESULTS_VIEW: "results.view",
  RESULTS_EXPORT: "results.export",
  RESULTS_PUBLISH: "results.publish",
  RESULTS_REOPEN: "results.reopen",
  DASHBOARD_ACADEMIC_VIEW: "dashboard.academic.view",
  FEEDBACK_CREATE: "feedback.create",
  FEEDBACK_VIEW: "feedback.view",
  BETA_FEEDBACK_CREATE: "betaFeedback.create",
  BETA_FEEDBACK_VIEW: "betaFeedback.view",
  BETA_FEEDBACK_MANAGE: "betaFeedback.manage",
  REPORTS_GENERATE: "reports.generate",
  SUBJECTS_VIEW: "subjects.view",
  SUBJECTS_MANAGE: "subjects.manage",
  RUBRICS_VIEW: "rubrics.view",
  RUBRICS_CREATE: "rubrics.create",
  RUBRICS_APPROVE: "rubrics.approve",
  SCHEDULE_VIEW: "schedule.view",
  PAPER_VAULT_VIEW: "paperVault.view",
  PAPER_VAULT_UPLOAD: "paperVault.upload",
  PAPER_VAULT_REVIEW: "paperVault.review",
  PAPER_VAULT_APPROVE: "paperVault.approve",
  PAPER_VAULT_LOCK: "paperVault.lock",
  PAPER_VAULT_RELEASE: "paperVault.release",
  PAPER_VAULT_ARCHIVE: "paperVault.archive",
  CONCESSIONS_VIEW: "concessions.view",
  CONCESSIONS_MANAGE: "concessions.manage",
  MARKS_IMPORT: "marks.import",
  MARKS_AUDIT: "marks.audit",
  TIMETABLE_VIEW: "timetable.view",
  TIMETABLE_MANAGE: "timetable.manage",
  TIMETABLE_PUBLISH: "timetable.publish",
} as const satisfies Record<string, Permission>;

const teacherPermissions: Permission[] = [
  P.ASSESSMENTS_VIEW, P.ASSESSMENTS_CREATE, P.ASSESSMENTS_EDIT_OWN, P.ASSESSMENTS_SUBMIT,
  P.CURRICULUM_VIEW, P.QUESTION_BANK_VIEW, P.QUESTION_BANK_CREATE,
  P.ASSESSMENT_TEMPLATES_VIEW, P.ASSESSMENT_TEMPLATES_CREATE, P.ASSESSMENT_TEMPLATES_USE,
  P.SCRIPTS_VIEW, P.SCRIPTS_CREATE, P.SCRIPTS_MARK, P.SCRIPTS_SUBMIT,
  P.RESULTS_VIEW, P.RESULTS_EXPORT, P.DASHBOARD_ACADEMIC_VIEW,
  P.FEEDBACK_CREATE, P.FEEDBACK_VIEW, P.BETA_FEEDBACK_CREATE, P.REPORTS_GENERATE,
  P.EXAM_SESSION_VIEW, P.SUBJECTS_VIEW, P.RUBRICS_VIEW, P.RUBRICS_CREATE, P.SCHEDULE_VIEW,
  P.PAPER_VAULT_VIEW, P.PAPER_VAULT_UPLOAD, P.CONCESSIONS_VIEW, P.MARKS_IMPORT,
  P.MODERATION_COMMENT, P.INTELLIGENCE_VIEW, P.TIMETABLE_VIEW,
];

const hodPermissions: Permission[] = [
  ...teacherPermissions.filter((p) => p !== P.ASSESSMENTS_EDIT_OWN),
  P.ASSESSMENTS_EDIT, P.MODERATION_QUEUE, P.MODERATION_APPROVE, P.MODERATION_RETURN,
  P.QUESTION_BANK_EDIT, P.QUESTION_BANK_APPROVE, P.QUESTION_BANK_ARCHIVE,
  P.ASSESSMENT_TEMPLATES_ARCHIVE, P.SCRIPTS_MODERATE, P.SCRIPTS_APPROVE,
  P.RESULTS_PUBLISH, P.RESULTS_REOPEN, P.EXAMINATIONS_VIEW,
  P.SUBJECTS_MANAGE, P.RUBRICS_APPROVE, P.PAPER_VAULT_REVIEW, P.PAPER_VAULT_APPROVE,
  P.PAPER_VAULT_LOCK, P.CONCESSIONS_MANAGE, P.WORKFLOW_TRANSITION,
  P.MODERATION_REQUEST_APPROVAL, P.MARKS_AUDIT, P.INTELLIGENCE_GENERATE,
  P.BETA_FEEDBACK_VIEW, P.BETA_FEEDBACK_MANAGE,
  P.TIMETABLE_VIEW, P.TIMETABLE_MANAGE, P.TIMETABLE_PUBLISH,
];

const moderatorPermissions: Permission[] = [
  P.ASSESSMENTS_VIEW, P.MODERATION_QUEUE, P.MODERATION_APPROVE, P.MODERATION_RETURN,
  P.MODERATION_COMMENT, P.MODERATION_REQUEST_APPROVAL,
  P.CURRICULUM_VIEW, P.QUESTION_BANK_VIEW, P.QUESTION_BANK_CREATE, P.QUESTION_BANK_APPROVE,
  P.SCRIPTS_VIEW, P.SCRIPTS_MODERATE, P.SCRIPTS_APPROVE,
  P.RESULTS_VIEW, P.RESULTS_EXPORT, P.RESULTS_PUBLISH, P.RESULTS_REOPEN,
  P.DASHBOARD_ACADEMIC_VIEW, P.FEEDBACK_CREATE, P.FEEDBACK_VIEW, P.REPORTS_GENERATE,
  P.EXAMINATIONS_VIEW, P.EXAM_SESSION_VIEW, P.SCHEDULE_VIEW,
  P.PAPER_VAULT_VIEW, P.PAPER_VAULT_REVIEW, P.PAPER_VAULT_APPROVE,
  P.CONCESSIONS_VIEW, P.MARKS_IMPORT, P.MARKS_AUDIT,
  P.WORKFLOW_TRANSITION, P.INTELLIGENCE_VIEW, P.INTELLIGENCE_GENERATE,
];

const examinationOfficerPermissions: Permission[] = [
  P.EXAMINATIONS_VIEW, P.EXAMINATIONS_MANAGE, P.ASSESSMENTS_VIEW, P.CURRICULUM_VIEW,
  P.QUESTION_BANK_VIEW, P.QUESTION_BANK_CREATE, P.SCRIPTS_VIEW, P.RESULTS_VIEW,
  P.DASHBOARD_ACADEMIC_VIEW, P.FEEDBACK_VIEW, P.REPORTS_GENERATE,
  P.EXAM_SESSION_VIEW, P.EXAM_SESSION_MANAGE, P.SCHEDULE_VIEW,
  P.PAPER_VAULT_VIEW, P.CONCESSIONS_VIEW, P.MARKS_IMPORT, P.INTELLIGENCE_VIEW,
  P.TIMETABLE_VIEW,
];

const principalPermissions: Permission[] = [
  ...hodPermissions,
  P.USERS_VIEW, P.WORKSPACE_MANAGE, P.CURRICULUM_TOPICS_MANAGE,
  P.SCRIPTS_CREATE, P.SCRIPTS_MARK, P.SCRIPTS_SUBMIT, P.SCRIPTS_FINALISE,
  P.EXAMINATIONS_MANAGE, P.EXAM_SESSION_MANAGE,
  P.PAPER_VAULT_RELEASE, P.PAPER_VAULT_ARCHIVE, P.EXPORT_ASSESSMENT_PACK,
  P.WORKFLOW_CONFIGURE, P.BETA_FEEDBACK_VIEW, P.BETA_FEEDBACK_MANAGE,
  P.TIMETABLE_VIEW, P.TIMETABLE_MANAGE, P.TIMETABLE_PUBLISH,
];

const schoolAdminPermissions: Permission[] = [
  P.USERS_VIEW, P.USERS_MANAGE, P.USERS_INVITE, P.ROLES_ASSIGN,
  P.CURRICULUM_VIEW, P.CURRICULUM_MANAGE, P.WORKSPACE_MANAGE, P.AUDIT_VIEW,
  P.QUESTION_BANK_VIEW, P.QUESTION_BANK_CREATE, P.QUESTION_BANK_EDIT,
  P.QUESTION_BANK_APPROVE, P.QUESTION_BANK_ARCHIVE, P.CURRICULUM_TOPICS_MANAGE,
  P.ASSESSMENT_TEMPLATES_VIEW, P.ASSESSMENT_TEMPLATES_CREATE,
  P.ASSESSMENT_TEMPLATES_USE, P.ASSESSMENT_TEMPLATES_ARCHIVE,
  P.SCRIPTS_VIEW, P.SCRIPTS_MODERATE, P.SCRIPTS_APPROVE, P.SCRIPTS_FINALISE,
  P.RESULTS_VIEW, P.RESULTS_EXPORT, P.RESULTS_PUBLISH, P.RESULTS_REOPEN,
  P.DASHBOARD_ACADEMIC_VIEW, P.FEEDBACK_CREATE, P.FEEDBACK_VIEW, P.REPORTS_GENERATE,
  P.EXAMINATIONS_VIEW, P.EXAMINATIONS_MANAGE, P.EXAM_SESSION_VIEW, P.EXAM_SESSION_MANAGE,
  P.SUBJECTS_VIEW, P.SUBJECTS_MANAGE, P.RUBRICS_VIEW, P.RUBRICS_CREATE, P.RUBRICS_APPROVE,
  P.SCHEDULE_VIEW, P.PAPER_VAULT_VIEW, P.PAPER_VAULT_UPLOAD, P.PAPER_VAULT_REVIEW,
  P.PAPER_VAULT_APPROVE, P.PAPER_VAULT_LOCK, P.PAPER_VAULT_RELEASE, P.PAPER_VAULT_ARCHIVE,
  P.CONCESSIONS_VIEW, P.CONCESSIONS_MANAGE, P.MARKS_IMPORT, P.MARKS_AUDIT,
  P.SUBSCRIPTION_MANAGE, P.WORKFLOW_CONFIGURE, P.EXPORT_ASSESSMENT_PACK,
  P.INTELLIGENCE_VIEW, P.INTELLIGENCE_GENERATE,
  P.BETA_FEEDBACK_VIEW, P.BETA_FEEDBACK_MANAGE,
  P.TIMETABLE_VIEW, P.TIMETABLE_MANAGE, P.TIMETABLE_PUBLISH,
];

const examBodyPermissions: Permission[] = [
  ...schoolAdminPermissions.filter((p) => !p.startsWith("concessions")),
  P.EXAMINATIONS_VIEW, P.EXAMINATIONS_MANAGE, P.MODERATION_QUEUE,
  P.MODERATION_APPROVE, P.MODERATION_RETURN, P.WORKFLOW_TRANSITION,
];

/** Role → permissions map. Permissions are additive when a user holds multiple roles. */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  TEACHER: teacherPermissions,
  HOD: hodPermissions,
  MODERATOR: moderatorPermissions,
  EXAMINATION_OFFICER: examinationOfficerPermissions,
  PRINCIPAL: principalPermissions,
  SCHOOL_ADMIN: schoolAdminPermissions,
  SCHOOL_OWNER: schoolAdminPermissions,
  EXAM_BODY_ADMIN: examBodyPermissions,
  EXAMINATION_BODY: examBodyPermissions,
};

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

/** Legacy role aliases — same permissions, preferred display labels */
export const ROLE_ALIASES: Partial<Record<WorkspaceRole, WorkspaceRole>> = {
  SCHOOL_ADMIN: "SCHOOL_OWNER",
  EXAM_BODY_ADMIN: "EXAMINATION_BODY",
};

export function getRolesForWorkspaceType(
  type: "INDIVIDUAL_EDUCATOR" | "SCHOOL" | "EXAMINATION_BODY"
): WorkspaceRole[] {
  switch (type) {
    case "INDIVIDUAL_EDUCATOR":
      return [WorkspaceRole.TEACHER];
    case "SCHOOL":
      return [
        WorkspaceRole.TEACHER,
        WorkspaceRole.HOD,
        WorkspaceRole.MODERATOR,
        WorkspaceRole.PRINCIPAL,
        WorkspaceRole.SCHOOL_OWNER,
        WorkspaceRole.SCHOOL_ADMIN,
      ];
    case "EXAMINATION_BODY":
      return [
        WorkspaceRole.EXAMINATION_OFFICER,
        WorkspaceRole.MODERATOR,
        WorkspaceRole.EXAMINATION_BODY,
        WorkspaceRole.EXAM_BODY_ADMIN,
      ];
  }
}

export function resolveEffectivePermissions(roles: WorkspaceRole[]): Permission[] {
  const permissionSet = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      permissionSet.add(permission);
    }
  }
  return Array.from(permissionSet).sort();
}
