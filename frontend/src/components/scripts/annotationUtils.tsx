import type { AnnotationStroke, ScriptLayerDetail, ViewMode } from "../../types";

export const TEACHER_COLOR = "#ff6b6b";
export const HOD_COLOR = "#3ecf8e";

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function pointsToPath(points: number[][]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first[0]} ${first[1]} ${rest.map((p) => `L ${p[0]} ${p[1]}`).join(" ")}`;
}

export function getVisibleLayers(
  layers: ScriptLayerDetail[],
  viewMode: ViewMode
): ScriptLayerDetail[] {
  if (viewMode === "original") return [];
  if (viewMode === "teacher") {
    return layers.filter((l) => l.layerType === "TEACHER_RED");
  }
  if (viewMode === "hod") {
    return layers.filter((l) => l.layerType === "HOD_GREEN");
  }
  return layers.filter(
    (l) => l.layerType === "TEACHER_RED" || l.layerType === "HOD_GREEN"
  );
}

export function renderStroke(stroke: AnnotationStroke) {
  const color = stroke.color;
  const sw = stroke.width ?? 2;

  if (stroke.type === "tick" && stroke.x != null && stroke.y != null) {
    return (
      <g key={stroke.id} transform={`translate(${stroke.x}, ${stroke.y})`}>
        <path
          d="M -8 0 L -2 8 L 12 -10"
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  if (stroke.type === "cross" && stroke.x != null && stroke.y != null) {
    return (
      <g key={stroke.id} transform={`translate(${stroke.x}, ${stroke.y})`}>
        <path
          d="M -10 -10 L 10 10 M 10 -10 L -10 10"
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (stroke.type === "comment" && stroke.x != null && stroke.y != null) {
    return (
      <g key={stroke.id}>
        <rect
          x={stroke.x}
          y={stroke.y}
          width={Math.max(120, (stroke.text?.length ?? 0) * 7 + 16)}
          height={28}
          rx={4}
          fill="rgba(0,0,0,0.75)"
          stroke={color}
          strokeWidth={1}
        />
        <text
          x={stroke.x + 8}
          y={stroke.y + 19}
          fill={color}
          fontSize={12}
          fontFamily="system-ui, sans-serif"
        >
          {stroke.text}
        </text>
      </g>
    );
  }

  if (stroke.type === "highlight" && stroke.points && stroke.points.length >= 2) {
    const xs = stroke.points.map((p) => p[0]);
    const ys = stroke.points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;
    return (
      <rect
        key={stroke.id}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.5}
      />
    );
  }

  if (stroke.points && stroke.points.length > 1) {
    return (
      <path
        key={stroke.id}
        d={pointsToPath(stroke.points)}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  return null;
}
