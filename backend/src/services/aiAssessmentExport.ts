import { PDFDocument } from "pdf-lib";
import {
  drawPdfHeader,
  drawSectionTitle,
  ensurePdfSpace,
  pdfBuffer,
} from "./pdfHelpers";
import type { AiGeneratedDraft } from "./aiAssessmentEngine";
import { bloomLevelLabel } from "./aiAssessmentQuality";

export type ExportType = "question-paper" | "memorandum" | "rubric" | "complete-pack";

export async function generateAiAssessmentPdf(
  draft: AiGeneratedDraft,
  title: string,
  exportType: ExportType,
  context?: { grade?: string; subject?: string; term?: string }
): Promise<Buffer> {
  switch (exportType) {
    case "question-paper":
      return buildQuestionPaperPdf(draft, title, context);
    case "memorandum":
      return buildMemorandumPdf(draft, title, context);
    case "rubric":
      return buildRubricPdf(draft, title, context);
    case "complete-pack":
      return buildCompletePackPdf(draft, title, context);
  }
}

async function buildCompletePackPdf(
  draft: AiGeneratedDraft,
  title: string,
  context?: { grade?: string; subject?: string; term?: string }
): Promise<Buffer> {
  const parts: Buffer[] = [
    await buildQuestionPaperPdf(draft, title, context),
    await buildMemorandumPdf(draft, title, context),
  ];

  if (draft.questions.some((q) => q.rubric?.criteria?.length)) {
    parts.push(await buildRubricPdf(draft, title, context));
  }

  const merged = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return Buffer.from(await merged.save());
}

function buildSubtitle(context?: { grade?: string; subject?: string; term?: string }) {
  const parts = [context?.grade, context?.subject, context?.term].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

async function buildQuestionPaperPdf(
  draft: AiGeneratedDraft,
  title: string,
  context?: { grade?: string; subject?: string; term?: string }
): Promise<Buffer> {
  return pdfBuffer((doc) => {
    drawPdfHeader(doc, title, buildSubtitle(context));
    drawSectionTitle(doc, "Instructions");
    doc.fontSize(10).font("Helvetica").text(draft.instructions, { align: "left" });
    doc.moveDown();

    let currentSection = "";
    for (const q of draft.questions) {
      if (q.section && q.section !== currentSection) {
        currentSection = q.section;
        drawSectionTitle(doc, currentSection);
      }

      ensurePdfSpace(doc, 80);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`Question ${q.questionNumber} (${q.marks} marks)`, { continued: false });
      doc.font("Helvetica").text(q.questionText);

      if (q.options?.length) {
        doc.moveDown(0.3);
        for (const opt of q.options) {
          doc.text(`   ${opt}`);
        }
      }

      doc.moveDown(0.8);
    }

    ensurePdfSpace(doc, 40);
    doc.fontSize(9).fillColor("#666666").text(`Total: ${draft.totalMarks} marks`);
  });
}

async function buildMemorandumPdf(
  draft: AiGeneratedDraft,
  title: string,
  context?: { grade?: string; subject?: string; term?: string }
): Promise<Buffer> {
  return pdfBuffer((doc) => {
    drawPdfHeader(doc, `Memorandum — ${title}`, buildSubtitle(context));
    drawSectionTitle(doc, "Marking Guide");

    for (const q of draft.questions) {
      ensurePdfSpace(doc, 100);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`Q${q.questionNumber} (${q.marks} marks) — ${q.difficulty}`, { continued: false });
      doc.font("Helvetica-Bold").text("Expected answer:");
      doc.font("Helvetica").text(q.memoAnswer);
      if (q.memoNotes) {
        doc.moveDown(0.3);
        doc.font("Helvetica-Oblique").text(`Notes: ${q.memoNotes}`);
      }
      doc.moveDown(0.8);
    }

    doc.fontSize(9).fillColor("#666666").text(`Total: ${draft.totalMarks} marks`);
  });
}

async function buildRubricPdf(
  draft: AiGeneratedDraft,
  title: string,
  context?: { grade?: string; subject?: string; term?: string }
): Promise<Buffer> {
  const rubricQuestions = draft.questions.filter((q) => q.rubric?.criteria?.length);

  return pdfBuffer((doc) => {
    drawPdfHeader(doc, `Rubric — ${title}`, buildSubtitle(context));

    if (rubricQuestions.length === 0) {
      doc.fontSize(10).text("No rubric criteria required for this assessment.");
      return;
    }

    for (const q of rubricQuestions) {
      drawSectionTitle(doc, `Question ${q.questionNumber} (${q.marks} marks)`);
      doc.fontSize(9).font("Helvetica").text(q.questionText);
      doc.moveDown(0.5);

      doc.font("Helvetica-Bold").text("Criteria:");
      for (const c of q.rubric!.criteria) {
        ensurePdfSpace(doc, 50);
        doc
          .font("Helvetica-Bold")
          .text(`${c.name} (${c.maxMarks} marks)`, { continued: false });
        doc.font("Helvetica").text(c.description);
        doc.moveDown(0.3);
      }

      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor("#666666")
        .text(`Bloom: ${bloomLevelLabel(q.bloomLevel)} · Difficulty: ${q.difficulty}`);
      doc.fillColor("#000000").moveDown();
    }
  });
}
