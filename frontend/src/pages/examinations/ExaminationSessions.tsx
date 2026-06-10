import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { ExaminationOpsSession } from "../../types";

const STATUSES = ["SCHEDULED", "READY", "IN_PROGRESS", "COMPLETED", "ARCHIVED"] as const;

export default function ExaminationSessionsPage() {
  const [sessions, setSessions] = useState<ExaminationOpsSession[]>([]);

  function load() {
    apiFetch<ExaminationOpsSession[]>("/examinations/sessions")
      .then(setSessions)
      .catch(() => setSessions([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: (typeof STATUSES)[number]) {
    await apiFetch(`/examinations/sessions/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <h1 className="sc-page-title">Examination Session Control</h1>
      <p className="sc-page-subtitle">Track scheduled, in-progress and completed examination sessions.</p>

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {sessions.length ? (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Status</th>
                <th>Venue</th>
                <th>Invigilators</th>
                <th>Learners</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div>{s.title}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                      {new Date(s.scheduledStart).toLocaleString()}
                    </div>
                  </td>
                  <td><span className="sc-badge sc-badge-muted">{s.status.replaceAll("_", " ")}</span></td>
                  <td>{s.venue?.name ?? "—"}</td>
                  <td>{s.invigilators.length}</td>
                  <td>{s.learnerCount}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>
                    <select
                      className="sc-input"
                      value={s.status}
                      onChange={(e) => updateStatus(s.id, e.target.value as (typeof STATUSES)[number])}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>{st.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.25rem", color: "var(--sc-text-muted)" }}>No examination sessions yet. Create from timetable slots.</p>
        )}
      </div>
    </div>
  );
}
