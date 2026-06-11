import { API_URL, apiFetch } from "../api";
import { getAuthToken } from "../auth/session";
import type {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
} from "../components/feedback/feedbackConstants";

export type BetaFeedbackRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  userRole: string;
  subject: string;
  page: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  comment: string;
  screenshotUrl: string | null;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubmitFeedbackInput = {
  userName: string;
  userRole: string;
  subject: string;
  page: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  comment: string;
  screenshot?: File | null;
};

export async function submitBetaFeedback(
  input: SubmitFeedbackInput
): Promise<BetaFeedbackRecord> {
  const formData = new FormData();
  formData.append("userName", input.userName);
  formData.append("userRole", input.userRole);
  formData.append("subject", input.subject);
  formData.append("page", input.page);
  formData.append("category", input.category);
  formData.append("severity", input.severity);
  formData.append("comment", input.comment);
  if (input.screenshot) {
    formData.append("screenshot", input.screenshot);
  }

  const token = getAuthToken();
  const res = await fetch(`${API_URL}/beta-feedback`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as BetaFeedbackRecord;
}

export async function listBetaFeedback(): Promise<BetaFeedbackRecord[]> {
  const data = await apiFetch<{ items: BetaFeedbackRecord[] }>("/beta-feedback");
  return data.items;
}

export async function updateBetaFeedbackStatus(
  id: string,
  status: FeedbackStatus
): Promise<BetaFeedbackRecord> {
  return apiFetch<BetaFeedbackRecord>(`/beta-feedback/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function betaFeedbackScreenshotUrl(id: string): string {
  return `${API_URL}/beta-feedback/${id}/screenshot`;
}
