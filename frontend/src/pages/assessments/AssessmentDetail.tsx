import { useParams } from "react-router-dom";
import AssessmentCommandCentre from "../../components/assessment/AssessmentCommandCentre";

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <p className="sc-error">Assessment not found</p>;
  }

  return <AssessmentCommandCentre assessmentId={id} />;
}
