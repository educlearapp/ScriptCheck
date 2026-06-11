import { useEffect, useState } from "react";
import {
  getAssessmentFiles,
  type AssessmentFileEntry,
} from "../../../services/assessmentSetupApi";

type Props = {
  assessmentId: string;
};

function FileTable({
  title,
  files,
  emptyMessage,
}: {
  title: string;
  files: AssessmentFileEntry[];
  emptyMessage: string;
}) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ color: "var(--sc-gold-light)" }}>{title}</h3>
      {files.length === 0 ? (
        <p style={{ color: "var(--sc-text-muted)" }}>{emptyMessage}</p>
      ) : (
        <div className="sc-card" style={{ padding: 0 }}>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>File Type</th>
                  <th>File Name</th>
                  <th>Uploaded By</th>
                  <th>Date Uploaded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.fileType}</td>
                    <td>
                      {f.fileName}
                      {f.scriptNumber ? (
                        <span className="sc-badge sc-badge-muted" style={{ marginLeft: "0.5rem" }}>
                          Script {f.scriptNumber}
                        </span>
                      ) : null}
                    </td>
                    <td>{f.uploadedBy}</td>
                    <td>{new Date(f.uploadedAt).toLocaleDateString()}</td>
                    <td><span className="sc-badge sc-badge-muted">{f.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AssessmentFilesTab({ assessmentId }: Props) {
  const [assessmentFiles, setAssessmentFiles] = useState<AssessmentFileEntry[]>([]);
  const [scriptFiles, setScriptFiles] = useState<AssessmentFileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssessmentFiles(assessmentId)
      .then((data) => {
        setAssessmentFiles(data.assessmentFiles);
        setScriptFiles(data.scriptFiles);
      })
      .catch(() => {
        setAssessmentFiles([]);
        setScriptFiles([]);
      })
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) return <p>Loading files…</p>;

  const masterTypes = ["Question Paper", "Memorandum", "Rubric", "Supporting Document", "Marking Guideline"];
  const masterFiles = assessmentFiles.filter((f) => masterTypes.includes(f.fileType));
  const learnerScripts = scriptFiles.filter((f) => f.fileType === "Learner Script");

  return (
    <div>
      <p className="sc-page-subtitle" style={{ marginBottom: "1rem" }}>
        All assessment and script files in one place — no hunting through uploads.
      </p>

      <FileTable
        title="Assessment Files"
        files={masterFiles}
        emptyMessage="No master assessment files uploaded yet. Use the Setup Wizard or Paper Vault."
      />

      <FileTable
        title="Learner Scripts"
        files={learnerScripts}
        emptyMessage="No learner scripts uploaded yet. Use bulk script upload from the Setup Wizard."
      />
    </div>
  );
}
