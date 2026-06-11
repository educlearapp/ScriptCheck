import { useCallback, useState } from "react";
import { usePageRender } from "../../hooks/usePageRender";
import {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_SIZE_MB,
  UPLOAD_FILES_HINT,
} from "../../config/uploadLimits";
import type { ScriptPageInfo } from "../../types";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

type Props = {
  scriptId: string;
  pages: ScriptPageInfo[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  canUpload: boolean;
  onUpload: (files: File[]) => void;
  uploading: boolean;
  uploadProgress: number;
  uploadError: string;
};

function validateFiles(files: File[]): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  if (files.length > MAX_UPLOAD_FILES) {
    errors.push(UPLOAD_FILES_HINT);
    return { valid: [], errors };
  }

  for (const file of files) {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    const mime = file.type.toLowerCase();

    if (!ACCEPTED_TYPES.has(mime) && !ACCEPTED_EXTENSIONS.includes(ext)) {
      errors.push(
        `"${file.name}" is not supported. Use PDF, JPG, or PNG only.`
      );
      continue;
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024) {
      errors.push(`"${file.name}" exceeds the ${MAX_UPLOAD_FILE_SIZE_MB} MB limit.`);
      continue;
    }

    valid.push(file);
  }

  return { valid, errors };
}

function PageThumbnail({
  scriptId,
  page,
  selected,
  onClick,
}: {
  scriptId: string;
  page: ScriptPageInfo;
  selected: boolean;
  onClick: () => void;
}) {
  const { src, loading } = usePageRender(scriptId, page, 1, true);

  return (
    <button
      type="button"
      className={`sc-page-thumb${selected ? " sc-page-thumb-active" : ""}`}
      onClick={onClick}
    >
      <div className="sc-page-thumb-preview">
        {loading ? (
          <span className="sc-page-thumb-loading">…</span>
        ) : src ? (
          <img src={src} alt={`Page ${page.pageNumber}`} />
        ) : (
          <span className="sc-page-thumb-pdf">
            {page.mimeType === "application/pdf" ? "PDF" : "—"}
          </span>
        )}
      </div>
      <span className="sc-page-thumb-label">Page {page.pageNumber}</span>
    </button>
  );
}

export default function ScriptPageList({
  scriptId,
  pages,
  activePageIndex,
  onSelectPage,
  canUpload,
  onUpload,
  uploading,
  uploadProgress,
  uploadError,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState("");

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const { valid, errors } = validateFiles(files);
      setLocalError(errors.join(" "));

      if (valid.length > 0) {
        onUpload(valid);
      }
    },
    [onUpload]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!canUpload || uploading) return;
    if (e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  };

  const displayError = uploadError || localError;

  return (
    <aside className="sc-script-sidebar">
      <h3 className="sc-script-panel-title">Script Pages</h3>

      {canUpload ? (
        <div
          className={`sc-upload-dropzone${dragOver ? " sc-upload-dropzone-active" : ""}${uploading ? " sc-upload-dropzone-busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="sc-upload-dropzone-text">
            {uploading ? "Uploading…" : "Drag & drop script pages"}
          </p>
          <p className="sc-upload-dropzone-hint">
            PDF, JPG, PNG · up to {MAX_UPLOAD_FILE_SIZE_MB} MB each · {UPLOAD_FILES_HINT}
          </p>

          {uploading ? (
            <div className="sc-upload-progress">
              <div
                className="sc-upload-progress-bar"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          ) : null}

          <label className="sc-btn sc-btn-primary sc-upload-btn">
            Browse files
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.length) {
                  processFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      ) : (
        <p className="sc-script-panel-hint">PDF, JPG, PNG supported</p>
      )}

      {displayError ? <p className="sc-error sc-upload-error">{displayError}</p> : null}

      <div className="sc-page-thumb-list">
        {pages.length === 0 ? (
          <p className="sc-script-empty">No pages uploaded yet.</p>
        ) : (
          pages.map((page, index) => (
            <PageThumbnail
              key={page.id}
              scriptId={scriptId}
              page={page}
              selected={index === activePageIndex}
              onClick={() => onSelectPage(index)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
