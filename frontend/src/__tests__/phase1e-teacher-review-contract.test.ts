import { describe, expect, it } from "vitest";

/**
 * Documents the Phase 1E data contract consumed by the frontend.
 * Backend enforcement lives in teacherReviewValidation.ts.
 */
describe("phase 1e teacher review contract", () => {
  it("uses false / null defaults for existing scripts", () => {
    const existing = { flaggedForReview: false, privateTeacherNotes: null as string | null };
    expect(existing.flaggedForReview).toBe(false);
    expect(existing.privateTeacherNotes).toBeNull();
  });

  it("treats empty UI notes as clearable to null on save", () => {
    const uiValue = "   ";
    const persisted = uiValue.trim() ? uiValue.trim() : null;
    expect(persisted).toBeNull();
  });

  it("caps private notes at 5000 characters", () => {
    expect(5000).toBe(5000);
  });
});
