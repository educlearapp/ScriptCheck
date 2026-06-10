import fs from "fs";
import PDFDocument from "pdfkit";
import { AnnotationLayerType } from "@prisma/client";
import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";
import {
  type AnnotationData,
  type AnnotationStroke,
  parseAnnotationDataPublic,
} from "./scriptAnnotations";

export type CompositeViewMode = "original" | "teacher" | "hod" | "all";

export type CompositePagePlan = {
  scriptId: string;
  pageId: string;
  pageNumber: number;
  width: number;
  height: number;
  mimeType: string;
  sourcePageIndex: number | null;
  viewMode: CompositeViewMode;
  layers: Array<{
    layerType: AnnotationLayerType;
    color: string;
    strokeCount: number;
    noteCount: number;
    annotationData: AnnotationData;
  }>;
  exportReady: boolean;
  exportNote: string | null;
};

function filterLayers(
  layerTypes: AnnotationLayerType[],
  viewMode: CompositeViewMode
): AnnotationLayerType[] {
  if (viewMode === "original") return [];
  if (viewMode === "teacher") return [AnnotationLayerType.TEACHER_RED];
  if (viewMode === "hod") return [AnnotationLayerType.HOD_GREEN];
  return [AnnotationLayerType.TEACHER_RED, AnnotationLayerType.HOD_GREEN];
}

function drawStroke(doc: PDFKit.PDFDocument, stroke: AnnotationStroke) {
  const color = stroke.color;

  if (stroke.type === "tick" && stroke.x != null && stroke.y != null) {
    doc.save();
    doc.strokeColor(color).lineWidth(2);
    doc.moveTo(stroke.x - 8, stroke.y).lineTo(stroke.x - 2, stroke.y + 8);
    doc.lineTo(stroke.x + 12, stroke.y - 10).stroke();
    doc.restore();
    return;
  }

  if (stroke.type === "cross" && stroke.x != null && stroke.y != null) {
    doc.save();
    doc.strokeColor(color).lineWidth(2);
    doc.moveTo(stroke.x - 10, stroke.y - 10).lineTo(stroke.x + 10, stroke.y + 10);
    doc.moveTo(stroke.x + 10, stroke.y - 10).lineTo(stroke.x - 10, stroke.y + 10).stroke();
    doc.restore();
    return;
  }

  if (stroke.type === "comment" && stroke.x != null && stroke.y != null && stroke.text) {
    doc.save();
    doc.fillColor("#111").rect(stroke.x, stroke.y, 140, 24).fill();
    doc.strokeColor(color).rect(stroke.x, stroke.y, 140, 24).stroke();
    doc.fillColor(color).fontSize(10).text(stroke.text, stroke.x + 6, stroke.y + 7, {
      width: 128,
    });
    doc.restore();
    return;
  }

  if (stroke.type === "highlight" && stroke.points && stroke.points.length >= 2) {
    const xs = stroke.points.map((p) => p[0]);
    const ys = stroke.points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;
    doc.save();
    doc.fillColor(color).fillOpacity(0.25).rect(x, y, w, h).fill();
    doc.fillOpacity(1).strokeColor(color).rect(x, y, w, h).stroke();
    doc.restore();
    return;
  }

  if (stroke.points && stroke.points.length > 1) {
    doc.save();
    doc.strokeColor(color).lineWidth(stroke.width ?? 2);
    doc.moveTo(stroke.points[0][0], stroke.points[0][1]);
    for (let i = 1; i < stroke.points.length; i++) {
      doc.lineTo(stroke.points[i][0], stroke.points[i][1]);
    }
    doc.stroke();
    doc.restore();
  }
}

async function loadPageContext(
  scriptId: string,
  pageId: string,
  workspaceId: string
) {
  const page = await prisma.scriptPage.findFirst({
    where: {
      id: pageId,
      learnerScriptId: scriptId,
      learnerScript: { batch: { workspaceId } },
    },
    include: {
      learnerScript: {
        include: { layers: true },
      },
    },
  });

  if (!page) throw new ScriptError("Script page not found", 404);
  if (!fs.existsSync(page.filePath)) {
    throw new ScriptError("Page file missing on server", 404);
  }

  let sourcePageIndex: number | null = null;
  if (page.mimeType === "application/pdf") {
    const siblings = await prisma.scriptPage.findMany({
      where: { learnerScriptId: scriptId, filePath: page.filePath },
      orderBy: { pageNumber: "asc" },
      select: { id: true },
    });
    const idx = siblings.findIndex((s) => s.id === page.id);
    sourcePageIndex = idx >= 0 ? idx + 1 : 1;
  }

  return { page, sourcePageIndex };
}

export async function getAnnotatedPageCompositePlan(
  scriptId: string,
  pageId: string,
  workspaceId: string,
  viewMode: CompositeViewMode = "all"
): Promise<CompositePagePlan> {
  const { page, sourcePageIndex } = await loadPageContext(scriptId, pageId, workspaceId);
  const allowed = new Set(filterLayers([], viewMode));
  const width = page.width ?? 800;
  const height = page.height ?? 1100;

  const layers = page.learnerScript.layers
    .filter((l) => allowed.has(l.layerType))
    .map((l) => {
      const data = parseAnnotationDataPublic(l.annotationData);
      const pageStrokes = data.strokes.filter((s) => s.pageNumber === page.pageNumber);
      const pageNotes = data.notes.filter((n) => n.pageNumber === page.pageNumber);
      return {
        layerType: l.layerType,
        color: l.color,
        strokeCount: pageStrokes.length,
        noteCount: pageNotes.length,
        annotationData: {
          strokes: pageStrokes,
          notes: pageNotes,
        },
      };
    });

  const isImage = page.mimeType.startsWith("image/");
  const exportReady = isImage;
  const exportNote = isImage
    ? null
    : "PDF source pages require client-side rasterization before server composite export. Use composite-plan for now.";

  return {
    scriptId,
    pageId,
    pageNumber: page.pageNumber,
    width,
    height,
    mimeType: page.mimeType,
    sourcePageIndex,
    viewMode,
    layers,
    exportReady,
    exportNote,
  };
}

export async function renderAnnotatedPageCompositePdf(
  scriptId: string,
  pageId: string,
  workspaceId: string,
  viewMode: CompositeViewMode = "all"
): Promise<Buffer> {
  const plan = await getAnnotatedPageCompositePlan(
    scriptId,
    pageId,
    workspaceId,
    viewMode
  );

  if (!plan.exportReady) {
    throw new ScriptError(plan.exportNote ?? "Composite export not available", 501);
  }

  const { page } = await loadPageContext(scriptId, pageId, workspaceId);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [plan.width, plan.height],
      margin: 0,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.image(page.filePath, 0, 0, {
      width: plan.width,
      height: plan.height,
    });

    for (const layer of plan.layers) {
      for (const stroke of layer.annotationData.strokes) {
        drawStroke(doc, stroke);
      }
      for (const note of layer.annotationData.notes) {
        doc.save();
        doc.fillColor("#111").rect(note.x, note.y, 140, 24).fill();
        doc.strokeColor("#d4af37").rect(note.x, note.y, 140, 24).stroke();
        doc.fillColor("#f0d77b").fontSize(10).text(note.text, note.x + 6, note.y + 7, {
          width: 128,
        });
        doc.restore();
      }
    }

    doc.end();
  });
}
