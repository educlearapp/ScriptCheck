import { apiFetch } from "../api";
import type { IntelligenceReport } from "../types/phase2";

export function fetchIntelligenceReport(assessmentId: string) {
  return apiFetch<IntelligenceReport>(`/intelligence/assessments/${assessmentId}`);
}

export function generateIntelligenceReport(assessmentId: string) {
  return apiFetch<IntelligenceReport>(`/intelligence/assessments/${assessmentId}/generate`, {
    method: "POST",
  });
}
