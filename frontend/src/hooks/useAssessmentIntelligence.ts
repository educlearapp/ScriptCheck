import { useCallback, useEffect, useState } from "react";
import {
  fetchIntelligenceReport,
  generateIntelligenceReport,
} from "../services/intelligenceApi";
import type { IntelligenceReport } from "../types/phase2";

export function useAssessmentIntelligence(assessmentId: string | undefined) {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(Boolean(assessmentId));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchIntelligenceReport(assessmentId);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(async () => {
    if (!assessmentId) return null;
    setGenerating(true);
    setError("");
    try {
      const data = await generateIntelligenceReport(assessmentId);
      setReport(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [assessmentId]);

  return { report, loading, generating, error, refresh, generate };
}
