import { useCallback, useState } from "react";
import type { FeedbackStatus } from "../components/feedback/feedbackConstants";
import {
  listBetaFeedback,
  submitBetaFeedback,
  updateBetaFeedbackStatus,
  type BetaFeedbackRecord,
  type SubmitFeedbackInput,
} from "../services/feedbackApi";

export function useFeedback() {
  const [items, setItems] = useState<BetaFeedbackRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listBetaFeedback();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  const submit = useCallback(async (input: SubmitFeedbackInput) => {
    setSubmitting(true);
    setError("");
    try {
      const created = await submitBetaFeedback(input);
      setItems((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const updateStatus = useCallback(async (id: string, status: FeedbackStatus) => {
    setError("");
    try {
      const updated = await updateBetaFeedbackStatus(id, status);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
      throw err;
    }
  }, []);

  return {
    items,
    loading,
    submitting,
    error,
    load,
    submit,
    updateStatus,
  };
}
