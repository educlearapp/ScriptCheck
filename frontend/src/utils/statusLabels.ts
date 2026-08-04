/** User-facing status labels. Internal enum values are preserved for migration compatibility. */

const STATUS_OVERRIDES: Record<string, string> = {
  SUBMITTED_TO_HOD: "Sent to Department Head",
  HOD_REVIEW: "Sent to Department Head",
  RETURNED_TO_TEACHER: "Returned",
  APPROVED: "Approved",
  HOD_GREEN: "Department Head review",
  HOD_APPROVED: "Approved by Department Head",
};

export function formatStatusLabel(status: string): string {
  return STATUS_OVERRIDES[status] ?? status.replaceAll("_", " ");
}

export function formatLayerLabel(layer: string): string {
  if (layer === "HOD_GREEN") return "Department Head";
  return formatStatusLabel(layer);
}
