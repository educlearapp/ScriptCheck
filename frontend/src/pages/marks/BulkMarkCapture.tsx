import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { BulkCaptureRow } from "../../types";
import ConcessionAlerts from "../../components/concessions/ConcessionAlerts";
import "./Marks.css";

type GridRow = BulkCaptureRow & {
  markInput: string;
  commentInput: string;
  dirty: boolean;
};

const STATUS_LABELS: Record<BulkCaptureRow["status"], string> = {
  not_captured: "Not captured",
  captured: "Captured",
  imported: "Imported",
  script: "From script",
};

export default function BulkMarkCapture() {
  const { id: assessmentId } = useParams<{ id: string }>();
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const loadGrid = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      const data = await apiFetch<BulkCaptureRow[]>(
        `/mark-capture/assessments/${assessmentId}/grid`
      );
      setRows(
        data.map((r) => ({
          ...r,
          markInput: r.mark != null ? String(r.mark) : "",
          commentInput: r.comment ?? "",
          dirty: false,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load grid");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const saveDirtyRows = useCallback(async () => {
    if (!assessmentId) return;
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) return;

    const entries = dirty
      .map((r) => {
        const mark = r.markInput.trim() === "" ? null : Number(r.markInput);
        if (mark != null && Number.isNaN(mark)) return null;
        return {
          learnerId: r.learnerId,
          mark,
          comment: r.commentInput.trim() || null,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (entries.length === 0) return;

    setSaving(true);
    try {
      await apiFetch(`/mark-capture/assessments/${assessmentId}/bulk`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      });
      setLastSaved(new Date());
      setRows((prev) =>
        prev.map((r) =>
          dirty.some((d) => d.learnerId === r.learnerId)
            ? {
                ...r,
                dirty: false,
                mark: r.markInput.trim() === "" ? null : Number(r.markInput),
                comment: r.commentInput.trim() || null,
                status: "captured" as const,
              }
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-save failed");
    } finally {
      setSaving(false);
    }
  }, [assessmentId, rows]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDirtyRows();
    }, 1500);
  }, [saveDirtyRows]);

  const updateCell = (
    learnerId: string,
    field: "markInput" | "commentInput",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.learnerId === learnerId ? { ...r, [field]: value, dirty: true } : r
      )
    );
    scheduleSave();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;

    e.preventDefault();
    const target = e.currentTarget;
    const cellIndex = target.dataset.col === "mark" ? 0 : 1;
    const rowIndex = Number(target.dataset.row ?? 0);

    const pastedRows = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"));

    setRows((prev) => {
      const next = [...prev];
      for (let i = 0; i < pastedRows.length; i++) {
        const rowIdx = rowIndex + i;
        if (rowIdx >= next.length) break;
        const [markVal, commentVal] = pastedRows[i];
        if (cellIndex === 0 && markVal !== undefined) {
          next[rowIdx] = {
            ...next[rowIdx],
            markInput: markVal.trim(),
            dirty: true,
          };
        }
        if (commentVal !== undefined) {
          next[rowIdx] = {
            ...next[rowIdx],
            commentInput: commentVal.trim(),
            dirty: true,
          };
        }
      }
      return next;
    });
    scheduleSave();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: "mark" | "comment"
  ) => {
    let nextRow = rowIndex;
    let nextCol = col;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = Math.min(rowIndex + 1, rows.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = Math.max(rowIndex - 1, 0);
    } else if (e.key === "ArrowRight" && col === "mark") {
      e.preventDefault();
      nextCol = "comment";
    } else if (e.key === "ArrowLeft" && col === "comment") {
      e.preventDefault();
      nextCol = "mark";
    } else if (e.key === "Tab" && !e.shiftKey && col === "comment") {
      e.preventDefault();
      nextRow = Math.min(rowIndex + 1, rows.length - 1);
      nextCol = "mark";
    } else {
      return;
    }

    const selector = `input[data-row="${nextRow}"][data-col="${nextCol}"]`;
    tableRef.current?.querySelector<HTMLInputElement>(selector)?.focus();
  };

  if (!assessmentId) return null;

  return (
    <div className="marks-page">
      <div className="marks-header">
        <div>
          <h1 className="sc-page-title">Bulk Mark Capture</h1>
          <p className="sc-page-subtitle">
            Capture marks in a spreadsheet grid. Paste from Excel, use arrow keys to navigate.
            Changes auto-save.
          </p>
        </div>
        <div className="marks-header-actions">
          <Link
            to={`/assessments/${assessmentId}/import`}
            className="sc-btn sc-btn-ghost"
          >
            Import file
          </Link>
          <Link to={`/assessments/${assessmentId}`} className="sc-btn sc-btn-ghost">
            Back
          </Link>
        </div>
      </div>

      <ConcessionAlerts assessmentId={assessmentId} compact />

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      <div className="marks-save-status">
        {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ""}
      </div>

      {loading ? (
        <p>Loading learners…</p>
      ) : (
        <div className="sc-card marks-grid-card">
          <table className="marks-grid" ref={tableRef}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Mark</th>
                <th>Comment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.learnerId} className={row.dirty ? "is-dirty" : ""}>
                  <td className="marks-grid-learner">
                    <div>{row.learnerName}</div>
                    <div className="marks-grid-meta">
                      {row.learnerNumber}
                      {row.className ? ` · ${row.className}` : ""}
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="marks-grid-input"
                      data-row={rowIndex}
                      data-col="mark"
                      value={row.markInput}
                      onChange={(e) =>
                        updateCell(row.learnerId, "markInput", e.target.value)
                      }
                      onPaste={handlePaste}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, "mark")}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="marks-grid-input"
                      data-row={rowIndex}
                      data-col="comment"
                      value={row.commentInput}
                      onChange={(e) =>
                        updateCell(row.learnerId, "commentInput", e.target.value)
                      }
                      onPaste={handlePaste}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex, "comment")}
                    />
                  </td>
                  <td>
                    <span className={`marks-status marks-status--${row.status}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p style={{ padding: "1rem" }}>No learners found for this assessment.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
