import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL, apiDownload, apiFetch } from "../../api";
import { getAuthToken } from "../../auth/session";
import { useAuth } from "../../auth/AuthContext";
import { useTrialGate } from "../../trial/TrialGateContext";
import { hasPermission } from "../../auth/permissions";
import AssessmentIntelligenceHeader from "../../components/assessment/AssessmentIntelligenceHeader";
import PaperAuditTimeline from "../../components/paperVault/PaperAuditTimeline";
import ModerationReturnModal from "../moderation/shared/ModerationReturnModal";
import "../moderation/ModerationWorkflow.css";
import "../../components/intelligence/AssessmentHealthReport.css";
import type {
  AssessmentDetail,
  PaperDocumentType,
  PaperVaultAuditEntry,
  PaperVaultDocument,
  PaperVaultStatus,
} from "../../types";
import "./PaperVault.css";

const DOCUMENT_TYPES: { value: PaperDocumentType; label: string }[] = [
  { value: "QUESTION_PAPER", label: "Question Paper" },
  { value: "MEMORANDUM", label: "Memorandum" },
  { value: "MARKING_GUIDELINE", label: "Marking Guideline" },
  { value: "RUBRIC_ATTACHMENT", label: "Rubric Attachment" },
  { value: "SUPPORTING_MATERIAL", label: "Supporting Material" },
];

const STATUS_LABELS: Record<PaperVaultStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  LOCKED: "Locked",
  RELEASED: "Released",
  ARCHIVED: "Archived",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: PaperVaultStatus): string {
  return `sc-paper-status sc-paper-status-${status.toLowerCase().replace(/_/g, "-")}`;
}

export default function AssessmentPaperVault() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { gateProductionAction } = useTrialGate();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [documents, setDocuments] = useState<PaperVaultDocument[]>([]);
  const [auditEntries, setAuditEntries] = useState<PaperVaultAuditEntry[]>([]);
  const [versionHistory, setVersionHistory] = useState<PaperVaultDocument[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [uploadType, setUploadType] = useState<PaperDocumentType>("QUESTION_PAPER");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [replaceGroupId, setReplaceGroupId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  const [releaseDocId, setReleaseDocId] = useState<string | null>(null);
  const [releaseAt, setReleaseAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [commentModal, setCommentModal] = useState<{
    docId: string;
    action: "return" | "approve";
    title: string;
  } | null>(null);
  const [commentText, setCommentText] = useState("");

  const canUpload = hasPermission(user, "paperVault.upload");
  const canViewArchived = hasPermission(user, "paperVault.archive");

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [detail, vault] = await Promise.all([
        apiFetch<AssessmentDetail>(`/assessments/${id}`),
        apiFetch<{ documents: PaperVaultDocument[] }>(
          `/assessments/${id}/paper-vault?includeArchived=${includeArchived}`
        ),
      ]);
      setAssessment(detail);
      setDocuments(vault.documents);

      const audit = await apiFetch<{ entries: PaperVaultAuditEntry[] }>(
        `/assessments/${id}/paper-vault/audit`
      );
      setAuditEntries(audit.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paper vault");
    } finally {
      setLoading(false);
    }
  }, [id, includeArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadVersionHistory = async (documentGroupId: string) => {
    if (!id) return;
    setSelectedGroupId(documentGroupId);
    try {
      const data = await apiFetch<{ versions: PaperVaultDocument[] }>(
        `/assessments/${id}/paper-vault/groups/${documentGroupId}/versions`
      );
      setVersionHistory(data.versions);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to load versions");
    }
  };

  const runAction = async (documentId: string, action: string, body?: object) => {
    if (!id) return;
    if (action === "release" && !gateProductionAction()) return;
    setActionLoading(`${documentId}-${action}`);
    setActionError("");
    try {
      await apiFetch(`/assessments/${id}/paper-vault/${documentId}/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setReleaseDocId(null);
      await loadData();
      if (selectedGroupId) {
        await loadVersionHistory(selectedGroupId);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !uploadFile) return;
    setUploading(true);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("documentType", uploadType);
      if (replaceGroupId) {
        formData.append("documentGroupId", replaceGroupId);
      }

      const token = getAuthToken();
      const res = await fetch(`${API_URL}/assessments/${id}/paper-vault/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const text = await res.text();
      let data: { error?: string } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error(data?.error ?? `Upload failed (${res.status})`);
      }

      setUploadFile(null);
      setReplaceGroupId(undefined);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: PaperVaultDocument) => {
    if (!id) return;
    if (!gateProductionAction()) return;
    setActionError("");
    try {
      await apiDownload(
        `/assessments/${id}/paper-vault/${doc.id}/download`,
        doc.fileName
      );
      const audit = await apiFetch<{ entries: PaperVaultAuditEntry[] }>(
        `/assessments/${id}/paper-vault/audit`
      );
      setAuditEntries(audit.entries);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (loading) {
    return <p>Loading paper vault…</p>;
  }

  if (error || !assessment) {
    return (
      <div>
        <p className="sc-error">{error || "Assessment not found"}</p>
        <Link to="/assessments" className="sc-btn sc-btn-ghost">
          Back to assessments
        </Link>
      </div>
    );
  }

  return (
    <div className="sc-paper-vault">
      <div className="sc-detail-header">
        <div>
          <Link to={`/assessments/${id}`} className="sc-detail-back">
            ← {assessment.title}
          </Link>
          <h1 className="sc-page-title">Paper Vault</h1>
          <p className="sc-page-subtitle">
            Secure examination papers, memorandums, and marking materials
          </p>
          {id ? <AssessmentIntelligenceHeader assessmentId={id} /> : null}
        </div>
      </div>

      {actionError ? <p className="sc-error">{actionError}</p> : null}

      {canUpload ? (
        <section className="sc-paper-section">
          <h2>Upload document</h2>
          <form className="sc-paper-upload-form" onSubmit={handleUpload}>
            <label>
              Document type
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as PaperDocumentType)}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              File (PDF, Word, JPEG, PNG — max 25 MB)
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {replaceGroupId ? (
              <p className="sc-paper-hint">Uploading new version for selected document group.</p>
            ) : null}
            <button
              type="submit"
              className="sc-btn sc-btn-primary"
              disabled={!uploadFile || uploading}
            >
              {uploading ? "Uploading…" : replaceGroupId ? "Upload new version" : "Upload draft"}
            </button>
            {replaceGroupId ? (
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                onClick={() => setReplaceGroupId(undefined)}
              >
                Cancel version upload
              </button>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="sc-paper-section">
        <div className="sc-paper-section-header">
          <h2>Documents</h2>
          {canViewArchived ? (
            <label className="sc-paper-checkbox">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Show archived
            </label>
          ) : null}
        </div>

        {documents.length === 0 ? (
          <p className="sc-script-empty">No documents uploaded yet.</p>
        ) : (
          <div className="sc-paper-table-wrap">
            <table className="sc-paper-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Uploaded by</th>
                  <th>Release window</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const wf = doc.workflow;
                  const typeLabel =
                    DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label ??
                    doc.documentType;

                  return (
                    <tr key={doc.id}>
                      <td>{typeLabel}</td>
                      <td>
                        <button
                          type="button"
                          className="sc-link-btn"
                          onClick={() => loadVersionHistory(doc.documentGroupId)}
                        >
                          {doc.fileName}
                        </button>
                        <div className="sc-paper-meta">{formatBytes(doc.fileSize)}</div>
                      </td>
                      <td>
                        <span className={statusClass(doc.status)}>
                          {STATUS_LABELS[doc.status]}
                        </span>
                      </td>
                      <td>v{doc.versionNumber}</td>
                      <td>{doc.uploadedBy.fullName}</td>
                      <td>
                        {doc.releaseAt ? (
                          <div>From {new Date(doc.releaseAt).toLocaleString()}</div>
                        ) : (
                          <div>Not scheduled</div>
                        )}
                        {doc.expiresAt ? (
                          <div>Until {new Date(doc.expiresAt).toLocaleString()}</div>
                        ) : null}
                      </td>
                      <td className="sc-paper-actions">
                        {doc.canDownload ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            onClick={() => handleDownload(doc)}
                          >
                            Download
                          </button>
                        ) : null}
                        {wf?.canSubmit ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            disabled={actionLoading === `${doc.id}-submit`}
                            onClick={() => runAction(doc.id, "submit")}
                          >
                            Submit for review
                          </button>
                        ) : null}
                        {wf?.canReturn ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            disabled={actionLoading === `${doc.id}-return`}
                            onClick={() => {
                              setCommentText("");
                              setCommentModal({
                                docId: doc.id,
                                action: "return",
                                title: doc.fileName,
                              });
                            }}
                          >
                            Return
                          </button>
                        ) : null}
                        {wf?.canApprove ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            disabled={actionLoading === `${doc.id}-approve`}
                            onClick={() => {
                              setCommentText("");
                              setCommentModal({
                                docId: doc.id,
                                action: "approve",
                                title: doc.fileName,
                              });
                            }}
                          >
                            Approve
                          </button>
                        ) : null}
                        {wf?.canLock ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            disabled={actionLoading === `${doc.id}-lock`}
                            onClick={() => runAction(doc.id, "lock")}
                          >
                            Lock
                          </button>
                        ) : null}
                        {wf?.canRelease ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            onClick={() => setReleaseDocId(doc.id)}
                          >
                            Release
                          </button>
                        ) : null}
                        {wf?.canArchive ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            disabled={actionLoading === `${doc.id}-archive`}
                            onClick={() => runAction(doc.id, "archive")}
                          >
                            Archive
                          </button>
                        ) : null}
                        {wf?.canUploadNewVersion ? (
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-sm"
                            onClick={() => {
                              setReplaceGroupId(doc.documentGroupId);
                              setUploadType(doc.documentType);
                            }}
                          >
                            New version
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {releaseDocId ? (
        <section className="sc-paper-section sc-paper-release-panel">
          <h3>Release document</h3>
          <label>
            Release at (optional — defaults to now)
            <input
              type="datetime-local"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
            />
          </label>
          <label>
            Expires at (optional)
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <div className="sc-paper-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              disabled={actionLoading === `${releaseDocId}-release`}
              onClick={() =>
                runAction(releaseDocId, "release", {
                  releaseAt: releaseAt ? new Date(releaseAt).toISOString() : null,
                  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                })
              }
            >
              Confirm release
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost"
              onClick={() => setReleaseDocId(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {selectedGroupId && versionHistory.length > 0 ? (
        <section className="sc-paper-section">
          <h2>Version history</h2>
          <ul className="sc-paper-version-list">
            {versionHistory.map((v) => (
              <li key={v.id}>
                <span>v{v.versionNumber}</span>
                <span>{v.fileName}</span>
                <span className={statusClass(v.status)}>{STATUS_LABELS[v.status]}</span>
                <span>{new Date(v.createdAt).toLocaleString()}</span>
                <span>{v.uploadedBy.fullName}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sc-paper-section">
        <h2>Audit timeline</h2>
        <PaperAuditTimeline entries={auditEntries} />
      </section>

      <ModerationReturnModal
        open={!!commentModal}
        itemName={commentModal?.title ?? ""}
        comment={commentText}
        onCommentChange={setCommentText}
        requireComment={false}
        busy={commentModal ? actionLoading === `${commentModal.docId}-${commentModal.action}` : false}
        title={commentModal?.action === "approve" ? "Approve document" : "Return document"}
        confirmLabel={commentModal?.action === "approve" ? "Confirm approval" : "Return document"}
        placeholder="Optional comment…"
        onConfirm={() => {
          if (!commentModal) return;
          void runAction(commentModal.docId, commentModal.action, {
            comment: commentText.trim() || undefined,
          }).then(() => {
            setCommentModal(null);
            setCommentText("");
          });
        }}
        onCancel={() => {
          setCommentModal(null);
          setCommentText("");
        }}
      />
    </div>
  );
}
