/** User-facing moderation journey labels for teacher and DH workflows. */

export type ModerationJourneyKey =
  | "not_submitted"
  | "submitted_to_dh"
  | "returned"
  | "approved"
  | "escalated";

export function getModerationJourneyStatus(
  status: string,
  hasPendingEscalation = false
): { key: ModerationJourneyKey; label: string } {
  if (hasPendingEscalation) {
    return { key: "escalated", label: "Escalated" };
  }

  const normalized = status.toUpperCase();

  if (normalized === "APPROVED" || normalized === "PUBLISHED" || normalized === "MARKED") {
    return { key: "approved", label: "Approved" };
  }
  if (normalized.includes("RETURN")) {
    return { key: "returned", label: "Returned" };
  }
  if (normalized === "SUBMITTED_TO_HOD" || normalized === "HOD_REVIEW") {
    return { key: "submitted_to_dh", label: "Sent to Department Head" };
  }

  return { key: "not_submitted", label: "Not submitted" };
}

export function moderationJourneyStatusClass(key: ModerationJourneyKey): string {
  switch (key) {
    case "approved":
      return "sc-mod-status-approved";
    case "returned":
      return "sc-mod-status-returned";
    case "submitted_to_dh":
      return "sc-mod-status-review";
    case "escalated":
      return "sc-mod-status-escalated";
    default:
      return "sc-mod-status-neutral";
  }
}
