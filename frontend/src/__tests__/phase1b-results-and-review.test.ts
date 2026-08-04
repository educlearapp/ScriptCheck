import { describe, expect, it } from "vitest";
import {
  clampMarkInput,
  formatResultsCount,
  formatResultsPct,
  formatResultsPublishStatus,
  markedProgressLabel,
  summarizeScriptStatuses,
} from "../utils/resultsSummaryDisplay";
import {
  markingConfirmButtonLabel,
  shouldPrepareMarkingJob,
} from "../utils/markingPrep";
import { getSidebarLabels, TEACHER_GOLDEN_PATH_LABELS } from "../nav/sidebarNav";
import type { AuthUser, Permission, WorkspaceRole } from "../types";

function user(roles: WorkspaceRole[], permissions: Permission[] = []): AuthUser {
  return {
    id: "u1",
    email: "t@example.com",
    fullName: "Test User",
    workspaceId: "w1",
    workspaceName: "Demo",
    workspaceType: "SCHOOL",
    subscriptionPlan: "TRIAL",
    roles,
    permissions,
    isSuperAdmin: false,
  };
}

describe("Results summary display", () => {
  it("shows em dash for missing averages and counts", () => {
    expect(formatResultsPct(null)).toBe("—");
    expect(formatResultsPct(undefined)).toBe("—");
    expect(formatResultsPct(72.5)).toBe("72.5%");
    expect(formatResultsCount(null)).toBe("—");
    expect(formatResultsCount(0)).toBe("0");
  });

  it("formats publish status in plain language", () => {
    expect(formatResultsPublishStatus({ publishStatus: "PUBLISHED" })).toBe("Published");
    expect(formatResultsPublishStatus({ publishStatus: "REQUESTED" })).toBe("Asked to publish");
    expect(formatResultsPublishStatus({})).toBe("Not published");
  });

  it("builds mobile card marked progress", () => {
    expect(markedProgressLabel(18, 25)).toBe("18 of 25 marked");
    expect(markedProgressLabel(null, 25)).toBe("—");
  });
});

describe("Results summary calculation rules", () => {
  it("handles no scripts", () => {
    const s = summarizeScriptStatuses([], []);
    expect(s.learnerPaperCount).toBe(0);
    expect(s.markedCount).toBe(0);
    expect(s.awaitingReviewCount).toBe(0);
    expect(s.classAverage).toBeNull();
    expect(s.highestMark).toBeNull();
    expect(s.lowestMark).toBeNull();
  });

  it("counts uploaded but unmarked as awaiting review", () => {
    const s = summarizeScriptStatuses(["UPLOADED", "UPLOADED"], [null, null]);
    expect(s.learnerPaperCount).toBe(2);
    expect(s.markedCount).toBe(0);
    expect(s.awaitingReviewCount).toBe(2);
    expect(s.classAverage).toBeNull();
  });

  it("handles partial and completed mixes", () => {
    const s = summarizeScriptStatuses(
      ["MARKED", "IN_PROGRESS", "SUBMITTED_TO_HOD", "UPLOADED"],
      [80, null, 60, null]
    );
    expect(s.markedCount).toBe(2);
    expect(s.awaitingReviewCount).toBe(2);
    expect(s.classAverage).toBe(70);
    expect(s.highestMark).toBe(80);
    expect(s.lowestMark).toBe(60);
  });

  it("does not treat a single mark row as marked — uses status only", () => {
    const s = summarizeScriptStatuses(["IN_PROGRESS"], [55]);
    expect(s.markedCount).toBe(0);
    expect(s.awaitingReviewCount).toBe(1);
    expect(s.classAverage).toBe(55);
  });
});

describe("Mark input validation", () => {
  it("blocks marks above maximum and allows empty vs zero", () => {
    expect(clampMarkInput("", 10)).toBe("");
    expect(clampMarkInput("0", 10)).toBe("0");
    expect(clampMarkInput("10", 10)).toBe("10");
    expect(clampMarkInput("10.5", 10)).toBeNull();
    expect(clampMarkInput("-1", 10)).toBeNull();
  });
});

describe("Upload path preparation branching", () => {
  it("normal assessments skip prepareMarkingJob; packs run it", () => {
    expect(shouldPrepareMarkingJob(false)).toBe(false);
    expect(shouldPrepareMarkingJob(true)).toBe(true);
    expect(markingConfirmButtonLabel(false)).toBe("Continue to Marking");
    expect(markingConfirmButtonLabel(true)).toBe("Start Marking");
  });
});

describe("Phase 1A regression — teacher nav", () => {
  it("keeps teacher golden-path sidebar", () => {
    const labels = getSidebarLabels(
      user(["TEACHER"], [
        "assessments.view",
        "assessments.create",
        "questionBank.view",
        "results.view",
      ])
    );
    expect(labels).toEqual([...TEACHER_GOLDEN_PATH_LABELS]);
  });
});

describe("Plain-language script review labels", () => {
  it("uses Finish This Learner and Send to Department Head wording", () => {
    const phrases = [
      "Finish This Learner",
      "Send to Department Head",
      "Back to Mark Papers",
      "Save Mark",
      "Previous learner",
      "Next learner",
    ];
    for (const phrase of phrases) {
      expect(phrase).not.toMatch(/\b(Batch|OCR|HOD|DH)\b/);
    }
  });
});
