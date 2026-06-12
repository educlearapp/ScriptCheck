import { AnnotationLayerType, AssessmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import { ScriptError } from "./scriptMarking";
import { canEditHodLayer, canEditTeacherLayer, isScriptReadOnly } from "./scriptWorkflow";

export type AnnotationStroke = {
  id: string;
  type: "draw" | "highlight" | "tick" | "cross" | "comment";
  pageNumber: number;
  points?: number[][];
  x?: number;
  y?: number;
  text?: string;
  color: string;
  width?: number;
};

export type AnnotationNote = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  text: string;
};

export type AnnotationData = {
  strokes: AnnotationStroke[];
  notes: AnnotationNote[];
};

const EDITABLE_TEACHER_LAYERS = new Set<AnnotationLayerType>([
  AnnotationLayerType.TEACHER_RED,
]);

const EDITABLE_HOD_LAYERS = new Set<AnnotationLayerType>([
  AnnotationLayerType.HOD_GREEN,
]);

async function loadScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      assessment: { select: { status: true } },
      layers: true,
    },
  });
  if (!script) throw new ScriptError("Learner script not found", 404);
  return script;
}

function parseAnnotationData(data: unknown): AnnotationData {
  if (!data || typeof data !== "object") {
    return { strokes: [], notes: [] };
  }
  const obj = data as Record<string, unknown>;
  return {
    strokes: Array.isArray(obj.strokes) ? (obj.strokes as AnnotationStroke[]) : [],
    notes: Array.isArray(obj.notes) ? (obj.notes as AnnotationNote[]) : [],
  };
}

export function parseAnnotationDataPublic(data: unknown): AnnotationData {
  return parseAnnotationData(data);
}

const NON_EDITABLE_LAYERS = new Set<AnnotationLayerType>([
  AnnotationLayerType.ORIGINAL,
  AnnotationLayerType.FINAL,
]);

function canEditLayer(
  layerType: AnnotationLayerType,
  script: {
    status: import("@prisma/client").LearnerScriptStatus;
    teacherLayerLocked: boolean;
    hodLayerLocked: boolean;
  },
  canMark: boolean,
  canModerate: boolean
): boolean {
  if (isScriptReadOnly(script)) return false;
  if (EDITABLE_TEACHER_LAYERS.has(layerType)) {
    return canMark && canEditTeacherLayer(script);
  }
  if (EDITABLE_HOD_LAYERS.has(layerType)) {
    return canModerate && canEditHodLayer(script);
  }
  return false;
}

export async function getScriptLayers(scriptId: string, workspaceId: string) {
  const script = await loadScript(scriptId, workspaceId);

  return script.layers.map((layer) => ({
    id: layer.id,
    layerType: layer.layerType,
    color: layer.color,
    annotationData: parseAnnotationData(layer.annotationData),
    updatedAt: layer.updatedAt,
    label:
      layer.layerType === "TEACHER_RED"
        ? "Teacher Marking"
        : layer.layerType === "HOD_GREEN"
          ? "DH Moderation"
          : layer.layerType.replaceAll("_", " "),
  }));
}

export async function updateScriptLayer(
  scriptId: string,
  layerType: AnnotationLayerType,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  annotationData: AnnotationData
) {
  const script = await loadScript(scriptId, workspaceId);

  if (script.assessment.status === AssessmentStatus.PUBLISHED) {
    throw new ScriptError("Published results are read-only", 403);
  }

  const canMark = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MARK);
  const canModerate = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MODERATE);

  if (NON_EDITABLE_LAYERS.has(layerType)) {
    throw new ScriptError("This annotation layer cannot be modified", 403);
  }

  if (!canEditLayer(layerType, script, canMark, canModerate)) {
    const locked =
      layerType === AnnotationLayerType.TEACHER_RED
        ? script.teacherLayerLocked
        : script.hodLayerLocked;
    throw new ScriptError(
      locked
        ? "This annotation layer is locked"
        : "Cannot edit this annotation layer in current state",
      403
    );
  }

  const layer = script.layers.find((l) => l.layerType === layerType);
  if (!layer) throw new ScriptError("Annotation layer not found", 404);

  // Each layer is stored in its own row — teacher and HOD data never share a record.

  const existing = parseAnnotationData(layer.annotationData);
  const hadContent =
    existing.strokes.length > 0 || existing.notes.length > 0;
  const hasContent =
    annotationData.strokes.length > 0 || annotationData.notes.length > 0;

  const updated = await prisma.scriptAnnotationLayer.update({
    where: { id: layer.id },
    data: {
      annotationData: annotationData as object,
      createdById: userId,
    },
  });

  return {
    layer: {
      id: updated.id,
      layerType: updated.layerType,
      color: updated.color,
      annotationData: parseAnnotationData(updated.annotationData),
      updatedAt: updated.updatedAt,
    },
    auditAction: !hadContent && hasContent ? "SCRIPT_ANNOTATION_CREATED" : "SCRIPT_ANNOTATION_UPDATED",
    isCreate: !hadContent && hasContent,
  } as const;
}
