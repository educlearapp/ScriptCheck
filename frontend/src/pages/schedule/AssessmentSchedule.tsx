import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import type { AssessmentScheduleData, ScheduleEvent, ScheduleEventType } from "../../types";

const EVENT_LABELS: Record<ScheduleEventType, string> = {
  ASSESSMENT: "Assessment",
  EXAMINATION: "Examination",
  MODERATION_DEADLINE: "Moderation deadline",
  MARKING_DEADLINE: "Marking deadline",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(events: ScheduleEvent[]): [string, ScheduleEvent[]][] {
  const map = new Map<string, ScheduleEvent[]>();
  for (const event of events) {
    const key = event.date.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function AssessmentSchedule() {
  const [data, setData] = useState<AssessmentScheduleData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<AssessmentScheduleData>("/schedule")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schedule"));
  }, []);

  const grouped = data ? groupByDate(data.events) : [];

  return (
    <div>
      <h1 className="sc-page-title">Assessment Schedule</h1>
      <p className="sc-page-subtitle">
        Calendar view of upcoming assessments, examinations, and deadlines
        {data ? ` (${data.scope} view)` : ""}.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {!data ? (
        <p>Loading schedule…</p>
      ) : grouped.length === 0 ? (
        <div className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
          No scheduled events in this period.
        </div>
      ) : (
        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {grouped.map(([date, events]) => (
            <div key={date} className="sc-card" style={{ padding: "1.25rem" }}>
              <h2 style={{ marginTop: 0, fontSize: "1rem", color: "var(--sc-gold-light)" }}>
                {formatDate(events[0].date)}
              </h2>
              <table className="sc-table">
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <span className="sc-badge sc-badge-muted">{EVENT_LABELS[event.type]}</span>
                      </td>
                      <td>{event.title}</td>
                      <td>{event.subject.name}</td>
                      <td>{event.grade.name}</td>
                      <td>{event.creatorTeacher.fullName}</td>
                      <td>
                        <Link to={`/assessments/${event.assessmentId}`} className="sc-btn sc-btn-ghost">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
