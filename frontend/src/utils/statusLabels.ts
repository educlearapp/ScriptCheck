/** User-facing status labels. Internal enum values are preserved for migration compatibility. */

const STATUS_OVERRIDES: Record<string, string> = {
  SUBMITTED_TO_HOD: "Submitted to DH",
  HOD_REVIEW: "DH Review",
  HOD_GREEN: "DH Layer",
  HOD_APPROVED: "DH Approved",
};

export function formatStatusLabel(status: string): string {
  return STATUS_OVERRIDES[status] ?? status.replaceAll("_", " ");
}

export function formatLayerLabel(layer: string): string {
  if (layer === "HOD_GREEN") return "DH";
  return formatStatusLabel(layer);
}
