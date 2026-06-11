import type { IntelligenceReport } from "../types/phase2";

export type HealthRating =
  | "Excellent"
  | "Good"
  | "Needs Attention"
  | "High Risk";

export type AssessmentHealthSummary = {
  complianceScore: number | null;
  capsCompliance: number | null;
  cognitiveBalance: number | null;
  rubricStatus: "Complete" | "Missing";
  memorandumStatus: "Complete" | "Incomplete";
  moderationStatus: string;
  workflowStatus: string;
  riskLevel: "Low" | "Medium" | "High";
  overallRating: HealthRating;
  riskCount: number;
  highRiskCount: number;
};

export function deriveRiskLevel(
  report: IntelligenceReport | null
): "Low" | "Medium" | "High" {
  if (!report) return "Medium";
  const highs = report.riskIndicators.filter((r) => r.severity === "high").length;
  if (highs > 0 || report.complianceScore < 50) return "High";
  if (report.riskIndicators.length > 0 || report.complianceScore < 70) return "Medium";
  return "Low";
}

export function deriveOverallRating(
  report: IntelligenceReport | null,
  workflowLabel?: string
): HealthRating {
  if (!report) {
    return workflowLabel === "Archived" || workflowLabel === "Published"
      ? "Good"
      : "Needs Attention";
  }

  const risk = deriveRiskLevel(report);
  const score = report.complianceScore;

  if (
    risk === "High" ||
    score < 50 ||
    report.missingMemorandums ||
    (report.missingRubrics && score < 70)
  ) {
    return "High Risk";
  }

  if (score >= 85 && risk === "Low" && !report.missingRubrics && !report.missingMemorandums) {
    return "Excellent";
  }

  if (score >= 70 && risk === "Low") {
    return "Good";
  }

  return "Needs Attention";
}

export function buildHealthSummary(
  report: IntelligenceReport | null,
  workflowLabel: string,
  moderationStatus: string
): AssessmentHealthSummary {
  const riskLevel = deriveRiskLevel(report);
  const highRiskCount =
    report?.riskIndicators.filter((r) => r.severity === "high").length ?? 0;

  return {
    complianceScore: report?.complianceScore ?? null,
    capsCompliance: report?.capsCompliance ?? null,
    cognitiveBalance: report?.cognitiveBalance ?? null,
    rubricStatus: report?.missingRubrics ? "Missing" : "Complete",
    memorandumStatus: report?.missingMemorandums ? "Incomplete" : "Complete",
    moderationStatus,
    workflowStatus: workflowLabel,
    riskLevel,
    overallRating: deriveOverallRating(report, workflowLabel),
    riskCount: report?.riskIndicators.length ?? 0,
    highRiskCount,
  };
}

export function ratingTone(
  rating: HealthRating
): "success" | "warning" | "critical" | "gold" {
  switch (rating) {
    case "Excellent":
      return "gold";
    case "Good":
      return "success";
    case "Needs Attention":
      return "warning";
    case "High Risk":
      return "critical";
  }
}
