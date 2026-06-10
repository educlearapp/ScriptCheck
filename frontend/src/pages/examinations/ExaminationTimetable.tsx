import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../../api";
import type { ExamVenue, ExaminationSlot, ExaminationTimetable } from "../../types";

export default function ExaminationTimetablePage() {
  const [timetables, setTimetables] = useState<ExaminationTimetable[]>([]);
  const [calendar, setCalendar] = useState<{ view: string; slots: ExaminationSlot[] } | null>(null);
  const [venues, setVenues] = useState<ExamVenue[]>([]);
  const [view, setView] = useState<"weekly" | "daily">("weekly");
  const [showForm, setShowForm] = useState(false);
  const [slotForm, setSlotForm] = useState({
    title: "",
    startTime: "",
    endTime: "",
    durationMinutes: 120,
    venueId: "",
  });

  function load() {
    const now = new Date();
    const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    Promise.all([
      apiFetch<ExaminationTimetable[]>("/examinations/timetable"),
      apiFetch<{ view: string; slots: ExaminationSlot[] }>(
        `/examinations/timetable?start=${now.toISOString()}&end=${end.toISOString()}&view=${view}`
      ),
      apiFetch<ExamVenue[]>("/examinations/venues"),
    ])
      .then(([t, cal, v]) => {
        setTimetables(t);
        setCalendar(cal);
        setVenues(v);
      })
      .catch(() => {
        setTimetables([]);
        setCalendar(null);
        setVenues([]);
      });
  }

  useEffect(() => {
    load();
  }, [view]);

  async function createSlot(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/examinations/timetable/slots", {
      method: "POST",
      body: JSON.stringify({
        ...slotForm,
        venueId: slotForm.venueId || undefined,
      }),
    });
    setShowForm(false);
    load();
  }

  return (
    <div>
      <h1 className="sc-page-title">Examination Timetable</h1>
      <p className="sc-page-subtitle">Plan examination sessions with venue allocation and clash detection.</p>

      <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className={`sc-btn ${view === "weekly" ? "sc-btn-primary" : "sc-btn-ghost"}`} onClick={() => setView("weekly")}>Weekly</button>
        <button type="button" className={`sc-btn ${view === "daily" ? "sc-btn-primary" : "sc-btn-ghost"}`} onClick={() => setView("daily")}>Daily</button>
        <button type="button" className="sc-btn sc-btn-primary" onClick={() => setShowForm((v) => !v)}>Add slot</button>
      </div>

      {showForm ? (
        <form className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }} onSubmit={createSlot}>
          <div className="sc-form-group">
            <label className="sc-label">Title</label>
            <input className="sc-input" required value={slotForm.title} onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })} />
          </div>
          <div className="sc-grid-2" style={{ gap: "1rem" }}>
            <div className="sc-form-group">
              <label className="sc-label">Start</label>
              <input type="datetime-local" className="sc-input" required value={slotForm.startTime} onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })} />
            </div>
            <div className="sc-form-group">
              <label className="sc-label">End</label>
              <input type="datetime-local" className="sc-input" required value={slotForm.endTime} onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })} />
            </div>
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Venue</label>
            <select className="sc-input" value={slotForm.venueId} onChange={(e) => setSlotForm({ ...slotForm, venueId: e.target.value })}>
              <option value="">Select venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name} (cap {v.capacity})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="sc-btn sc-btn-primary">Create slot</button>
        </form>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Examination calendar ({view})</h2>
        <div className="sc-card" style={{ padding: 0 }}>
          {calendar?.slots.length ? (
            <table className="sc-table">
              <thead>
                <tr><th>Title</th><th>Start</th><th>End</th><th>Venue</th><th>Grade</th><th>Subject</th></tr>
              </thead>
              <tbody>
                {calendar.slots.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{new Date(s.startTime).toLocaleString()}</td>
                    <td>{new Date(s.endTime).toLocaleString()}</td>
                    <td>{s.venue?.name ?? "—"}</td>
                    <td>{s.grade?.name ?? "—"}</td>
                    <td>{s.subject?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ padding: "1.25rem", color: "var(--sc-text-muted)" }}>No examination slots scheduled.</p>
          )}
        </div>
      </section>

      {timetables.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>Timetables</h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <tbody>
                {timetables.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}</td>
                    <td>{t.slotCount} slots</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
