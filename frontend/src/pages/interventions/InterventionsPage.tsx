import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import type { AtRiskLearner, LearnerIntervention } from "../../types";

const STATUSES = ["OPEN", "IN_PROGRESS", "IMPROVED", "ESCALATED", "CLOSED"] as const;
const REASONS = ["BELOW_THRESHOLD", "CONSECUTIVE_DECLINE", "MULTIPLE_FAILURES"] as const;

export default function InterventionsPage() {
  const [interventions, setInterventions] = useState<LearnerIntervention[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskLearner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    learnerId: "",
    riskReason: "BELOW_THRESHOLD" as (typeof REASONS)[number],
    teacherNotes: "",
    interventionNotes: "",
    reviewDate: "",
  });

  function load() {
    Promise.all([
      apiFetch<LearnerIntervention[]>("/interventions"),
      apiFetch<AtRiskLearner[]>("/analysis/at-risk"),
    ])
      .then(([items, risk]) => {
        setInterventions(items);
        setAtRisk(risk);
      })
      .catch(() => {
        setInterventions([]);
        setAtRisk([]);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/interventions", {
        method: "POST",
        body: JSON.stringify({
          learnerId: form.learnerId,
          riskReason: form.riskReason,
          teacherNotes: form.teacherNotes || undefined,
          interventionNotes: form.interventionNotes || undefined,
          reviewDate: form.reviewDate || undefined,
        }),
      });
      setShowForm(false);
      setForm({
        learnerId: "",
        riskReason: "BELOW_THRESHOLD",
        teacherNotes: "",
        interventionNotes: "",
        reviewDate: "",
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: (typeof STATUSES)[number]) {
    await apiFetch(`/interventions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <h1 className="sc-page-title">Intervention Tracker</h1>
      <p className="sc-page-subtitle">
        Track learner interventions linked to at-risk flags.
      </p>

      <div className="sc-form-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="sc-btn sc-btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New intervention"}
        </button>
      </div>

      {showForm ? (
        <form className="sc-card" style={{ marginTop: "1rem", padding: "1.25rem" }} onSubmit={handleCreate}>
          <div className="sc-form-group">
            <label className="sc-label">Learner</label>
            <select
              className="sc-input"
              required
              value={form.learnerId}
              onChange={(e) => setForm({ ...form, learnerId: e.target.value })}
            >
              <option value="">Select learner</option>
              {atRisk.map((l) => (
                <option key={l.learnerId} value={l.learnerId}>
                  {l.learnerName} ({l.className ?? "—"})
                </option>
              ))}
            </select>
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Risk reason</label>
            <select
              className="sc-input"
              value={form.riskReason}
              onChange={(e) =>
                setForm({ ...form, riskReason: e.target.value as (typeof REASONS)[number] })
              }
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Teacher notes</label>
            <textarea
              className="sc-input"
              rows={2}
              value={form.teacherNotes}
              onChange={(e) => setForm({ ...form, teacherNotes: e.target.value })}
            />
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Intervention notes</label>
            <textarea
              className="sc-input"
              rows={2}
              value={form.interventionNotes}
              onChange={(e) => setForm({ ...form, interventionNotes: e.target.value })}
            />
          </div>
          <div className="sc-form-group">
            <label className="sc-label">Review date</label>
            <input
              type="date"
              className="sc-input"
              value={form.reviewDate}
              onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
            />
          </div>
          <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Create intervention"}
          </button>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {interventions.length ? (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Reason</th>
                <th>Flagged</th>
                <th>Status</th>
                <th>Review</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {interventions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/learners/${item.learnerId}/history`}>{item.learner.learnerName}</Link>
                  </td>
                  <td>{item.riskReason.replaceAll("_", " ")}</td>
                  <td>{new Date(item.dateFlagged).toLocaleDateString()}</td>
                  <td>
                    <select
                      className="sc-input"
                      style={{ minWidth: "8rem" }}
                      value={item.status}
                      onChange={(e) =>
                        updateStatus(item.id, e.target.value as (typeof STATUSES)[number])
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{item.reviewDate ? new Date(item.reviewDate).toLocaleDateString() : "—"}</td>
                  <td>{item.teacherNotes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: "1.25rem", color: "var(--sc-text-muted)" }}>No interventions recorded yet.</p>
        )}
      </div>
    </div>
  );
}
