import { describe, expect, it } from "vitest";
import {
  markingConfirmBusyLabel,
  markingConfirmButtonLabel,
  shouldPrepareMarkingJob,
} from "../utils/markingPrep";
import { formatStatusLabel, formatLayerLabel } from "../utils/statusLabels";
import { getRoleLabel } from "../utils/roleLabels";
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

describe("shouldPrepareMarkingJob", () => {
  it("calls prepare only for marking-pack assessments", () => {
    expect(shouldPrepareMarkingJob(true)).toBe(true);
    expect(shouldPrepareMarkingJob(false)).toBe(false);
    expect(shouldPrepareMarkingJob(null)).toBe(false);
    expect(shouldPrepareMarkingJob(undefined)).toBe(false);
  });

  it("uses plain button labels for each path", () => {
    expect(markingConfirmButtonLabel(true)).toBe("Start Marking");
    expect(markingConfirmButtonLabel(false)).toBe("Continue to Marking");
    expect(markingConfirmBusyLabel(true)).toContain("marking");
    expect(markingConfirmBusyLabel(false)).toBe("Opening marking...");
  });
});

describe("teacher golden-path navigation", () => {
  it("shows only approved teacher sidebar labels", () => {
    const labels = getSidebarLabels(
      user(["TEACHER"], [
        "assessments.view",
        "assessments.create",
        "questionBank.view",
        "results.view",
      ])
    );
    expect(labels).toEqual([...TEACHER_GOLDEN_PATH_LABELS]);
    expect(labels).not.toContain("DH Review");
    expect(labels).not.toContain("Assessment Builder");
    expect(labels).not.toContain("Create Paper");
  });

  it("keeps Department Review for HOD users", () => {
    const labels = getSidebarLabels(
      user(["HOD", "TEACHER"], [
        "assessments.view",
        "assessments.create",
        "questionBank.view",
        "results.view",
        "moderation.queue",
      ])
    );
    expect(labels).toContain("Department Review");
    expect(labels).toContain("Assessment Builder");
    expect(labels).not.toContain("Advanced Tools");
  });
});

describe("plain-language labels", () => {
  it("does not show DH abbreviation on teacher status labels", () => {
    expect(formatStatusLabel("SUBMITTED_TO_HOD")).toBe("Sent to Department Head");
    expect(formatStatusLabel("HOD_REVIEW")).toBe("Sent to Department Head");
    expect(formatLayerLabel("HOD_GREEN")).toBe("Department Head");
    expect(getRoleLabel("HOD")).toBe("Department Head");
    expect(formatStatusLabel("SUBMITTED_TO_HOD")).not.toMatch(/\bDH\b/);
  });
});
