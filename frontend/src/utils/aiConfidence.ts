/**
 * Maps existing AI mark metadata only — never invents confidence scores.
 * Prefers numeric `confidence` when present; otherwise known AI comment phrases.
 */

export type AiConfidenceLevel = "high" | "medium" | "low";

export type AiConfidenceDisplay = {
  level: AiConfidenceLevel | null;
  label: string;
};

const HIGH_COMMENTS = [
  "AI: numeric answer matched",
  "AI: answer matches marking guide",
];

const MEDIUM_COMMENTS = [
  "AI: partial credit for written response",
  "AI: partial match to marking guide",
];

const LOW_COMMENTS = [
  "AI: expected numeric answer not found",
  "AI: no answer detected",
  "AI: weak match",
  "AI: no matching answer found",
];

function labelFor(level: AiConfidenceLevel): string {
  if (level === "high") return "High confidence";
  if (level === "medium") return "Medium confidence";
  return "Low confidence";
}

export function resolveAiConfidence(input: {
  confidence?: number | null;
  teacherComment?: string | null;
  hodComment?: string | null;
}): AiConfidenceDisplay {
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    const level: AiConfidenceLevel =
      input.confidence >= 0.7 ? "high" : input.confidence >= 0.4 ? "medium" : "low";
    return { level, label: labelFor(level) };
  }

  const comment = (input.teacherComment ?? input.hodComment ?? "").trim();
  if (!comment.startsWith("AI:")) {
    return { level: null, label: "No confidence available." };
  }

  if (HIGH_COMMENTS.includes(comment)) {
    return { level: "high", label: labelFor("high") };
  }
  if (MEDIUM_COMMENTS.includes(comment)) {
    return { level: "medium", label: labelFor("medium") };
  }
  if (LOW_COMMENTS.includes(comment)) {
    return { level: "low", label: labelFor("low") };
  }

  return { level: null, label: "No confidence available." };
}
