import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "../../api";
import type { ExaminationOpsSession } from "../../types";

export default function ExaminationPacksPage() {
  const [sessions, setSessions] = useState<ExaminationOpsSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiFetch<ExaminationOpsSession[]>("/examinations/sessions")
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  async function downloadPack() {
    if (!selectedId) return;
    setDownloading(true);
    try {
      await apiDownload(`/examinations/packs/${selectedId}.pdf`, "examination-pack.pdf");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <h1 className="sc-page-title">Examination Pack Generator</h1>
      <p className="sc-page-subtitle">
        Generate candidate register, seating plan, invigilator instructions, concession list, attendance register and incident sheet.
      </p>

      <div className="sc-form-group" style={{ marginTop: "1rem", maxWidth: "24rem" }}>
        <label className="sc-label">Examination session</label>
        <select className="sc-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select session</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0, color: "var(--sc-gold-light)" }}>Pack contents</h3>
        <ul style={{ color: "var(--sc-text-muted)" }}>
          <li>Candidate register</li>
          <li>Seating plan</li>
          <li>Invigilator instructions</li>
          <li>Concession list</li>
          <li>Attendance register</li>
          <li>Incident sheet</li>
        </ul>
        <button type="button" className="sc-btn sc-btn-primary" disabled={!selectedId || downloading} onClick={downloadPack}>
          {downloading ? "Generating…" : "Generate examination pack (PDF)"}
        </button>
      </div>
    </div>
  );
}
