import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { InvigilatorAssignment } from "../../types";

type Workload = { userId: string; user?: { fullName: string }; assignmentCount: number };
type Coverage = {
  totalSessions: number;
  covered: number;
  uncovered: Array<{ id: string; title: string; scheduledStart: string }>;
};

export default function ExaminationInvigilatorsPage() {
  const [assignments, setAssignments] = useState<InvigilatorAssignment[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<InvigilatorAssignment[]>("/examinations/invigilators"),
      apiFetch<Workload[]>("/examinations/invigilators?workload=true"),
      apiFetch<Coverage>("/examinations/invigilators?coverage=true"),
    ])
      .then(([a, w, c]) => {
        setAssignments(a);
        setWorkload(w);
        setCoverage(c);
      })
      .catch(() => {
        setAssignments([]);
        setWorkload([]);
        setCoverage(null);
      });
  }, []);

  return (
    <div>
      <h1 className="sc-page-title">Invigilator Management</h1>
      <p className="sc-page-subtitle">Invigilator schedules, allocations and coverage reports.</p>

      <div className="sc-grid-3" style={{ marginTop: "1.5rem" }}>
        <div className="sc-card sc-card-gold" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{coverage?.covered ?? "—"}/{coverage?.totalSessions ?? "—"}</div>
          <div>Sessions covered</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{assignments.length}</div>
          <div>Total assignments</div>
        </div>
        <div className="sc-card" style={{ padding: "1.25rem" }}>
          <div className="sc-stat-value">{coverage?.uncovered.length ?? "—"}</div>
          <div>Uncovered sessions</div>
        </div>
      </div>

      {workload.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Workload balancing</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead><tr><th>Invigilator</th><th>Assignments</th></tr></thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.userId}>
                    <td>{w.user?.fullName ?? w.userId}</td>
                    <td>{w.assignmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Examination allocations</h2>
        <div className="sc-card" style={{ padding: 0 }}>
          {assignments.length ? (
            <table className="sc-table">
              <thead>
                <tr><th>Invigilator</th><th>Session</th><th>Date</th><th>Venue</th><th>Lead</th></tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.user.fullName}</td>
                    <td>{a.session.title}</td>
                    <td>{new Date(a.session.scheduledStart).toLocaleString()}</td>
                    <td>{a.venue?.name ?? "—"}</td>
                    <td>{a.isLead ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ padding: "1.25rem", color: "var(--sc-text-muted)" }}>No invigilator assignments yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
