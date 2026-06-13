import { MAX_UPLOAD_FILES } from "../../config/uploadLimits";

type Props = {
  label: string;
  filesCount: number;
  dragOver: boolean;
  disabled?: boolean;
  onPick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
};

export default function FileDropzone({
  label,
  filesCount,
  dragOver,
  disabled,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <div
      className={`sc-marking-dropzone${dragOver ? " is-dragover" : ""}${disabled ? " is-disabled" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDragOver(e);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDrop(e);
      }}
      onClick={() => {
        if (!disabled) onPick();
      }}
      onKeyDown={(e) => {
        if (!disabled && e.key === "Enter") onPick();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <strong>{label}</strong>
      <p>or click to browse · PDF, PNG, JPG · max {MAX_UPLOAD_FILES} files</p>
      {filesCount > 0 ? (
        <p>
          <strong>{filesCount}</strong> file(s) selected
        </p>
      ) : null}
    </div>
  );
}
