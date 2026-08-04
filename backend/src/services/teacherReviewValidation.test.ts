import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRIVATE_TEACHER_NOTES_MAX_LENGTH,
  normalizeFlaggedForReview,
  normalizePrivateTeacherNotes,
  parseTeacherReviewPatch,
  TeacherReviewValidationError,
} from "../services/teacherReviewValidation";

describe("teacherReviewValidation", () => {
  it("defaults empty / whitespace notes to null", () => {
    assert.equal(normalizePrivateTeacherNotes(""), null);
    assert.equal(normalizePrivateTeacherNotes("   "), null);
    assert.equal(normalizePrivateTeacherNotes(null), null);
  });

  it("trims non-empty notes", () => {
    assert.equal(normalizePrivateTeacherNotes("  keep this  "), "keep this");
  });

  it("rejects oversized notes", () => {
    assert.throws(
      () => normalizePrivateTeacherNotes("x".repeat(PRIVATE_TEACHER_NOTES_MAX_LENGTH + 1)),
      (err: unknown) => err instanceof TeacherReviewValidationError
    );
  });

  it("rejects non-boolean flags", () => {
    assert.throws(
      () => normalizeFlaggedForReview("true"),
      (err: unknown) => err instanceof TeacherReviewValidationError
    );
  });

  it("parses flag and note patches", () => {
    assert.deepEqual(parseTeacherReviewPatch({ flaggedForReview: true }), {
      flaggedForReview: true,
    });
    assert.deepEqual(parseTeacherReviewPatch({ privateTeacherNotes: "note" }), {
      privateTeacherNotes: "note",
    });
    assert.deepEqual(parseTeacherReviewPatch({ privateTeacherNotes: "  " }), {
      privateTeacherNotes: null,
    });
  });

  it("rejects empty patch bodies", () => {
    assert.throws(
      () => parseTeacherReviewPatch({}),
      (err: unknown) => err instanceof TeacherReviewValidationError
    );
  });
});
