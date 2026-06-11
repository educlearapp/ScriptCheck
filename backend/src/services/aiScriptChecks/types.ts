/**
 * Future AI script quality checks — architecture placeholder.
 * No implementation required for beta; defines the extension points.
 */

export type AiScriptCheckType =
  | "MISSING_PAGE"
  | "BLANK_PAGE"
  | "DUPLICATE_PAGE"
  | "UPSIDE_DOWN"
  | "POOR_QUALITY";

export type AiScriptCheckSeverity = "INFO" | "WARNING" | "ERROR";

export type AiScriptCheckResult = {
  checkType: AiScriptCheckType;
  severity: AiScriptCheckSeverity;
  scriptId: string;
  pageNumber?: number;
  message: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export type AiScriptCheckReport = {
  batchId: string;
  assessmentId: string;
  generatedAt: string;
  checksRun: AiScriptCheckType[];
  results: AiScriptCheckResult[];
  summary: {
    totalIssues: number;
    warnings: number;
    errors: number;
  };
};

/** Registry of planned checks — implement handlers in future phases. */
export const AI_SCRIPT_CHECK_REGISTRY: Record<
  AiScriptCheckType,
  { label: string; description: string; implemented: boolean }
> = {
  MISSING_PAGE: {
    label: "Missing Page Detection",
    description: "Detect gaps in page sequences within learner scripts.",
    implemented: false,
  },
  BLANK_PAGE: {
    label: "Blank Page Detection",
    description: "Flag pages that appear blank or unreadable.",
    implemented: false,
  },
  DUPLICATE_PAGE: {
    label: "Duplicate Page Detection",
    description: "Identify repeated or duplicated scan pages.",
    implemented: false,
  },
  UPSIDE_DOWN: {
    label: "Upside-Down Scans",
    description: "Detect incorrectly oriented scan pages.",
    implemented: false,
  },
  POOR_QUALITY: {
    label: "Poor Quality Scans",
    description: "Flag low-resolution, blurry, or unreadable scans.",
    implemented: false,
  },
};

export interface AiScriptCheckProvider {
  readonly checkType: AiScriptCheckType;
  run(batchId: string, workspaceId: string): Promise<AiScriptCheckResult[]>;
}

/** Placeholder runner — returns empty report until checks are implemented. */
export async function runAiScriptChecks(
  _batchId: string,
  _workspaceId: string,
  _checks?: AiScriptCheckType[]
): Promise<AiScriptCheckReport> {
  return {
    batchId: _batchId,
    assessmentId: "",
    generatedAt: new Date().toISOString(),
    checksRun: [],
    results: [],
    summary: { totalIssues: 0, warnings: 0, errors: 0 },
  };
}
