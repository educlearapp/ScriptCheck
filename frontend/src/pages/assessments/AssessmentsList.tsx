import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { canSubmitAssessment } from "../../auth/permissions";
import type { Assessment } from "../../types";

export default function AssessmentsList() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const loadAssessments = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<Assessment[]>("/assessments")
      .then(setAssessments)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load assessments")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  const canSubmit = (item: Assessment) =>
    canSubmitAssessment(user, item.creatorTeacher.id, item.status);

  const handleSubmitToHod = async (item: Assessment) => {
    setActionError("");
    setSubmittingId(item.id);

    try {
      await apiFetch(`/assessments/${item.id}/submit-to-hod`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      loadAssessments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="sc-page-title">Assessments</h1>
          <p className="sc-page-subtitle">
            Track assessments across CAPS, IEB and Cambridge.
          </p>
        </div>
        <Link to="/assessments/new" className="sc-btn sc-btn-primary">
          Create assessment
        </Link>
      </div>

      {loading ? <p style={{ marginTop: "1.5rem" }}>Loading…</p> : null}
      {error ? <p className="sc-error" style={{ marginTop: "1.5rem" }}>{error}</p> : null}
      {actionError ? (
        <p className="sc-error" style={{ marginTop: "1rem" }}>{actionError}</p>
      ) : null}

      {!loading && !error ? (
        <div className="sc-card" style={{ marginTop: "1.5rem", padding: "0.5rem 0" }}>
          {assessments.length === 0 ? (
            <div className="sc-placeholder-panel">
              <h3>No assessments yet</h3>
              <p>Create your first assessment to get started.</p>
            </div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Curriculum</th>
                    <th>Grade</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Marks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/assessments/${item.id}`}>{item.title}</Link>
                      </td>
                      <td>{item.curriculum.code}</td>
                      <td>{item.grade.name}</td>
                      <td>{item.subject.name}</td>
                      <td>{item.assessmentType.replaceAll("_", " ")}</td>
                      <td>
                        <span
                          className={`sc-badge ${
                            item.status === "RETURNED_TO_TEACHER"
                              ? "sc-badge-gold"
                              : "sc-badge-muted"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>{item.totalMarks}</td>
                      <td>
                        {canSubmit(item) ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost"
                            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                            disabled={submittingId === item.id}
                            onClick={() => handleSubmitToHod(item)}
                          >
                            {submittingId === item.id ? "Submitting…" : "Submit to HOD"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
