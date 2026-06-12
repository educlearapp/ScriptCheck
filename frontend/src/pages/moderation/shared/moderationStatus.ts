/** Map moderation status strings to visual badge variants. */
export function moderationStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RETURN")) return "sc-mod-status-returned";
  if (
    s.includes("APPROV") ||
    s.includes("GREEN") ||
    s.includes("FINAL") ||
    s.includes("PUBLISH") ||
    s.includes("COMPLETE")
  ) {
    return "sc-mod-status-approved";
  }
  if (s.includes("REVIEW") || s.includes("SUBMIT") || s.includes("PENDING") || s.includes("MODERAT")) {
    return s.includes("REVIEW") || s.includes("MODERAT")
      ? "sc-mod-status-review"
      : "sc-mod-status-pending";
  }
  return "sc-mod-status-neutral";
}
