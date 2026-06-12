import { apiFetch } from "../api";
import type { WorkspaceRole } from "../types";

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type EscalationRequest = {
  id: string;
  assessmentId: string;
  assignedRole: WorkspaceRole;
  status: ApprovalRequestStatus;
  comment: string | null;
  createdAt: string;
  respondedAt: string | null;
  assessment: {
    id: string;
    title: string;
    subject: { name: string };
  };
  requestedBy: { id: string; fullName: string };
  respondedBy: { id: string; fullName: string } | null;
};

export type EscalationStatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "all";

export function fetchEscalationRequests(options?: {
  status?: EscalationStatusFilter;
  assignedRole?: WorkspaceRole;
}) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.assignedRole) params.set("assignedRole", options.assignedRole);
  const query = params.toString();
  return apiFetch<{ requests: EscalationRequest[] }>(
    `/moderation-trail/approval-requests${query ? `?${query}` : ""}`
  );
}

export function respondToEscalation(
  requestId: string,
  status: "APPROVED" | "REJECTED",
  comment?: string
) {
  return apiFetch<EscalationRequest>(
    `/moderation-trail/approval-requests/${requestId}/respond`,
    {
      method: "POST",
      body: JSON.stringify({ status, comment: comment?.trim() || undefined }),
    }
  );
}
