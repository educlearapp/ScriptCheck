export type WorkspaceType =
  | "INDIVIDUAL_EDUCATOR"
  | "SCHOOL"
  | "EXAMINATION_BODY";

export type WorkspaceRole =
  | "TEACHER"
  | "HOD"
  | "MODERATOR"
  | "EXAMINATION_OFFICER"
  | "PRINCIPAL"
  | "SCHOOL_ADMIN"
  | "EXAM_BODY_ADMIN";

export type Permission =
  | "assessments.view"
  | "assessments.create"
  | "assessments.edit"
  | "assessments.edit_own"
  | "assessments.submit"
  | "moderation.queue"
  | "moderation.approve"
  | "moderation.return"
  | "users.view"
  | "users.manage"
  | "users.invite"
  | "roles.assign"
  | "curriculum.view"
  | "curriculum.manage"
  | "examinations.view"
  | "examinations.manage"
  | "workspace.manage"
  | "audit.view"
  | "questionBank.view"
  | "questionBank.create"
  | "questionBank.edit"
  | "questionBank.approve"
  | "questionBank.archive"
  | "curriculumTopics.manage"
  | "assessmentTemplates.view"
  | "assessmentTemplates.create"
  | "assessmentTemplates.use"
  | "assessmentTemplates.archive"
  | "scripts.view"
  | "scripts.create"
  | "scripts.mark"
  | "scripts.submit"
  | "scripts.moderate"
  | "scripts.approve"
  | "scripts.finalise"
  | "examSession.view"
  | "examSession.manage"
  | "results.view"
  | "results.export"
  | "results.publish"
  | "results.reopen"
  | "dashboard.academic.view"
  | "feedback.create"
  | "feedback.view"
  | "reports.generate"
  | "subjects.view"
  | "subjects.manage"
  | "rubrics.view"
  | "rubrics.create"
  | "rubrics.approve"
  | "schedule.view"
  | "paperVault.view"
  | "paperVault.upload"
  | "paperVault.review"
  | "paperVault.approve"
  | "paperVault.lock"
  | "paperVault.release"
  | "paperVault.archive"
  | "concessions.view"
  | "concessions.manage"
  | "marks.import";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: WorkspaceType;
  roles: WorkspaceRole[];
  permissions: Permission[];
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  roles: WorkspaceRole[];
  isActive?: boolean;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  workspaces: WorkspaceSummary[];
};

export type CurriculumRef = {
  id: string;
  code: string;
  name: string;
};

export type PhaseRef = {
  id: string;
  code: string;
  name: string;
  orderIndex?: number;
  curriculumId?: string;
};

export type GradeRef = {
  id: string;
  code: string;
  name: string;
  orderIndex?: number;
  phaseId?: string;
};

export type SubjectRef = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  active?: boolean;
  curriculumId?: string;
  phaseId?: string;
};

export type CurriculumTree = CurriculumRef & {
  phases: Array<
    PhaseRef & {
      grades: GradeRef[];
      subjects: SubjectRef[];
    }
  >;
};

/** @deprecated Use CurriculumRef.code */
export type Curriculum = "CAPS" | "IEB" | "CAMBRIDGE";

export type AssessmentStatus =
  | "DRAFT"
  | "SUBMITTED_TO_HOD"
  | "RETURNED_TO_TEACHER"
  | "AI_REVIEW"
  | "HOD_REVIEW"
  | "APPROVED"
  | "WRITTEN"
  | "MARKING"
  | "MARKED"
  | "PUBLISHED";

export type ModerationAction =
  | "SUBMIT_TO_HOD"
  | "APPROVE"
  | "RETURN_TO_TEACHER";

export type ModerationAudit = {
  id: string;
  assessmentId: string;
  action: ModerationAction;
  fromStatus: AssessmentStatus;
  toStatus: AssessmentStatus;
  comment: string | null;
  createdAt: string;
  performedBy: { id: string; fullName: string; roles: WorkspaceRole[] };
};

export type AssessmentType =
  | "TEST"
  | "EXAM"
  | "ASSIGNMENT"
  | "SBA_TASK"
  | "PROJECT"
  | "PRACTICAL"
  | "ORAL"
  | "OTHER";

export type MarksSummary = {
  declaredTotalMarks: number;
  calculatedFromQuestions: number;
  mismatch: boolean;
  questionCount: number;
};

export type Assessment = {
  id: string;
  title: string;
  description: string | null;
  curriculum: CurriculumRef;
  phase: PhaseRef;
  grade: GradeRef;
  subject: SubjectRef;
  assessmentType: AssessmentType;
  term: string | null;
  session: string | null;
  totalMarks: number;
  weightingPercent: number | null;
  durationMinutes: number | null;
  assessmentDate: string | null;
  dueDate: string | null;
  markingDeadline: string | null;
  moderationDeadline: string | null;
  rubricTemplateId: string | null;
  status: AssessmentStatus;
  creatorTeacher: { id: string; fullName: string };
  assignedUser: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  marksSummary?: MarksSummary;
};

export type AssessmentQuestion = {
  id: string;
  assessmentId: string;
  questionNumber: string;
  section: string | null;
  questionText: string;
  topic: string | null;
  marks: number;
  cognitiveLevel: string | null;
  difficulty: string | null;
  expectedAnswer: string | null;
  memoNotes: string | null;
  rubricNotes: string | null;
  orderIndex: number;
  analyticsMetadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentDetail = Assessment & {
  marksSummary: MarksSummary;
};

export type QuestionsResponse = {
  questions: AssessmentQuestion[];
  marksSummary: MarksSummary;
};

export type Grade = GradeRef;

export type Subject = SubjectRef;

export type GenerationMode =
  | "QUESTIONS_ONLY"
  | "QUESTIONS_AND_MEMO"
  | "FULL_PACKAGE";

export type GenerationDifficulty = "EASY" | "STANDARD" | "CHALLENGING";

export type AssessmentGenerationStatus =
  | "DRAFT"
  | "GENERATING"
  | "GENERATED"
  | "FAILED";

export type GeneratedQuestionPreview = {
  questionNumber: string;
  questionText: string;
  marks: number;
  topic: string;
  cognitiveLevel: string;
  difficulty: string;
  expectedAnswer?: string;
  memoNotes?: string;
};

export type GenerationPreview = {
  questions: GeneratedQuestionPreview[];
  memo: {
    entries: {
      questionNumber: string;
      markAllocation: number;
      expectedAnswer: string;
      memoNotes: string;
    }[];
    markAllocation: { questionNumber: string; marks: number }[];
  } | null;
  summary: {
    questionCount: number;
    totalMarks: number;
    topicsUsed: string[];
    difficulty: GenerationDifficulty;
    outputMode: GenerationMode;
    cognitiveLevels: string[];
  };
  mock: boolean;
  generatedAt: string;
};

export type GenerationRequest = {
  id: string;
  title: string;
  assessmentType: AssessmentType;
  outputMode: GenerationMode;
  term: string | null;
  totalMarks: number;
  difficulty: GenerationDifficulty;
  instructions: string | null;
  topics: string[];
  status: AssessmentGenerationStatus;
  curriculum: CurriculumRef | null;
  phase: PhaseRef | null;
  grade: GradeRef | null;
  subject: SubjectRef | null;
  latestVersion: number | null;
  approvedAssessmentId: string | null;
  preview: GenerationPreview | null;
  createdAt: string;
};

export type QuestionBankSource =
  | "AI_GENERATED"
  | "TEACHER_CREATED"
  | "HOD_APPROVED"
  | "EXAM_BODY";

export type QuestionBankStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

export type QuestionBankItem = {
  id: string;
  workspaceId: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  topic: string | null;
  subtopic: string | null;
  questionText: string;
  expectedAnswer: string | null;
  memoNotes: string | null;
  rubricNotes: string | null;
  marks: number;
  difficulty: string | null;
  cognitiveLevel: string | null;
  source: QuestionBankSource;
  status: QuestionBankStatus;
  usageCount: number;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CurriculumTopic = {
  id: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  topic: string;
  subtopic: string;
  orderIndex: number;
  active: boolean;
};

export type AssessmentTemplate = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  questionCount: number;
  totalMarks: number;
  curriculum: CurriculumRef | null;
  phase: PhaseRef | null;
  grade: GradeRef | null;
  subject: SubjectRef | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
};

export type TemplatePreview = {
  id: string;
  name: string;
  description: string | null;
  questionCount: number;
  totalMarks: number;
  topicSpread: { label: string; count: number }[];
  difficultySpread: { label: string; count: number }[];
  createdBy: { id: string; fullName: string };
  curriculum: CurriculumRef | null;
  phase: PhaseRef | null;
  grade: GradeRef | null;
  subject: SubjectRef | null;
  questions: {
    orderIndex: number;
    questionText: string;
    topic: string | null;
    subtopic: string | null;
    marks: number;
    difficulty: string | null;
    cognitiveLevel: string | null;
  }[];
};

export type ScriptBatchStatus =
  | "DRAFT"
  | "MARKING"
  | "TEACHER_REVIEW"
  | "SUBMITTED_TO_HOD"
  | "HOD_REVIEW"
  | "RETURNED_TO_TEACHER"
  | "APPROVED"
  | "PUBLISHED";

export type LearnerScriptStatus =
  | "NOT_MARKED"
  | "IN_PROGRESS"
  | "UPLOADED"
  | "MARKING"
  | "MARKED"
  | "SUBMITTED_TO_HOD"
  | "HOD_REVIEW"
  | "MODERATION"
  | "RETURNED_TO_TEACHER"
  | "APPROVED"
  | "MODERATED"
  | "FINALISED";

export type WorkflowDisplayStatus =
  | "UPLOADED"
  | "MARKING"
  | "MARKED"
  | "MODERATION"
  | "MODERATED"
  | "FINALISED"
  | "RETURNED";

export type ScriptWorkflowAction =
  | "upload"
  | "mark"
  | "complete"
  | "submit_moderation"
  | "start_review"
  | "approve"
  | "return_to_teacher"
  | "finalise";

export type ScriptWorkflowInfo = {
  scriptId: string;
  batchId: string;
  status: LearnerScriptStatus;
  workflowStatus: WorkflowDisplayStatus;
  pageCount: number;
  teacherLayerLocked: boolean;
  hodLayerLocked: boolean;
  isReadOnly: boolean;
  canEditTeacherLayer: boolean;
  canEditHodLayer: boolean;
  examSessionMode: boolean;
  submittedToHodAt: string | null;
  approvedAt: string | null;
  finalisedAt: string | null;
  finalisedBy: { id: string; fullName: string } | null;
  availableActions: ScriptWorkflowAction[];
};

export type ScriptAuditEntry = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
};

export type ScriptBatchSummary = {
  id: string;
  title: string;
  status: ScriptBatchStatus;
  totalLearners: number;
  totalScripts: number;
  totalPages: number;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  assessment?: { id: string; title: string; totalMarks: number };
  _count?: { learnerScripts: number };
};

export type LearnerScriptSummary = {
  id: string;
  scriptNumber: string;
  status: LearnerScriptStatus;
  teacherTotal: number | null;
  hodTotal: number | null;
  finalTotal: number | null;
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
  };
};

export type ScriptQuestionMarkRow = {
  id: string;
  assessmentQuestionId: string;
  questionNumber: string;
  maxMarks: number;
  questionText: string;
  teacherMark: number | null;
  hodMark: number | null;
  finalMark: number | null;
  teacherComment: string | null;
  hodComment: string | null;
  teacherAnnotatedText: string | null;
  hodAnnotatedText: string | null;
};

export type ScriptPageInfo = {
  id: string;
  pageNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  sourcePageIndex?: number | null;
};

export type AnnotationStroke = {
  id: string;
  type: "draw" | "highlight" | "tick" | "cross" | "comment";
  pageNumber: number;
  points?: number[][];
  x?: number;
  y?: number;
  text?: string;
  color: string;
  width?: number;
};

export type AnnotationNote = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  text: string;
};

export type AnnotationData = {
  strokes: AnnotationStroke[];
  notes: AnnotationNote[];
};

export type ScriptLayerDetail = {
  id: string;
  layerType: string;
  color: string;
  label: string;
  annotationData: AnnotationData;
  updatedAt: string;
};

export type ModerationVarianceLevel =
  | "NONE"
  | "OK"
  | "WARNING"
  | "SIGNIFICANT"
  | "CRITICAL";

export type LearnerScriptDetail = {
  id: string;
  batchId: string;
  scriptNumber: string;
  pageCount: number;
  status: LearnerScriptStatus;
  teacherTotal: number | null;
  hodTotal: number | null;
  finalTotal: number | null;
  markDifference?: number | null;
  teacherPercentage?: number | null;
  hodPercentage?: number | null;
  finalPercentage?: number | null;
  moderationVariancePercent?: number | null;
  varianceLevel?: ModerationVarianceLevel;
  percentage: number;
  outOf: number;
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
  };
  assessment: {
    id: string;
    title: string;
    totalMarks: number;
    rubricTemplateId?: string | null;
    rubricTemplate?: {
      id: string;
      name: string;
      totalMarks: number;
      status: string;
    } | null;
  };
  batch: { id: string; title: string; status: ScriptBatchStatus; examSessionMode?: boolean };
  questionMarks: ScriptQuestionMarkRow[];
  layers: { id: string; layerType: string; color: string; label: string }[];
  pages: ScriptPageInfo[];
  workflowStatus?: WorkflowDisplayStatus;
  teacherLayerLocked?: boolean;
  hodLayerLocked?: boolean;
  isReadOnly?: boolean;
  canEditTeacherLayer?: boolean;
  canEditHodLayer?: boolean;
  finalisedAt?: string | null;
  finalisedBy?: { id: string; fullName: string } | null;
};

export type BatchModerationAnalytics = {
  batchId: string;
  title: string;
  status: ScriptBatchStatus;
  assessment: { id: string; title: string; totalMarks: number };
  totalScripts: number;
  workflowCounts: {
    uploaded: number;
    marking: number;
    marked: number;
    moderation: number;
    moderated: number;
    finalised: number;
  };
  marks: {
    average: number | null;
    highest: number | null;
    lowest: number | null;
    assessmentTotal: number;
  };
  varianceCounts: {
    warning: number;
    significant: number;
    critical: number;
    totalFlagged: number;
  };
  scripts: {
    id: string;
    scriptNumber: string;
    learnerName: string;
    status: LearnerScriptStatus;
    workflowStatus: WorkflowDisplayStatus;
    teacherTotal: number | null;
    hodTotal: number | null;
    finalTotal: number | null;
    markDifference: number | null;
    moderationVariancePercent: number | null;
    varianceLevel: ModerationVarianceLevel;
    varianceLabel: string;
  }[];
};

export type MarkerPerformanceRow = {
  teacherId: string;
  teacherName: string;
  scriptsMarked: number;
  averageMarkAwarded: number | null;
  averageModerationVariance: number | null;
  scriptsReturnedByHod: number;
  approvalRate: number | null;
};

export type HodModerationDashboard = {
  summary: {
    pendingModeration: number;
    overdueModeration: number;
    returnedScripts: number;
    approvedScripts: number;
    finalisedScripts: number;
  };
  pendingBatches: Array<{
    id: string;
    title: string;
    status: ScriptBatchStatus;
    assessment: { title: string; totalMarks: number };
    _count: { learnerScripts: number };
  }>;
  overdueScripts: Array<{
    scriptId: string;
    scriptNumber: string;
    learnerName: string;
    batchTitle: string;
    submittedToHodAt: string | null;
  }>;
};

export type ViewMode = "original" | "teacher" | "hod" | "all";

export type AnnotationTool = "draw" | "highlight" | "tick" | "cross" | "comment" | "select";

export type ResultsViewerScope = "teacher" | "hod" | "admin";

export type LearnerResultRow = {
  scriptId: string;
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  finalTotal: number | null;
  percentage: number | null;
  status: LearnerScriptStatus;
  passed: boolean | null;
  perQuestionMarks: {
    questionId: string;
    questionNumber: string;
    maxMarks: number;
    finalMark: number | null;
    percentage: number | null;
  }[];
};

export type QuestionAnalysisRow = {
  questionId: string;
  questionNumber: string;
  maxMarks: number;
  averageMark: number | null;
  averagePercentage: number | null;
  fullMarksCount: number;
  belowFiftyCount: number;
  topic: string | null;
  cognitiveLevel: string | null;
  difficulty: string | null;
};

export type WeakTopicRow = {
  topic: string;
  averagePercentage: number | null;
  learnersStruggling: number;
  questionNumbers: string[];
};

export type GroupedAnalysisRow = {
  averagePercentage: number | null;
  questionCount: number;
  questionNumbers: string[];
};

export type CognitiveLevelAnalysis = {
  groups: Array<GroupedAnalysisRow & { cognitiveLevel: string }>;
  weakestCognitiveLevel: string | null;
  strongestCognitiveLevel: string | null;
};

export type DifficultyAnalysis = {
  groups: Array<GroupedAnalysisRow & { difficulty: string }>;
};

export type LearnerAtRisk = {
  scriptId: string;
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  finalTotal: number | null;
  percentage: number | null;
  status: LearnerScriptStatus;
};

export type AssessmentResultsSummary = {
  totalLearners: number;
  markedLearners: number;
  classAverage: number | null;
  highestMark: number | null;
  lowestMark: number | null;
  passRate: number | null;
  distinctionCount?: number;
  failureCount?: number;
  passThresholdPercent: number;
  source?: string;
};

export type ResultsPublishingState = {
  isPublished: boolean;
  publishedAt: string | null;
  resultsPublishRequestedAt: string | null;
  canRequestPublish: boolean;
  canPublish: boolean;
  canReopen: boolean;
  isReadOnly: boolean;
};

export type DepartmentResultItem = {
  id: string;
  title: string;
  status: AssessmentStatus;
  totalMarks: number;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  curriculum: { id: string; code: string; name: string };
  phase: { id: string; code: string; name: string };
  creatorTeacher: { id: string; fullName: string };
  publishedAt: string | null;
  resultsPublishRequestedAt: string | null;
  classAverage: number | null;
  passRate: number | null;
  learnerCount: number | null;
  learnersAtRiskCount: number | null;
};

export type DashboardBatchItem = {
  id: string;
  title: string;
  status: string;
  assessment: { id: string; title: string; subject: { name: string } };
  createdBy?: { id: string; fullName: string };
  updatedAt?: string;
};

export type MarkImportAuditItem = {
  id: string;
  action: string;
  assessmentId: string;
  fileName?: string;
  rowsImported?: number;
  rowsSkipped?: number;
  error?: string;
  actor?: { id: string; fullName: string };
  createdAt: string;
};

export type TeacherDashboardData = {
  scope: "teacher";
  stats: {
    awaitingMarkingCount: number;
    submittedToHodCount: number;
    publishedCount: number;
    averagePerformance: number | null;
    moderationPendingCount: number;
    marksNotCapturedCount: number;
    overdueAssessmentsCount: number;
    upcomingDeadlinesCount: number;
    recentImportsCount: number;
    importFailuresCount: number;
    portalLogins30d: number;
    portalReportDownloads30d: number;
  };
  recentImports: MarkImportAuditItem[];
  portalActivity: PortalActivityItem[];
  awaitingMarking: DepartmentResultItem[];
  submittedToHod: DepartmentResultItem[];
  recentlyPublished: DepartmentResultItem[];
  moderationPending: DashboardBatchItem[];
  overdueAssessments: DepartmentResultItem[];
  upcomingDeadlines: (DepartmentResultItem & {
    dueDate: string | null;
    markingDeadline: string | null;
    moderationDeadline: string | null;
  })[];
};

export type HodDashboardData = {
  scope: "hod";
  stats: {
    scriptBatchesAwaitingModeration: number;
    assessmentsAwaitingHodReview: number;
    resultsAwaitingPublishCount: number;
    atRiskLearnerCount: number;
    departmentAverage: number | null;
    overdueModerationCount: number;
    moderationQueueCount: number;
    publishedSubjectCount: number;
    importFailuresCount: number;
    concessionLearnerCount: number;
    importedAssessmentsCount: number;
    portalAdoptionCount: number;
    portalReportDownloads: number;
  };
  recentImports: MarkImportAuditItem[];
  portalActivity: PortalActivityItem[];
  resultsAwaitingPublish: DepartmentResultItem[];
  weakTopics: { topic: string; averagePercentage: number; assessmentCount: number }[];
  moderationQueue: DashboardBatchItem[];
  overdueModeration: DashboardBatchItem[];
};

export type WorkspaceSubject = {
  id: string;
  name: string;
  code: string;
  department: string | null;
  active: boolean;
  archivedAt: string | null;
  curriculum: CurriculumRef;
  phase: PhaseRef;
  grade: GradeRef;
  catalogSubject: SubjectRef | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
};

export type RubricCriterion = {
  id?: string;
  name: string;
  description: string | null;
  maxMarks: number;
  orderIndex: number;
};

export type RubricTemplateScope = "REUSABLE" | "SUBJECT_SPECIFIC" | "TEACHER_CREATED";
export type RubricTemplateStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ARCHIVED";

export type RubricTemplate = {
  id: string;
  name: string;
  description: string | null;
  scope: RubricTemplateScope;
  status: RubricTemplateStatus;
  totalMarks: number;
  subject: SubjectRef | null;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  criteria: RubricCriterion[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduleEventType =
  | "ASSESSMENT"
  | "EXAMINATION"
  | "MODERATION_DEADLINE"
  | "MARKING_DEADLINE";

export type ScheduleEvent = {
  id: string;
  type: ScheduleEventType;
  title: string;
  date: string;
  assessmentId: string;
  assessmentType: AssessmentType;
  status: AssessmentStatus;
  subject: { id: string; name: string };
  grade: { id: string; name: string };
  creatorTeacher: { id: string; fullName: string };
  dueDate: string | null;
  markingDeadline: string | null;
  moderationDeadline: string | null;
};

export type RubricMarkRow = {
  id: string | null;
  rubricCriterionId: string;
  name: string;
  description: string | null;
  maxMarks: number;
  orderIndex: number;
  teacherMark: number | null;
  hodMark: number | null;
  finalMark: number | null;
  teacherComment: string | null;
  hodComment: string | null;
};

export type RubricMarksResponse = {
  rubricTemplate: {
    id: string;
    name: string;
    totalMarks: number;
    status: string;
  } | null;
  marks: RubricMarkRow[];
  totals: {
    teacherTotal: number;
    hodTotal: number | null;
    finalTotal: number;
    outOf: number;
    percentage: number | null;
  } | null;
};

export type PerformanceBand = {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
  barWidth: number;
};

export type ClassAnalysis = {
  assessment: {
    id: string;
    title: string;
    subject: { id: string; name: string };
    grade: { id: string; name: string };
    term: string | null;
  };
  summary: {
    totalLearners: number;
    markedLearners: number;
    classAverage: number | null;
    highestMark: number | null;
    lowestMark: number | null;
    passRate: number | null;
    distinctionCount: number;
    failureCount: number;
    passThresholdPercent: number;
  };
  distribution: PerformanceBand[];
  performanceBands: PerformanceBand[];
  classes: Array<{
    className: string;
    classAverage: number | null;
    passRate: number | null;
    distinctionCount: number;
    failureCount: number;
    distribution: PerformanceBand[];
  }>;
  topPerformer: {
    learnerId: string;
    learnerName: string;
    finalPercentage: number | null;
  } | null;
  lowestPerformer: {
    learnerId: string;
    learnerName: string;
    finalPercentage: number | null;
  } | null;
  source: string;
};

export type SubjectAnalysis = {
  subjectAverage: number | null;
  assessments: Array<{
    assessmentId: string;
    title: string;
    term: string | null;
    classAverage: number | null;
    passRate: number | null;
    distinctionCount: number;
    failureCount: number;
  }>;
  trend: {
    direction: "improving" | "declining" | "stable";
    dataPoints: Array<{ assessmentId: string; title: string; average: number | null; date: string | null }>;
  } | null;
  source: string;
};

export type GradeAnalysis = {
  grade: { id: string; name: string };
  gradeAverage: number | null;
  classes: Array<{
    className: string;
    learnerCount: number;
    averagePercentage: number | null;
    passRate: number | null;
    atRisk: boolean;
  }>;
  topPerformingClass: { className: string; averagePercentage: number | null } | null;
  atRiskClasses: Array<{ className: string; averagePercentage: number | null }>;
  source: string;
};

export type LearnerHistory = {
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
    grade: { id: string; name: string };
  };
  overallAverage: number | null;
  assessmentCount: number;
  timeline: Array<{
    id: string;
    assessmentId: string;
    title: string;
    term: string | null;
    subject: { id: string; name: string };
    finalMark: number | null;
    finalPercentage: number | null;
    totalMarks: number;
    passed: boolean | null;
    capturedAt: string;
    assessmentDate: string | null;
  }>;
  averageByTerm: Array<{ term: string; average: number; assessmentCount: number }>;
  averageBySubject: Array<{ subject: string; average: number; assessmentCount: number }>;
  trend: { direction: string; change: number } | null;
  source: string;
};

export type AtRiskLearner = {
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  grade: { id: string; name: string };
  reasons: string[];
  flaggedAt: string;
  metadata: Record<string, unknown> | null;
};

export type AssessmentScheduleData = {
  scope: "teacher" | "hod" | "school";
  rangeStart: string;
  rangeEnd: string;
  events: ScheduleEvent[];
};

export type PrincipalDashboardData = {
  scope: "admin";
  stats: {
    totalAssessments: number;
    publishedCount: number;
    averagePassRate: number | null;
    atRiskLearnerCount: number;
  };
  subjectPerformance: {
    subject: string;
    averagePassRate: number | null;
    assessmentCount: number;
  }[];
  gradePerformance: {
    grade: string;
    averagePassRate: number | null;
    assessmentCount: number;
  }[];
  recentPublished: DepartmentResultItem[];
};

export type AcademicDashboardData =
  | TeacherDashboardData
  | HodDashboardData
  | PrincipalDashboardData;

export type AssessmentResults = {
  assessment: {
    id: string;
    title: string;
    totalMarks: number;
    status: AssessmentStatus;
    grade: { id: string; name: string };
    subject: { id: string; name: string };
    creatorTeacher: { id: string; fullName: string };
    publishedAt?: string | null;
    resultsPublishRequestedAt?: string | null;
  };
  summary: AssessmentResultsSummary;
  learners: LearnerResultRow[];
  questionAnalysis: QuestionAnalysisRow[];
  weakTopics: WeakTopicRow[];
  cognitiveLevelAnalysis: CognitiveLevelAnalysis;
  difficultyAnalysis: DifficultyAnalysis;
  learnersAtRisk: LearnerAtRisk[];
  viewerScope: ResultsViewerScope;
  canExport: boolean;
  publishing: ResultsPublishingState;
  analyticsSnapshot: Record<string, unknown> | null;
};

export type LearnerFeedbackEntry = {
  id: string;
  learnerScriptId: string;
  teacherFeedback: string | null;
  hodFeedback: string | null;
  interventionNotes: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
};

export type PublishedResultsView = {
  portalReady: boolean;
  readOnly: boolean;
  assessmentId: string;
  publishedAt: string | null;
  workspace: { id: string; name: string; type: WorkspaceType };
  assessment: {
    id: string;
    title: string;
    totalMarks: number;
    status: AssessmentStatus;
    curriculum: CurriculumRef;
    phase: PhaseRef;
    grade: GradeRef;
    subject: SubjectRef;
    teacher: { id: string; fullName: string };
  };
  summary: {
    classAverage: number | null;
    passRate: number | null;
    highestMark: number | null;
    lowestMark: number | null;
    learnerCount: number;
    markedLearners: number;
    learnersAtRiskCount: number;
  } | null;
  questionAnalysis: Array<{
    questionNumber: string;
    maxMarks: number;
    averageMark: number | null;
    averagePercentage: number | null;
    topic: string | null;
    cognitiveLevel: string | null;
    difficulty: string | null;
  }>;
  weakTopics: WeakTopicRow[];
  cognitiveLevelSummary: CognitiveLevelAnalysis | null;
  difficultySummary: DifficultyAnalysis | null;
  learners: Array<{
    scriptId: string;
    learnerId: string;
    learnerNumber: string;
    learnerName: string;
    className: string | null;
    finalTotal: number | null;
    percentage: number | null;
    status: LearnerScriptStatus;
    passed: boolean | null;
  }>;
};

export type PaperDocumentType =
  | "QUESTION_PAPER"
  | "MEMORANDUM"
  | "MARKING_GUIDELINE"
  | "RUBRIC_ATTACHMENT"
  | "SUPPORTING_MATERIAL";

export type PaperVaultStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "LOCKED"
  | "RELEASED"
  | "ARCHIVED";

export type PaperVaultWorkflowActions = {
  canSubmit: boolean;
  canReturn: boolean;
  canApprove: boolean;
  canLock: boolean;
  canRelease: boolean;
  canArchive: boolean;
  canUploadNewVersion: boolean;
  canDownload: boolean;
};

export type PaperVaultDocument = {
  id: string;
  assessmentId: string;
  documentGroupId: string;
  documentType: PaperDocumentType;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: PaperVaultStatus;
  isCurrentVersion: boolean;
  uploadedBy: { id: string; fullName: string };
  releaseAt: string | null;
  expiresAt: string | null;
  workflowComment: string | null;
  createdAt: string;
  updatedAt: string;
  workflow?: PaperVaultWorkflowActions;
  canDownload?: boolean;
};

export type PaperVaultAuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
  metadata: Record<string, unknown> | null;
};

export type NavItem = {
  to: string;
  label: string;
  icon: string;
  permission?: Permission;
};

export type Learner = {
  id: string;
  learnerNumber: string;
  firstName: string;
  lastName: string;
  gradeId: string;
  className: string | null;
  active: boolean;
};

export type ConcessionType =
  | "EXTRA_TIME"
  | "READER"
  | "SCRIBE"
  | "ENLARGED_PAPER"
  | "SEPARATE_VENUE"
  | "ASSISTIVE_TECHNOLOGY"
  | "OTHER";

export type LearnerConcession = {
  id: string;
  learnerId: string;
  learner: {
    id: string;
    learnerNumber: string;
    fullName: string;
    className: string | null;
  };
  concessionType: ConcessionType;
  concessionLabel: string;
  description: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConcessionAlert = {
  learnerId: string;
  learnerNumber: string;
  fullName: string;
  className: string | null;
  summary: string;
  concessions: Array<{
    type: ConcessionType;
    label: string;
    description: string | null;
  }>;
};

export type BulkCaptureRow = {
  learnerId: string;
  learnerNumber: string;
  learnerName: string;
  className: string | null;
  mark: number | null;
  comment: string | null;
  status: "not_captured" | "captured" | "imported" | "script";
  markId: string | null;
};

export type MarkImportParseResult = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: {
    learnerNumber?: string;
    learnerName?: string;
    mark?: string;
    comment?: string;
  };
};

export type MarkImportValidation = {
  validRows: Array<{
    row: number;
    learnerId: string;
    learnerNumber: string;
    learnerName: string;
    mark: number;
    comment: string | null;
  }>;
  errors: Array<{
    row: number;
    learnerNumber?: string;
    learnerName?: string;
    mark?: string;
    level: "error" | "warning";
    message: string;
  }>;
  warnings: Array<{
    row: number;
    learnerNumber?: string;
    learnerName?: string;
    mark?: string;
    level: "error" | "warning";
    message: string;
  }>;
  skippedRows: Array<{
    row: number;
    message: string;
  }>;
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    warningCount: number;
    skippedCount: number;
  };
};

export type PortalUserType = "PARENT" | "LEARNER";

export type PortalLearnerRef = {
  id: string;
  learnerNumber: string;
  fullName: string;
  className: string | null;
  grade: { id: string; name: string };
};

export type PortalAuthResponse = {
  token: string;
  portalType: PortalUserType;
  workspace: { id: string; name: string; slug: string };
  learners: PortalLearnerRef[];
  activeLearnerId: string | null;
};

export type PortalSession = {
  token: string;
  portalType: PortalUserType;
  workspaceName: string;
  workspaceSlug: string;
  learners: PortalLearnerRef[];
  activeLearnerId: string | null;
};

export type PortalAtRisk = {
  active: boolean;
  alerts: Array<{ reason: string; label: string }>;
  guidance: string | null;
};

export type PortalLearnerDashboard = {
  learner: PortalLearnerRef & {
    firstName: string;
    lastName: string;
  };
  cards: {
    academicAverage: number | null;
    assessmentsCompleted: number;
    distinctions: number;
    subjectsAtRisk: number;
  };
  subjectAverages: Array<{
    subject: string;
    average: number;
    assessmentCount: number;
    atRisk: boolean;
  }>;
  recentAssessments: Array<{
    assessmentId: string;
    title: string;
    subject: string;
    date: string | null;
    mark: number | null;
    percentage: number | null;
    totalMarks: number;
    passed: boolean | null;
  }>;
  upcomingAssessments: Array<{
    id: string;
    title: string;
    subject: string;
    date: string | null;
    teacher: string;
  }>;
  performanceTrend: {
    direction: "improving" | "declining" | "stable";
    change: number;
  } | null;
  atRisk: PortalAtRisk;
  readOnly: boolean;
};

export type PortalAssessmentDetail = {
  assessment: {
    id: string;
    title: string;
    subject: string;
    date: string | null;
    teacher: string;
    totalMarks: number;
  };
  result: {
    mark: number | null;
    percentage: number | null;
    comment: string | null;
    passed: boolean | null;
  };
  classStats: {
    classAverage: number | null;
    highestMark: number | null;
    learnerCount: number;
  };
  rubricBreakdown: {
    templateName: string | null;
    criteria: Array<{
      name: string;
      maxMarks: number;
      mark: number | null;
      teacherComment: string | null;
      moderatorComment: string | null;
    }>;
    total: number | null;
    maxTotal: number | null;
    percentage: number | null;
  } | null;
  teacherComments: string | null;
  moderatorComments: string | null;
  readOnly: boolean;
};

export type PortalLearnerHistory = {
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    grade: { id: string; name: string };
  };
  overallAverage: number | null;
  terms: Array<{
    term: string;
    subjectAverages: Array<{ subject: string; average: number }>;
    assessmentAverage: number | null;
    assessmentCount: number;
    trend: "up" | "down" | "stable" | null;
  }>;
  timeline: Array<{
    assessmentId: string;
    title: string;
    term: string;
    subject: string;
    date: string | null;
    mark: number | null;
    percentage: number | null;
    totalMarks: number;
    passed: boolean | null;
  }>;
  readOnly: boolean;
};

export type PortalAnalytics = {
  subjectTrends: Array<{
    subject: string;
    points: Array<{ date: string | null; percentage: number }>;
  }>;
  assessmentTrends: Array<{
    title: string;
    subject: string;
    date: string | null;
    percentage: number;
  }>;
  performanceGrowth: number | null;
  gradeComparison: {
    grade: string;
    gradeAverage: number | null;
    learnerAverage: number | null;
    difference: number | null;
  };
  readOnly: boolean;
};

export type PortalActivityItem = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
