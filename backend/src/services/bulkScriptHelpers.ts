import { AnnotationLayerType } from "@prisma/client";
import { prisma } from "../prisma";

const LAYER_COLORS: Record<AnnotationLayerType, string> = {
  ORIGINAL: "#888888",
  TEACHER_RED: "#ff6b6b",
  HOD_GREEN: "#3ecf8e",
  FINAL: "#d4af37",
};

export async function initQuestionMarksForScript(
  learnerScriptId: string,
  assessmentId: string
) {
  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    orderBy: { orderIndex: "asc" },
  });

  for (const q of questions) {
    await prisma.scriptQuestionMark.create({
      data: {
        learnerScriptId,
        assessmentQuestionId: q.id,
        questionNumber: q.questionNumber,
        maxMarks: q.marks,
      },
    });
  }
}

export async function createDefaultLayersForScript(
  learnerScriptId: string,
  createdById: string
) {
  const layerTypes: AnnotationLayerType[] = [
    AnnotationLayerType.ORIGINAL,
    AnnotationLayerType.TEACHER_RED,
    AnnotationLayerType.HOD_GREEN,
    AnnotationLayerType.FINAL,
  ];

  for (const layerType of layerTypes) {
    await prisma.scriptAnnotationLayer.create({
      data: {
        learnerScriptId,
        layerType,
        color: LAYER_COLORS[layerType],
        createdById,
        annotationData: { strokes: [], notes: [] },
      },
    });
  }
}
