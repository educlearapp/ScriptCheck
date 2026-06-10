import type { TemplatePreview } from "../../types";

type Props = {
  preview: TemplatePreview;
  compact?: boolean;
};

export default function TemplatePreviewPanel({ preview, compact }: Props) {
  return (
    <div className="sc-form-grid" style={{ gap: "1rem" }}>
      <div className="sc-grid-3" style={{ gap: "0.75rem" }}>
        <div className="sc-card" style={{ padding: "0.75rem" }}>
          <div className="sc-detail-label">Questions</div>
          <div className="sc-stat-value" style={{ fontSize: "1.2rem" }}>{preview.questionCount}</div>
        </div>
        <div className="sc-card sc-card-gold" style={{ padding: "0.75rem" }}>
          <div className="sc-detail-label">Total marks</div>
          <div className="sc-stat-value" style={{ fontSize: "1.2rem" }}>{preview.totalMarks}</div>
        </div>
        <div className="sc-card" style={{ padding: "0.75rem" }}>
          <div className="sc-detail-label">Created by</div>
          <div style={{ fontSize: "0.9rem" }}>{preview.createdBy.fullName}</div>
        </div>
      </div>

      {!compact ? (
        <>
          <div>
            <div className="sc-detail-label">Topic spread</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
              {preview.topicSpread.map((t) => (
                <span key={t.label} className="sc-badge sc-badge-muted">
                  {t.label} ({t.count})
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="sc-detail-label">Difficulty spread</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
              {preview.difficultySpread.map((d) => (
                <span key={d.label} className="sc-badge sc-badge-gold">
                  {d.label} ({d.count})
                </span>
              ))}
            </div>
          </div>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Topic</th>
                  <th>Marks</th>
                  <th>Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {preview.questions.map((q) => (
                  <tr key={q.orderIndex}>
                    <td>{q.orderIndex}</td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.questionText}>
                      {q.questionText}
                    </td>
                    <td>{q.topic || "—"}</td>
                    <td>{q.marks}</td>
                    <td>{q.difficulty || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
