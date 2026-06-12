import type { DayOfWeek, LessonEntry, PeriodDefinition, TimetableClash } from "../../types";
import {
  DAY_LABELS,
  DAYS,
  buildEntryMap,
  clashesForCell,
  sortPeriods,
} from "./timetableUtils";
import { isRoomIssueClashType } from "./roomIntelligence";
import { isTeacherWorkloadClashType } from "./teacherWorkload";
import "./timetable-grid.css";

type Props = {
  periods: PeriodDefinition[];
  entries: LessonEntry[];
  clashes?: TimetableClash[];
  readonly?: boolean;
  showClass?: boolean;
  onCellClick?: (day: DayOfWeek, period: PeriodDefinition, entry?: LessonEntry) => void;
};

export default function LessonTimetableGrid({
  periods,
  entries,
  clashes = [],
  readonly = false,
  showClass = false,
  onCellClick,
}: Props) {
  const entryMap = buildEntryMap(entries);
  const sortedPeriods = sortPeriods(periods);

  return (
    <div className="tt-grid-wrap">
      <table className="tt-grid">
        <thead>
          <tr>
            <th>Period</th>
            {DAYS.map((day) => (
              <th key={day}>{DAY_LABELS[day]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedPeriods.map((period) => {
            const isBreak = period.periodType === "BREAK";
            return (
              <tr key={period.id}>
                <td className="tt-period-label">
                  {period.label}
                  <span className="tt-period-time">
                    {period.startTime}–{period.endTime}
                  </span>
                </td>
                {DAYS.map((day) => {
                  if (isBreak) {
                    return (
                      <td key={day} className="tt-cell is-break">
                        Break
                      </td>
                    );
                  }

                  const entry = entryMap.get(`${day}:${period.id}`);
                  const cellClashes = entry
                    ? clashes.filter(
                        (c) =>
                          (c.entryId === entry.id || c.conflictingEntryId === entry.id) &&
                          c.dayOfWeek === day &&
                          (c.periodId === period.id || clashesForCell(clashes, day, period.id).length > 0)
                      )
                    : clashesForCell(clashes, day, period.id);
                  const hasHard = cellClashes.some((c) => c.severity === "HARD");
                  const hasWarning = cellClashes.some((c) => c.severity === "WARNING");
                  const hasRoomIssue = cellClashes.some(
                    (c) => c.severity === "WARNING" && isRoomIssueClashType(c.type)
                  );
                  const hasWorkloadIssue = cellClashes.some(
                    (c) => c.severity === "WARNING" && isTeacherWorkloadClashType(c.type)
                  );

                  return (
                    <td
                      key={day}
                      className={[
                        "tt-cell",
                        readonly ? "is-readonly" : "",
                        hasHard ? "is-clash" : hasWarning ? "is-warning" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (!isBreak && !readonly && onCellClick) {
                          onCellClick(day, period, entry);
                        }
                      }}
                    >
                      {entry ? (
                        <div className="tt-lesson">
                          <div className="tt-lesson-subject">
                            {entry.subject.code}
                            {entry.isDoublePeriod ? " (2×)" : ""}
                            {hasRoomIssue ? (
                              <span className="tt-room-warning-badge" title="Room issue">
                                ⚠
                              </span>
                            ) : null}
                            {hasWorkloadIssue ? (
                              <span className="tt-workload-warning-badge" title="Teacher workload issue">
                                W
                              </span>
                            ) : null}
                          </div>
                          {showClass ? (
                            <div className="tt-lesson-meta">{entry.schoolClass.code}</div>
                          ) : null}
                          <div className="tt-lesson-meta">{entry.teacher.fullName}</div>
                          <div className="tt-lesson-meta">
                            {entry.room ? entry.room.code : "No room"}
                            {hasRoomIssue ? (
                              <span className="tt-room-warning-label"> room issue</span>
                            ) : null}
                            {hasWorkloadIssue ? (
                              <span className="tt-workload-warning-label"> workload</span>
                            ) : null}
                          </div>
                          {entry.locked ? (
                            <div className="tt-lesson-locked">Locked</div>
                          ) : null}
                        </div>
                      ) : (
                        !readonly && <span className="tt-lesson-meta">+ Add</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ClashPanel({
  validation,
}: {
  validation: { hardClashes: TimetableClash[]; warnings: TimetableClash[]; valid: boolean } | null;
}) {
  if (!validation || (validation.hardClashes.length === 0 && validation.warnings.length === 0)) {
    return validation?.valid ? (
      <div className="sc-card tt-clash-panel" style={{ color: "#22c55e" }}>
        No clashes detected.
      </div>
    ) : null;
  }

  return (
    <div className="sc-card tt-clash-panel">
      <h3 style={{ marginTop: 0 }}>Clashes & warnings</h3>
      {validation.hardClashes.map((c, i) => (
        <div key={`h-${i}`} className="tt-clash-item" style={{ color: "#ef4444" }}>
          <strong>HARD — {c.type}:</strong> {c.message}
        </div>
      ))}
      {validation.warnings.map((c, i) => (
        <div key={`w-${i}`} className="tt-clash-item" style={{ color: "#f59e0b" }}>
          <strong>Warning — {c.type}:</strong> {c.message}
        </div>
      ))}
    </div>
  );
}
