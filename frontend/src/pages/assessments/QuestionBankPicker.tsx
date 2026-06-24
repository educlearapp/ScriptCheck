import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type {
  AssessmentDetail,
  QuestionBankItem,
  QuestionBankStatus,
} from "../../types";
import "./QuestionBankPicker.css";

type Props = {
  assessment: AssessmentDetail;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
};

export default function QuestionBankPicker({
  assessment,
  open,
  onClose,
  onAdded,
}: Props) {
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [marks, setMarks] = useState("");
  const [status, setStatus] = useState<QuestionBankStatus | "">("APPROVED");

  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const loadItems = useCallback(() => {
    if (!open) return;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      forPicker: "true",
      curriculumId: assessment.curriculum.id,
      phaseId: assessment.phase.id,
      gradeId: assessment.grade.id,
      subjectId: assessment.subject.id,
    });
    if (topic) params.set("topic", topic);
    if (subtopic) params.set("subtopic", subtopic);
    if (difficulty) params.set("difficulty", difficulty);
    if (marks) params.set("marks", marks);
    if (status) params.set("status", status);

    apiFetch<QuestionBankItem[]>(`/question-bank?${params}`)
      .then(setItems)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load question library")
      )
      .finally(() => setLoading(false));
  }, [open, assessment, topic, subtopic, difficulty, marks, status]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setStatus("APPROVED");
    }
  }, [open]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const handleAddSelected = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    setError("");
    try {
      await apiFetch(`/assessments/${assessment.id}/questions/from-bank`, {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add questions");
    } finally {
      setAdding(false);
    }
  };

  if (!open) return null;

  return (
    <div className="sc-qb-picker-overlay" onClick={onClose}>
      <div className="sc-qb-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sc-qb-picker-header">
          <div>
            <h2 style={{ margin: 0, color: "var(--sc-gold-light)" }}>Question Library</h2>
            <p className="sc-page-subtitle" style={{ margin: "0.35rem 0 0" }}>
              {assessment.subject.name} · {assessment.grade.name} · Approved questions shown first
            </p>
          </div>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="sc-qb-picker-body">
          <div className="sc-qb-picker-filters">
            <div>
              <label className="sc-label">Topic</label>
              <input className="sc-input" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="sc-label">Subtopic</label>
              <input className="sc-input" value={subtopic} onChange={(e) => setSubtopic(e.target.value)} />
            </div>
            <div>
              <label className="sc-label">Difficulty</label>
              <input className="sc-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />
            </div>
            <div>
              <label className="sc-label">Marks</label>
              <input className="sc-input" type="number" min={1} value={marks} onChange={(e) => setMarks(e.target.value)} />
            </div>
            <div>
              <label className="sc-label">Status</label>
              <select className="sc-select" value={status} onChange={(e) => setStatus(e.target.value as QuestionBankStatus | "")}>
                <option value="">All active</option>
                <option value="APPROVED">Approved</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>
          </div>

          {error ? <p className="sc-error">{error}</p> : null}

          {loading ? (
            <p>Loading questions…</p>
          ) : items.length === 0 ? (
            <p style={{ color: "var(--sc-text-muted)" }}>No matching questions in the library.</p>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selected.size === items.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Question</th>
                    <th>Topic</th>
                    <th>Marks</th>
                    <th>Difficulty</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Used</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.questionText}>
                        {item.questionText}
                      </td>
                      <td>{item.topic || "—"}</td>
                      <td>{item.marks}</td>
                      <td>{item.difficulty || "—"}</td>
                      <td>
                        <span className="sc-badge sc-badge-muted">{item.source.replaceAll("_", " ")}</span>
                      </td>
                      <td>
                        {item.status === "APPROVED" ? (
                          <span className="sc-hod-badge">✓ DH Approved</span>
                        ) : (
                          <span className="sc-badge sc-badge-muted">{item.status}</span>
                        )}
                      </td>
                      <td>{item.usageCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sc-qb-picker-footer">
          <span style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
            {selected.size} selected
          </span>
          <div className="sc-form-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={adding || selected.size === 0}
              onClick={handleAddSelected}
            >
              {adding ? "Adding…" : "Add Selected Questions"}
            </button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
