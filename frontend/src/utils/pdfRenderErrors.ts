/** Teacher-facing PDF render failure copy (no pdf.js dependency). */
export function formatPdfRenderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Render failed");
  if (/toHex is not a function/i.test(raw)) {
    return "This paper could not be shown in the viewer. Use Open original paper, or try again.";
  }
  if (/Failed to load page file/i.test(raw)) {
    return "The paper file could not be downloaded. Check your connection and try again.";
  }
  return raw || "This paper could not be shown.";
}
