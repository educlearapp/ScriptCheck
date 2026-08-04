/**
 * Marking workbench prepare is only supported for marking-pack assessments.
 * Normal assessments continue straight to manual review after page confirmation.
 */
export function shouldPrepareMarkingJob(isMarkingPack: boolean | null | undefined): boolean {
  return isMarkingPack === true;
}

export function markingConfirmButtonLabel(isMarkingPack: boolean | null | undefined): string {
  return shouldPrepareMarkingJob(isMarkingPack) ? "Start Marking" : "Continue to Marking";
}

export function markingConfirmBusyLabel(isMarkingPack: boolean | null | undefined): string {
  return shouldPrepareMarkingJob(isMarkingPack)
    ? "ScriptCheck is marking..."
    : "Opening marking...";
}
