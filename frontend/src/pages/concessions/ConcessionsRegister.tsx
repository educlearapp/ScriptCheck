import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { ConcessionType, Learner, LearnerConcession } from "../../types";
import "./Concessions.css";

const CONCESSION_TYPES: Array<{ value: ConcessionType; label: string }> = [
  { value: "EXTRA_TIME", label: "Extra Time" },
  { value: "READER", label: "Reader" },
  { value: "SCRIBE", label: "Scribe" },
  { value: "ENLARGED_PAPER", label: "Enlarged Paper" },
  { value: "SEPARATE_VENUE", label: "Separate Venue" },
  { value: "ASSISTIVE_TECHNOLOGY", label: "Assistive Technology" },
  { value: "OTHER", label: "Other" },
];

const EMPTY_FORM = {
  learnerId: "",
  concessionType: "EXTRA_TIME" as ConcessionType,
  description: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  expiryDate: "",
  active: true,
};

export default function ConcessionsRegister() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "concessions.manage");

  const [concessions, setConcessions] = useState<LearnerConcession[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [concs, learnerList] = await Promise.all([
        apiFetch<LearnerConcession[]>(
          `/concessions${activeOnly ? "?activeOnly=true" : ""}`
        ),
        apiFetch<Learner[]>("/learners"),
      ]);
      setConcessions(concs);
      setLearners(learnerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load concessions");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.learnerId) return;
    setSaving(true);
    setError("");

    try {
      await apiFetch("/concessions", {
        method: "POST",
        body: JSON.stringify({
          learnerId: form.learnerId,
          concessionType: form.concessionType,
          description: form.description || null,
          effectiveDate: form.effectiveDate,
          expiryDate: form.expiryDate || null,
          active: form.active,
        }),
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create concession");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (concession: LearnerConcession) => {
    if (!canManage) return;
    try {
      await apiFetch(`/concessions/${concession.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !concession.active }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div>
      <div className="concessions-header">
        <div>
          <h1 className="sc-page-title">Learner Concessions</h1>
          <p className="sc-page-subtitle">
            Register accommodations for learners — extra time, reader, scribe, and more.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="sc-btn sc-btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Add concession"}
          </button>
        ) : null}
      </div>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      <label className="concessions-filter">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
        />
        Show active only
      </label>

      {showForm && canManage ? (
        <form className="sc-card concessions-form" onSubmit={handleCreate}>
          <h2>New concession</h2>
          <div className="concessions-form-grid">
            <label>
              Learner *
              <select
                value={form.learnerId}
                onChange={(e) => setForm((f) => ({ ...f, learnerId: e.target.value }))}
                required
              >
                <option value="">— Select learner —</option>
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.learnerNumber} — {l.firstName} {l.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Concession type *
              <select
                value={form.concessionType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    concessionType: e.target.value as ConcessionType,
                  }))
                }
              >
                {CONCESSION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Effective date *
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effectiveDate: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Expiry date
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiryDate: e.target.value }))
                }
              />
            </label>
            <label className="concessions-form-wide">
              Description
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                placeholder="Specific requirements or notes"
              />
            </label>
          </div>
          <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save concession"}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="sc-card" style={{ padding: 0 }}>
          <table className="sc-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Type</th>
                <th>Description</th>
                <th>Effective</th>
                <th>Expiry</th>
                <th>Active</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {concessions.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.learner.fullName}</div>
                    <div className="concessions-learner-meta">
                      {c.learner.learnerNumber}
                      {c.learner.className ? ` · ${c.learner.className}` : ""}
                    </div>
                  </td>
                  <td>{c.concessionLabel}</td>
                  <td>{c.description ?? "—"}</td>
                  <td>{new Date(c.effectiveDate).toLocaleDateString()}</td>
                  <td>
                    {c.expiryDate
                      ? new Date(c.expiryDate).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`concessions-badge${c.active ? " is-active" : ""}`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <button
                        type="button"
                        className="sc-btn sc-btn-ghost sc-btn-sm"
                        onClick={() => toggleActive(c)}
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {concessions.length === 0 ? (
            <p style={{ padding: "1rem" }}>No concessions registered.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
