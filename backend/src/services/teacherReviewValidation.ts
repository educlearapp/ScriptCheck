/** Shared Phase 1D/1E contract for private teacher notes. */
export const PRIVATE_TEACHER_NOTES_MAX_LENGTH = 5000;

export class TeacherReviewValidationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "TeacherReviewValidationError";
  }
}

export type TeacherReviewInput = {
  flaggedForReview?: unknown;
  privateTeacherNotes?: unknown;
};

export type NormalizedTeacherReviewPatch = {
  flaggedForReview?: boolean;
  privateTeacherNotes?: string | null;
};

/**
 * Empty notes representation: null.
 * Matches Phase 1D null clears and normalises whitespace-only / empty strings to null
 * so clears stay consistent. Non-empty values are trimmed at the ends only.
 */
export function normalizePrivateTeacherNotes(
  value: unknown
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TeacherReviewValidationError(
      "privateTeacherNotes must be a string or null"
    );
  }
  if (value.length > PRIVATE_TEACHER_NOTES_MAX_LENGTH) {
    throw new TeacherReviewValidationError(
      `privateTeacherNotes must be at most ${PRIVATE_TEACHER_NOTES_MAX_LENGTH} characters`
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function normalizeFlaggedForReview(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new TeacherReviewValidationError("flaggedForReview must be a boolean");
  }
  return value;
}

export function parseTeacherReviewPatch(
  body: TeacherReviewInput
): NormalizedTeacherReviewPatch {
  const flaggedForReview = normalizeFlaggedForReview(body.flaggedForReview);
  const privateTeacherNotes = normalizePrivateTeacherNotes(body.privateTeacherNotes);

  if (flaggedForReview === undefined && privateTeacherNotes === undefined) {
    throw new TeacherReviewValidationError(
      "Provide flaggedForReview and/or privateTeacherNotes to update"
    );
  }

  return {
    ...(flaggedForReview !== undefined ? { flaggedForReview } : {}),
    ...(privateTeacherNotes !== undefined ? { privateTeacherNotes } : {}),
  };
}
