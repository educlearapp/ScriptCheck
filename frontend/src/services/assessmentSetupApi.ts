import { apiFetch, apiUpload } from "../api";
import type { AssessmentDetail } from "../types";

export type AssessmentSetupStatus = {
  assessmentId: string;
  setupComplete: boolean;
  setupCompletedAt: string | null;
  questionCount: number | null;
  pagesPerScript: number | null;
  totalMarks?: number;
  memorandumAvailable: boolean;
  rubricAvailable: boolean;
  masterFiles: {
    questionPaper: boolean;
    memorandum: boolean;
    rubric: boolean;
    supportingDocuments: number;
  };
  readyForMarking: boolean;
  questionsExtracted?: boolean;
  memoAnswersReady?: boolean;
  memoBlocker?: string | null;
  missingSteps: string[];
};

export type AssessmentSetupInput = {
  title?: string;
  term?: string | null;
  assessmentType?: string;
  totalMarks?: number;
  questionCount?: number | null;
  pagesPerScript?: number | null;
  memorandumAvailable?: boolean;
  rubricAvailable?: boolean;
};

export type AssessmentFileEntry = {
  id: string;
  category: "assessment" | "script";
  fileType: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: string;
  scriptNumber?: string;
  learnerName?: string;
};

export type ScriptVerificationResult = {
  batchId: string;
  assessmentId: string;
  totalPagesUploaded: number;
  expectedPagesPerScript: number;
  detectedScriptCount: number;
  completeScripts: number;
  incompleteScripts: number;
  missingPages: number;
  extraPages: number;
  scripts: Array<{
    scriptId: string;
    scriptNumber: string;
    learnerName: string;
    pageCount: number;
    expectedPages: number;
    isComplete: boolean;
    warning: string | null;
  }>;
  warnings: string[];
  canProceed: boolean;
};

export type ScriptFormat = "ANSWER_SHEET" | "ON_QUESTION_PAPER";

export type MarkingWorkflowStage =
  | "CREATE_JOB"
  | "UPLOADS"
  | "AI_PROCESSING"
  | "REVIEW"
  | "RESULTS";

export type MarkingJobListItem = {
  batchId: string;
  assessmentId: string;
  title: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  scriptCount: number;
  scriptFormat: ScriptFormat;
  workflowStage: MarkingWorkflowStage;
  batchStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type MarkingWorkbenchScriptRow = {
  id: string;
  scriptNumber: string;
  learnerName: string;
  pageCount: number;
  status: string;
  teacherTotal: number | null;
  finalTotal: number | null;
  finalPercentage: number | null;
};

export type MarkingWorkbenchState = {
  batchId: string;
  assessmentId: string;
  title: string;
  term: string | null;
  totalMarks: number;
  questionCount: number | null;
  pagesPerScript: number | null;
  scriptFormat: ScriptFormat;
  curriculumId: string;
  phaseId: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  phase: { id: string; name: string };
  uploads: {
    questionPaper: boolean;
    memorandum: boolean;
    rubric: boolean;
    learnerScripts: boolean;
    scriptCount: number;
  };
  setupComplete: boolean;
  readyForMarking: boolean;
  memoAnswersReady: boolean;
  memoBlocker: string | null;
  workflowStage: MarkingWorkflowStage;
  batchStatus: string;
  scripts: MarkingWorkbenchScriptRow[];
  aiMarkingImplemented: boolean;
  prepareBlockers: string[];
  verification: ScriptVerificationResult | null;
};

export type MarkingOverviewItem = {
  id: string;
  title: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  status: string;
  statusLabel: string;
  scriptCount: number;
  setupComplete: boolean;
  pagesPerScript: number | null;
  batchId: string | null;
  batchStatus: string | null;
};

export type DhModerationItem = {
  id: string;
  type: "assessment" | "script_batch";
  assessmentName: string;
  grade: string;
  subject: string;
  teacher: string;
  status: string;
  statusLabel: string;
  assessmentId: string;
  batchId?: string;
  scriptCount?: number;
};

const DOC_TYPE_MAP: Record<string, string> = {
  questionPaper: "QUESTION_PAPER",
  memorandum: "MEMORANDUM",
  rubric: "RUBRIC_ATTACHMENT",
  supporting: "SUPPORTING_MATERIAL",
};

export async function getSetupStatus(assessmentId: string) {
  return apiFetch<AssessmentSetupStatus>(`/assessments/${assessmentId}/setup`);
}

export async function updateSetup(assessmentId: string, input: AssessmentSetupInput) {
  return apiFetch<AssessmentDetail>(`/assessments/${assessmentId}/setup`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function completeSetup(assessmentId: string) {
  return apiFetch<AssessmentSetupStatus>(`/assessments/${assessmentId}/setup/complete`, {
    method: "POST",
  });
}

export async function uploadMasterFile(
  assessmentId: string,
  docKey: keyof typeof DOC_TYPE_MAP,
  file: File
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", DOC_TYPE_MAP[docKey]);

  const token = (await import("../auth/session")).getAuthToken();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/paper-vault/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Upload failed");
  }
  return res.json();
}

export async function bulkUploadScripts(
  batchId: string,
  files: File[],
  onProgress?: (percent: number) => void
) {
  return apiUpload<{
    batchId: string;
    totalPagesUploaded: number;
    pagesPerScript: number;
    scriptsCreated: number;
    scriptIds: string[];
    verification: ScriptVerificationResult;
  }>(`/script-batches/${batchId}/bulk-upload`, files, onProgress);
}

export async function getScriptVerification(batchId: string) {
  return apiFetch<ScriptVerificationResult>(`/script-batches/${batchId}/verification`);
}

export async function confirmScriptVerification(batchId: string) {
  return apiFetch<ScriptVerificationResult>(`/script-batches/${batchId}/verification/confirm`, {
    method: "POST",
  });
}

export async function resplitLearnerAnswers(batchId: string, pagesPerScript: number) {
  return apiFetch<ScriptVerificationResult>(`/script-batches/${batchId}/verification/resplit`, {
    method: "POST",
    body: JSON.stringify({ pagesPerScript }),
  });
}

export async function getAssessmentFiles(assessmentId: string) {
  return apiFetch<{
    assessmentFiles: AssessmentFileEntry[];
    scriptFiles: AssessmentFileEntry[];
  }>(`/assessments/${assessmentId}/files`);
}

export async function listMarkingJobs() {
  return apiFetch<{ items: MarkingJobListItem[] }>("/marking/jobs");
}

export async function getMarkingWorkbench(batchId: string) {
  return apiFetch<MarkingWorkbenchState>(`/marking/jobs/${batchId}`);
}

export async function prepareMarkingJob(batchId: string) {
  return apiFetch<MarkingWorkbenchState>(`/marking/jobs/${batchId}/prepare`, {
    method: "POST",
  });
}

export async function getMarkingOverview() {
  return apiFetch<{ items: MarkingOverviewItem[] }>("/marking/overview");
}

export async function getDhModerationOverview() {
  return apiFetch<{ items: DhModerationItem[] }>("/moderation/dh-overview");
}

export type MarkingPackResult = {
  assessmentId: string;
  batchId: string;
  title: string;
  pagesPerScript: number | null;
};

export async function createMarkingPack(input: {
  title: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  term?: string | null;
  pagesPerScript?: number | null;
  totalMarks?: number;
  questionCount?: number | null;
  scriptFormat?: ScriptFormat;
}) {
  return apiFetch<MarkingPackResult>("/marking/pack", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type FinalizeQuickScanResult = {
  assessmentId: string;
  setupComplete: boolean;
  readyForMarking: boolean;
  memoAnswersReady: boolean;
  memoBlocker: string | null;
  questionsCreated: number;
  scriptMarksInitialized: number;
};

export async function finalizeQuickScan(assessmentId: string) {
  return apiFetch<FinalizeQuickScanResult>(
    `/marking/pack/${assessmentId}/finalize-quick-scan`,
    { method: "POST" }
  );
}

export async function reextractQuickScanQuestions(assessmentId: string) {
  return apiFetch<FinalizeQuickScanResult>(
    `/marking/pack/${assessmentId}/reextract-questions`,
    { method: "POST" }
  );
}
