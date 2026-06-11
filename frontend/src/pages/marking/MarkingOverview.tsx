import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMarkingOverview, type MarkingOverviewItem } from "../../services/assessmentSetupApi";
import { formatStatusLabel } from "../../utils/statusLabels";
import "../dashboard/Dashboard.css";

export default function MarkingOverview() {
  const [items, setItems] = useState<MarkingOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMarkingOverview()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading marking queue…</p>;

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <h1 className="sc-page-title">Marking</h1>
          <p className="sc-page-subtitle">
            Assessments awaiting marking and script upload.
          </p>
        </div>
        <div className="sc-dash-meta">
          <span className="sc-dash-meta-pill">
            Awaiting: <strong>{items.length}</strong>
          </span>
        </div>
      </header>

      {items.length ? (
        <div className="sc-card" style={{ padding: 0 }}>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Assessment Name</th>
                  <th>Grade</th>
                  <th>Subject</th>
                  <th>Scripts</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.grade.name}</td>
                    <td>{item.subject.name}</td>
                    <td>{item.scriptCount}</td>
                    <td>
                      <span className="sc-badge sc-badge-muted">
                        {item.statusLabel || formatStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        {item.batchId ? (
                          <Link
                            to={`/assessments/${item.id}/scripts`}
                            className="sc-btn sc-btn-primary"
                            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                          >
                            Open Marking Workspace
                          </Link>
                        ) : null}
                        <Link
                          to={item.setupComplete ? `/assessments/${item.id}/scripts` : `/assessments/${item.id}/setup`}
                          className="sc-btn sc-btn-ghost"
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Upload Scripts
                        </Link>
                        <Link
                          to={`/assessments/${item.id}`}
                          className="sc-btn sc-btn-ghost"
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Open Assessment
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="sc-card">
          <p className="sc-dash-empty">No assessments awaiting marking.</p>
          <Link to="/assessments" className="sc-btn sc-btn-ghost" style={{ marginTop: "0.75rem" }}>
            View Assessments
          </Link>
        </div>
      )}
    </div>
  );
}
