import type { RequirementCoverageItem, TimetableReadiness } from "../../types";
import { ClashPanel } from "./LessonTimetableGrid";
import "./timetable-grid.css";

function statusClass(status: RequirementCoverageItem["status"]) {
  switch (status) {
    case "COMPLETE":
      return "sc-badge-success";
    case "MISSING":
      return "sc-badge-danger";
    case "OVER_SCHEDULED":
      return "sc-badge-warning";
    default:
      return "sc-badge-muted";
  }
}

type Props = {
  readiness: TimetableReadiness | null;
  selectedClassId?: string;
};

export default function ReadinessPanel({ readiness, selectedClassId }: Props) {
  if (!readiness) {
    return null;
  }

  const { readinessSummary: s } = readiness;
  const coverage = selectedClassId
    ? readiness.requirementCoverage.filter((c) => c.classId === selectedClassId)
    : readiness.requirementCoverage;

  return (
    <div style={{ marginTop: "1rem" }}>
      <div
        className="sc-card"
        style={{
          padding: "1.25rem",
          marginBottom: "1rem",
          borderColor: readiness.canPublish ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>
              Timetable Readiness
            </h2>
            <p style={{ margin: "0.35rem 0 0", color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
              {readiness.canPublish
                ? "Ready to Publish — all blocking checks passed."
                : "Not ready to publish — resolve blocking issues below."}
            </p>
          </div>
          <span
            className={`sc-badge ${readiness.canPublish ? "sc-badge-success" : "sc-badge-danger"}`}
            style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
          >
            {readiness.canPublish ? "Ready to Publish" : "Blocked"}
          </span>
        </div>

        {!readiness.canPublish && readiness.blockingReasons.length > 0 ? (
          <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem", color: "#ef4444", fontSize: "0.85rem" }}>
            {readiness.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}

        <div
          className="sc-form-grid"
          style={{ marginTop: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}
        >
          <Metric label="Classes complete" value={`${s.classesWithCompleteRequirements} / ${s.totalClasses}`} />
          <Metric label="Subjects scheduled" value={`${s.subjectsFullyScheduled} / ${s.totalSubjectRequirements}`} />
          <Metric label="Missing periods" value={s.missingPeriodsTotal} warn={s.missingPeriodsTotal > 0} />
          <Metric label="Hard clashes" value={s.hardClashCount} warn={s.hardClashCount > 0} />
          <Metric label="Warnings" value={s.warningCount} warn={s.warningCount > 0} />
          <Metric label="No room" value={s.unassignedRoomCount} warn={s.unassignedRoomCount > 0} />
          <Metric
            label="Teacher violations"
            value={s.teacherAssignmentViolationCount}
            warn={s.teacherAssignmentViolationCount > 0}
          />
          <Metric label="Incomplete subjects" value={s.incompleteSubjectCount} warn={s.incompleteSubjectCount > 0} />
        </div>
      </div>

      {readiness.teacherAssignmentViolations.length > 0 ? (
        <div className="sc-card tt-clash-panel">
          <h3 style={{ marginTop: 0 }}>Teacher assignment violations</h3>
          {readiness.teacherAssignmentViolations.map((v) => (
            <div key={`${v.entryId}-${v.teacherUserId}`} className="tt-clash-item" style={{ color: "#ef4444" }}>
              {v.message}
            </div>
          ))}
        </div>
      ) : null}

      <ClashPanel validation={readiness} />

      {coverage.length > 0 ? (
        <div className="sc-card" style={{ marginTop: "1rem", padding: 0 }}>
          <h3 style={{ padding: "1rem 1.25rem 0", margin: 0 }}>
            {selectedClassId ? "Class requirement coverage" : "Requirement coverage"}
          </h3>
          <table className="sc-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Subject</th>
                <th>Required</th>
                <th>Scheduled</th>
                <th>Missing</th>
                <th>Extra</th>
                <th>Doubles req.</th>
                <th>Doubles sched.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((row) => (
                <tr
                  key={`${row.classId}-${row.subjectId}`}
                  style={row.status !== "COMPLETE" ? { background: "rgba(239, 68, 68, 0.06)" } : undefined}
                >
                  <td>{row.classCode}</td>
                  <td>{row.subjectCode}</td>
                  <td>{row.periodsPerWeek}</td>
                  <td>{row.scheduledPeriods}</td>
                  <td>{row.missingPeriods || "—"}</td>
                  <td>{row.extraPeriods || "—"}</td>
                  <td>{row.doublePeriodsRequired}</td>
                  <td>{row.scheduledDoublePeriods}</td>
                  <td>
                    <span className={`sc-badge ${statusClass(row.status)}`}>
                      {row.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
          <p style={{ margin: 0, color: "var(--sc-text-muted)" }}>
            No subject requirements defined yet. Add requirements under Timetable Setup to track coverage.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0.65rem 0.75rem",
        borderRadius: 6,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${warn ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "var(--sc-text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.1rem", fontWeight: 600, color: warn ? "#ef4444" : undefined }}>
        {value}
      </div>
    </div>
  );
}
