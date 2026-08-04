import { describe, expect, it } from "vitest";
import { resolveAiConfidence } from "../utils/aiConfidence";
import { computeBatchDashboardStats } from "../utils/batchMarkingDashboard";
import { validateBatchBeforeHodSubmit } from "../utils/submitValidation";

describe("ai confidence from existing metadata only", () => {
  it("maps known high/medium/low AI comments", () => {
    expect(resolveAiConfidence({ teacherComment: "AI: answer matches marking guide" }).label).toBe(
      "High confidence"
    );
    expect(
      resolveAiConfidence({ teacherComment: "AI: partial match to marking guide" }).label
    ).toBe("Medium confidence");
    expect(resolveAiConfidence({ teacherComment: "AI: no matching answer found" }).label).toBe(
      "Low confidence"
    );
  });

  it("does not invent confidence for unknown or missing comments", () => {
    expect(resolveAiConfidence({ teacherComment: "Teacher override" }).label).toBe(
      "No confidence available."
    );
    expect(resolveAiConfidence({}).label).toBe("No confidence available.");
  });

  it("uses numeric confidence when present", () => {
    expect(resolveAiConfidence({ confidence: 0.9 }).level).toBe("high");
    expect(resolveAiConfidence({ confidence: 0.5 }).level).toBe("medium");
    expect(resolveAiConfidence({ confidence: 0.1 }).level).toBe("low");
  });
});

describe("batch dashboard stats", () => {
  it("computes totals and next unfinished learner", () => {
    const stats = computeBatchDashboardStats([
      { id: "a", status: "UPLOADED" },
      { id: "b", status: "MARKING", teacherTotal: 10 },
      { id: "c", status: "MARKED", teacherTotal: 20, flaggedForReview: true },
      { id: "d", status: "SUBMITTED_TO_HOD", finalTotal: 18 },
    ]);
    expect(stats.totalScripts).toBe(4);
    expect(stats.notStarted).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.marked).toBe(2);
    expect(stats.submitted).toBe(1);
    expect(stats.flaggedForReview).toBe(1);
    expect(stats.nextUnfinishedScriptId).toBe("a");
    expect(stats.allMarked).toBe(false);
  });
});

describe("submit validation", () => {
  it("flags blank questions, ranges, and totals mismatch", () => {
    const result = validateBatchBeforeHodSubmit({
      scripts: [
        {
          id: "1",
          learnerName: "Ada",
          status: "MARKED",
          teacherTotal: 5,
          questionMarks: [
            { questionNumber: "1", maxMarks: 2, teacherMark: null },
            { questionNumber: "2", maxMarks: 2, teacherMark: 5 },
            { questionNumber: "3", maxMarks: 2, teacherMark: 2 },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "blank_question")).toBe(true);
    expect(result.issues.some((i) => i.code === "invalid_range")).toBe(true);
  });
});
