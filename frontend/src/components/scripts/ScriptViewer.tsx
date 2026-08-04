import { useCallback, useEffect, useRef, useState } from "react";
import { apiOpenPdf } from "../../api";
import { useDebouncedLayerSave } from "../../hooks/useDebouncedLayerSave";
import { useLayerHistory } from "../../hooks/useLayerHistory";
import { usePageRender } from "../../hooks/usePageRender";
import type {
  AnnotationData,
  AnnotationStroke,
  AnnotationTool,
  ScriptLayerDetail,
  ScriptPageInfo,
  ViewMode,
} from "../../types";
import {
  HOD_COLOR,
  TEACHER_COLOR,
  getVisibleLayers,
  renderStroke,
  uid,
} from "./annotationUtils";
import "../../pages/moderation/shared/workflow.css";

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2] as const;

type Props = {
  scriptId: string;
  page: ScriptPageInfo | null;
  layers: ScriptLayerDetail[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  canAnnotateTeacher: boolean;
  canAnnotateHod: boolean;
  onLayersUpdate: (layers: ScriptLayerDetail[]) => void;
  activePageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSelectPage: (index: number) => void;
};

export default function ScriptViewer({
  scriptId,
  page,
  layers,
  viewMode,
  onViewModeChange,
  activeTool,
  onToolChange,
  canAnnotateTeacher,
  canAnnotateHod,
  onLayersUpdate,
  activePageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
  onSelectPage,
}: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [highlightStart, setHighlightStart] = useState<[number, number] | null>(null);
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState("");

  const activeLayerType = canAnnotateHod
    ? "HOD_GREEN"
    : canAnnotateTeacher
      ? "TEACHER_RED"
      : null;
  const strokeColor = activeLayerType === "HOD_GREEN" ? HOD_COLOR : TEACHER_COLOR;
  const canAnnotate = Boolean(activeLayerType) && activeTool !== "select";

  const { src, width, height, loading, error } = usePageRender(scriptId, page, zoom);
  const dims = { width, height };

  const handleLayerSaved = useCallback(
    (updated: ScriptLayerDetail) => {
      onLayersUpdate(
        layers.map((l) => (l.layerType === updated.layerType ? updated : l))
      );
    },
    [layers, onLayersUpdate]
  );

  const { status, errorMessage, scheduleSave } = useDebouncedLayerSave(
    scriptId,
    handleLayerSaved
  );

  const { canUndo, canRedo, pushHistory, undo, redo } = useLayerHistory(activeLayerType);

  const visibleLayers = getVisibleLayers(layers, viewMode);
  const pageNumber = page?.pageNumber ?? 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft" && activePageIndex > 0) {
        e.preventDefault();
        onPrevPage();
      } else if (e.key === "ArrowRight" && activePageIndex < totalPages - 1) {
        e.preventDefault();
        onNextPage();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z" && activeLayerType) {
        e.preventDefault();
        const layer = layers.find((l) => l.layerType === activeLayerType);
        if (!layer) return;
        const previous = e.shiftKey
          ? redo(activeLayerType, layer.annotationData)
          : undo(activeLayerType, layer.annotationData);
        if (previous) {
          onLayersUpdate(
            layers.map((l) =>
              l.layerType === activeLayerType
                ? { ...l, annotationData: previous }
                : l
            )
          );
          scheduleSave(activeLayerType, previous);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activePageIndex,
    totalPages,
    onPrevPage,
    onNextPage,
    activeLayerType,
    layers,
    undo,
    redo,
    onLayersUpdate,
    scheduleSave,
  ]);

  const getCoords = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * dims.width;
      const y = ((e.clientY - rect.top) / rect.height) * dims.height;
      return [Math.round(x), Math.round(y)] as [number, number];
    },
    [dims]
  );

  const updateLayerData = useCallback(
    (layerType: string, previous: AnnotationData, next: AnnotationData) => {
      pushHistory(layerType, previous);
      onLayersUpdate(
        layers.map((l) =>
          l.layerType === layerType ? { ...l, annotationData: next } : l
        )
      );
      scheduleSave(layerType, next);
    },
    [layers, onLayersUpdate, pushHistory, scheduleSave]
  );

  const addStroke = useCallback(
    (stroke: AnnotationStroke) => {
      if (!activeLayerType) return;
      const layer = layers.find((l) => l.layerType === activeLayerType);
      if (!layer) return;

      const next: AnnotationData = {
        strokes: [...layer.annotationData.strokes, stroke],
        notes: layer.annotationData.notes,
      };
      updateLayerData(activeLayerType, layer.annotationData, next);
    },
    [activeLayerType, layers, updateLayerData]
  );

  const handleUndo = () => {
    if (!activeLayerType) return;
    const layer = layers.find((l) => l.layerType === activeLayerType);
    if (!layer) return;
    const previous = undo(activeLayerType, layer.annotationData);
    if (previous) {
      onLayersUpdate(
        layers.map((l) =>
          l.layerType === activeLayerType ? { ...l, annotationData: previous } : l
        )
      );
      scheduleSave(activeLayerType, previous);
    }
  };

  const handleRedo = () => {
    if (!activeLayerType) return;
    const layer = layers.find((l) => l.layerType === activeLayerType);
    if (!layer) return;
    const next = redo(activeLayerType, layer.annotationData);
    if (next) {
      onLayersUpdate(
        layers.map((l) =>
          l.layerType === activeLayerType ? { ...l, annotationData: next } : l
        )
      );
      scheduleSave(activeLayerType, next);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canAnnotate || !page) return;
    const [x, y] = getCoords(e);

    if (activeTool === "tick" || activeTool === "cross") {
      addStroke({
        id: uid(),
        type: activeTool,
        pageNumber,
        x,
        y,
        color: strokeColor,
      });
      return;
    }

    if (activeTool === "comment") {
      setCommentDraft({ x, y });
      setCommentText("");
      return;
    }

    if (activeTool === "highlight") {
      setHighlightStart([x, y]);
      setDrawing(true);
      return;
    }

    if (activeTool === "draw") {
      setDrawing(true);
      setCurrentPoints([[x, y]]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing || !canAnnotate) return;
    const [x, y] = getCoords(e);

    if (activeTool === "draw") {
      setCurrentPoints((prev) => [...prev, [x, y]]);
    } else if (activeTool === "highlight" && highlightStart) {
      setCurrentPoints([highlightStart, [x, y]]);
    }
  };

  const confirmComment = () => {
    if (!commentDraft || !commentText.trim()) return;
    addStroke({
      id: uid(),
      type: "comment",
      pageNumber,
      x: commentDraft.x,
      y: commentDraft.y,
      text: commentText.trim(),
      color: strokeColor,
    });
    setCommentDraft(null);
    setCommentText("");
  };

  const handleMouseUp = () => {
    if (!drawing || !canAnnotate) return;

    if (activeTool === "draw" && currentPoints.length > 1) {
      addStroke({
        id: uid(),
        type: "draw",
        pageNumber,
        points: currentPoints,
        color: strokeColor,
        width: 2,
      });
    }

    if (activeTool === "highlight" && currentPoints.length >= 2) {
      addStroke({
        id: uid(),
        type: "highlight",
        pageNumber,
        points: currentPoints,
        color: strokeColor,
      });
    }

    setDrawing(false);
    setCurrentPoints([]);
    setHighlightStart(null);
  };

  const pageStrokes = visibleLayers.flatMap((layer) =>
    layer.annotationData.strokes.filter((s) => s.pageNumber === pageNumber)
  );
  const pageNotes = visibleLayers.flatMap((layer) =>
    layer.annotationData.notes.filter((n) => n.pageNumber === pageNumber)
  );

  const saveStatusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? `Error: ${errorMessage}`
          : null;

  return (
    <section className="sc-script-viewer" ref={viewerRef} tabIndex={0}>
      <div className="sc-viewer-toolbar">
        <div className="sc-viewer-toolbar-group">
          <span className="sc-viewer-label">View</span>
          {(["original", "teacher", "hod", "all"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`sc-btn sc-btn-ghost sc-btn-sm${viewMode === mode ? " sc-btn-active" : ""}`}
              onClick={() => onViewModeChange(mode)}
            >
              {mode === "original"
                ? "Original"
                : mode === "teacher"
                  ? "Teacher"
                  : mode === "hod"
                    ? "Department Head"
                    : "All"}
            </button>
          ))}
        </div>

        {(canAnnotateTeacher || canAnnotateHod) && page ? (
          <div className="sc-viewer-toolbar-group">
            <span className="sc-viewer-label">Tools</span>
            {(
              [
                ["draw", "Draw"],
                ["highlight", "Highlight"],
                ["tick", "Tick"],
                ["cross", "Cross"],
                ["comment", "Comment"],
              ] as [AnnotationTool, string][]
            ).map(([tool, label]) => (
              <button
                key={tool}
                type="button"
                className={`sc-btn sc-btn-ghost sc-btn-sm${activeTool === tool ? " sc-btn-active" : ""}`}
                onClick={() => onToolChange(tool)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-sm"
              disabled={!canUndo}
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-sm"
              disabled={!canRedo}
              onClick={handleRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
          </div>
        ) : null}

        <div className="sc-viewer-toolbar-group">
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-btn-sm"
            disabled={activePageIndex <= 0}
            onClick={onPrevPage}
            aria-label="Previous page"
          >
            Previous page
          </button>
          <select
            className="sc-input sc-page-select"
            value={activePageIndex}
            onChange={(e) => onSelectPage(Number(e.target.value))}
            aria-label={`Page ${activePageIndex + 1} of ${totalPages}`}
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option key={i} value={i}>
                Page {i + 1} of {totalPages}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sc-btn sc-btn-ghost sc-btn-sm"
            disabled={activePageIndex >= totalPages - 1}
            onClick={onNextPage}
            aria-label="Next page"
          >
            Next page
          </button>
        </div>

        <div className="sc-viewer-toolbar-group" role="group" aria-label="Zoom">
          <span className="sc-viewer-label" id="sc-zoom-label">
            Zoom
          </span>
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              type="button"
              className={`sc-btn sc-btn-ghost sc-btn-sm${zoom === z ? " sc-btn-active" : ""}`}
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              aria-labelledby="sc-zoom-label"
              aria-label={`Zoom ${Math.round(z * 100)} percent`}
            >
              {Math.round(z * 100)}%
            </button>
          ))}
        </div>

        {saveStatusLabel ? (
          <span
            className={`sc-viewer-save-status sc-viewer-save-status-${status}`}
          >
            {saveStatusLabel}
          </span>
        ) : null}
      </div>

      <div className="sc-viewer-canvas-wrap">
        {!page ? (
          <div className="sc-viewer-empty">
            <p>Upload script pages to begin marking.</p>
          </div>
        ) : loading ? (
          <div className="sc-viewer-empty">
            <p>Rendering page…</p>
          </div>
        ) : error ? (
          <div className="sc-viewer-empty" role="alert">
            <p className="sc-error">{error}</p>
            {page ? (
              <button
                type="button"
                className="sc-btn sc-btn-secondary"
                onClick={() => {
                  void apiOpenPdf(`/scripts/${scriptId}/pages/${page.id}/file`).catch(
                    () => undefined
                  );
                }}
              >
                Open original paper
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="sc-viewer-stage"
            style={{
              width: dims.width * zoom,
              height: dims.height * zoom,
            }}
          >
            <img
              className="sc-viewer-page"
              src={src ?? undefined}
              alt={`Page ${page.pageNumber}`}
              width={dims.width * zoom}
              height={dims.height * zoom}
              draggable={false}
            />

            {viewMode !== "original" ? (
              <svg
                className="sc-viewer-overlay"
                viewBox={`0 0 ${dims.width} ${dims.height}`}
                width={dims.width * zoom}
                height={dims.height * zoom}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: canAnnotate ? "crosshair" : "default" }}
              >
                {pageStrokes.map(renderStroke)}
                {drawing && currentPoints.length > 1
                  ? renderStroke({
                      id: "preview",
                      type: activeTool === "highlight" ? "highlight" : "draw",
                      pageNumber,
                      points: currentPoints,
                      color: strokeColor,
                      width: 2,
                    })
                  : null}
                {pageNotes.map((note) => (
                  <g key={note.id}>
                    <rect
                      x={note.x}
                      y={note.y}
                      width={Math.max(100, note.text.length * 7 + 16)}
                      height={28}
                      rx={4}
                      fill="rgba(0,0,0,0.7)"
                      stroke="var(--sc-gold)"
                      strokeWidth={1}
                    />
                    <text
                      x={note.x + 8}
                      y={note.y + 19}
                      fill="var(--sc-gold-light)"
                      fontSize={12}
                    >
                      {note.text}
                    </text>
                  </g>
                ))}
              </svg>
            ) : null}
          </div>
        )}
      </div>

      {commentDraft ? (
        <div
          className="sc-mod-modal-overlay"
          onClick={() => setCommentDraft(null)}
          style={{ zIndex: 300 }}
        >
          <div
            className="sc-mod-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2>Add comment</h2>
            <label className="sc-mod-field">
              Comment
              <textarea
                className="sc-input"
                rows={3}
                placeholder="Enter your comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                autoFocus
              />
            </label>
            <div className="sc-mod-modal-actions">
              <button
                type="button"
                className="sc-btn sc-btn-primary"
                disabled={!commentText.trim()}
                onClick={confirmComment}
              >
                Add comment
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-ghost"
                onClick={() => setCommentDraft(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
