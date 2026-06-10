import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../../api";
import type { ExaminationIncident, ExaminationOpsSession } from "../../types";

const TYPES = ["CANDIDATE_MISCONDUCT", "ABSENTEEISM", "LATE_ARRIVAL", "PAPER_IRREGULARITY", "VENUE_INCIDENT"] as const;
const STATUSES = ["OPEN", "UNDER_REVIEW", "CLOSED"] as const;

export default function ExaminationIncidentsPage() {
  const [incidents, setIncidents] = useState<ExaminationIncident[]>([]);
  const [sessions, setSessions] = useState<ExaminationOpsSession[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sessionId: "", incidentType: "VENUE_INCIDENT" as (typeof TYPES)[number], description: "" });

  function load() {
    Promise.all([
      apiFetch<ExaminationIncident[]>("/examinations/incidents"),
      apiFetch<ExaminationOpsSession[]>("/examinations/sessions"),
    ])
      .then(([i, s]) => {
        setIncidents(i);
        setSessions(s);
      })
      .catch(() => {
        setIncidents([]);
        setSessions([]);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/examinations/incidents", {
      method: "POST",
      body: JSON.stringify({
        sessionId: form.sessionId || undefined,
        incidentType: form.incidentType,
        description: form.description,
      }),
    });
    setShowForm(false);
    load();
  }

  async function updateStatus(id: string, status: (typeof STATUSES)[number]) {
    await apiFetch(`/examinations/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <h1 className="sc-page-title">Examination Incident Register</h1>
      <p className="sc-page-subtitle">Capture and track examination incidents from open through closed.</p>

      <button type="button" className="sc-btn sc-btn-primary" style={{ marginTop: "1rem" }} onClick={() => setShowForm((v) => !v)}>
        {showForm ? "Cancel" : "Log incident"}
      </button>

      {showForm ? (
        <form className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }} onSubmit={create}>
          <div className="sc-form-group">
            <label className="sc-label">Session</label>
            <select className="sc-input" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>
              <option value="">Optional</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Type</label>
            <select className="sc-input" value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value as (typeof TYPES)[number] })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Description</label>
            <textarea className="sc-input" rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="sc-btn sc-btn-primary">Save incident</button>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {incidents.length ? (
          <table className="sc-table">
            <thead>
              <tr><th>Type</th><th>Description</th><th>Session</th><th>Status</th><th>Reported</th></tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id}>
                  <td>{inc.incidentType.replaceAll("_", " ")}</td>
                  <td>{inc.description}</td>
                  <td>{inc.session?.title ?? "—"}</td>
                  <td>
                    <select className="sc-input" value={inc.status} onChange={(e) => updateStatus(inc.id, e.target.value as (typeof STATUSES)[number])}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(inc.reportedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.25rem", color: "var(--sc-text-muted)" }}>No incidents logged.</p>
        )}
      </div>
    </div>
  );
}
