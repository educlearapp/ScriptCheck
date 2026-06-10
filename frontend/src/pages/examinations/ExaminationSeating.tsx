import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "../../api";
import type { ExaminationOpsSession, SeatingPlanData } from "../../types";

export default function ExaminationSeatingPage() {
  const [sessions, setSessions] = useState<ExaminationOpsSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [plan, setPlan] = useState<SeatingPlanData | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    apiFetch<ExaminationOpsSession[]>("/examinations/sessions")
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPlan(null);
      return;
    }
    apiFetch<SeatingPlanData | null>(`/examinations/seating/${selectedId}`)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [selectedId]);

  async function generate() {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const data = await apiFetch<SeatingPlanData>(`/examinations/seating/${selectedId}/generate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPlan(data);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="sc-page-title">Seating Plans</h1>
      <p className="sc-page-subtitle">Automatic candidate allocation with manual adjustment support.</p>

      <div className="sc-form-group" style={{ marginTop: "1rem", maxWidth: "24rem" }}>
        <label className="sc-label">Examination session</label>
        <select className="sc-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select session</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title} — {s.venue?.name ?? "No venue"}</option>
          ))}
        </select>
      </div>

      {selectedId ? (
        <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="sc-btn sc-btn-primary" disabled={generating} onClick={generate}>
            {generating ? "Generating…" : "Generate seating plan"}
          </button>
          {plan ? (
            <>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => apiDownload(`/examinations/seating/${selectedId}/plan.pdf`, "seating-plan.pdf")}>
                Download seating PDF
              </button>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => apiDownload(`/examinations/seating/${selectedId}/candidates.pdf`, "candidate-list.pdf")}>
                Download candidate list
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ color: "var(--sc-gold-light)", fontSize: "1.1rem" }}>
            {plan.session.title} · {plan.venue.name} ({plan.rows}×{plan.columns})
          </h2>
          <div className="sc-card" style={{ padding: 0 }}>
            <table className="sc-table">
              <thead><tr><th>Seat</th><th>Candidate</th><th>Number</th><th>Class</th></tr></thead>
              <tbody>
                {plan.allocations.map((a) => (
                  <tr key={a.learnerId}>
                    <td>{a.seatLabel}</td>
                    <td>{a.learnerName}</td>
                    <td>{a.learnerNumber}</td>
                    <td>{a.className ?? "—"}</td>
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
