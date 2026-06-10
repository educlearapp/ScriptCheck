import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import type { ConcessionAlert } from "../../types";
import "./ConcessionAlerts.css";

type Props = {
  assessmentId: string;
  compact?: boolean;
};

export default function ConcessionAlerts({ assessmentId, compact }: Props) {
  const [alerts, setAlerts] = useState<ConcessionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ConcessionAlert[]>(`/concessions/assessments/${assessmentId}/alerts`)
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className={`concession-alerts${compact ? " concession-alerts--compact" : ""}`}>
      <div className="concession-alerts__title">Learners with active concessions</div>
      <ul className="concession-alerts__list">
        {alerts.map((alert) => (
          <li key={alert.learnerId} className="concession-alerts__item">
            <span className="concession-alerts__icon">⚠</span>
            <div>
              <strong>{alert.fullName}</strong>
              {alert.className ? (
                <span className="concession-alerts__class"> ({alert.className})</span>
              ) : null}
              <div className="concession-alerts__summary">{alert.summary}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
