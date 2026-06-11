import PDFDocument from "pdfkit";
import { prisma } from "../../prisma";
import { logAudit } from "../auditLog";
import { getIntelligenceReport } from "../intelligence/assessmentIntelligence";
import { resolveStageLabel } from "../../core/workflow/workflowEngine";

export type AssessmentPackOptions = {
  includeAssessment: boolean;
  includeMemorandum: boolean;
  includeRubric: boolean;
  includeAudit: boolean;
  includeIntelligence: boolean;
};

const DEFAULT_PACK_OPTIONS: AssessmentPackOptions = {
  includeAssessment: true,
  includeMemorandum: true,
  includeRubric: true,
  includeAudit: true,
  includeIntelligence: true,
};

export async function generateAssessmentPackPdf(
  assessmentId: string,
  workspaceId: string,
  actorId: string,
  options: Partial<AssessmentPackOptions> = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_PACK_OPTIONS, ...options };

  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      workspace: { select: { name: true, logoUrl: true } },
      curriculum: { select: { name: true, code: true } },
      phase: { select: { name: true } },
      grade: { select: { name: true } },
      subject: { select: { name: true } },
      creatorTeacher: { select: { fullName: true } },
      questions: { orderBy: { orderIndex: "asc" } },
      rubricTemplate: {
        include: { criteria: { orderBy: { orderIndex: "asc" } } },
      },
      moderationAudits: {
        include: { performedBy: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!assessment) {
    throw new ExportError("Assessment not found", 404);
  }

  const intelligence = opts.includeIntelligence
    ? await getIntelligenceReport(assessmentId, workspaceId)
    : null;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const promise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Cover page with school branding
  doc.fontSize(22).text(assessment.workspace.name, { align: "center" });
  doc.moveDown();
  doc.fontSize(18).text("Complete Assessment Pack", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(assessment.title, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(11).text(
    `${assessment.subject.name} · ${assessment.grade.name} · ${assessment.curriculum.name}`,
    { align: "center" }
  );
  doc.moveDown();
  doc.fontSize(10).text(`Status: ${resolveStageLabel(assessment.status)}`);
  doc.text(`Total marks: ${assessment.totalMarks}`);
  doc.text(`Created by: ${assessment.creatorTeacher.fullName}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.addPage();

  if (opts.includeAssessment) {
    doc.fontSize(16).text("Assessment Paper", { underline: true });
    doc.moveDown();
    for (const q of assessment.questions) {
      doc.fontSize(11).text(`Q${q.questionNumber} (${q.marks} marks)`, { continued: false });
      if (q.section) doc.fontSize(9).text(`Section: ${q.section}`);
      doc.fontSize(10).text(q.questionText);
      doc.moveDown(0.5);
    }
    doc.addPage();
  }

  if (opts.includeMemorandum) {
    doc.fontSize(16).text("Memorandum", { underline: true });
    doc.moveDown();
    for (const q of assessment.questions) {
      doc.fontSize(11).text(`Q${q.questionNumber}`);
      doc.fontSize(10).text(q.expectedAnswer ?? q.memoNotes ?? "(No memo provided)");
      doc.moveDown(0.5);
    }
    doc.addPage();
  }

  if (opts.includeRubric && assessment.rubricTemplate) {
    doc.fontSize(16).text("Rubric", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(assessment.rubricTemplate.name);
    for (const c of assessment.rubricTemplate.criteria) {
      doc.fontSize(10).text(`${c.name} (${c.maxMarks} marks): ${c.description ?? ""}`);
    }
    doc.addPage();
  }

  if (opts.includeIntelligence && intelligence) {
    doc.fontSize(16).text("ScriptCheck Intelligence", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(`Compliance Score: ${intelligence.complianceScore}%`);
    doc.text(`CAPS Compliance: ${intelligence.capsCompliance}%`);
    doc.text(`Cognitive Balance: ${intelligence.cognitiveBalance}%`);
    doc.moveDown();
    if (intelligence.riskIndicators.length > 0) {
      doc.text("Risk Indicators:");
      for (const risk of intelligence.riskIndicators) {
        doc.fontSize(9).text(`  [${risk.severity.toUpperCase()}] ${risk.message}`);
      }
    }
    doc.addPage();
  }

  if (opts.includeAudit) {
    doc.fontSize(16).text("Approval History & Audit", { underline: true });
    doc.moveDown();
    for (const audit of assessment.moderationAudits) {
      doc.fontSize(9).text(
        `${audit.createdAt.toLocaleString()} — ${audit.action}: ${audit.fromStatus} → ${audit.toStatus} by ${audit.performedBy.fullName}`
      );
      if (audit.comment) doc.text(`  Comment: ${audit.comment}`);
    }
  }

  doc.end();

  const buffer = await promise;

  await logAudit({
    action: "ASSESSMENT_PACK_EXPORTED",
    workspaceId,
    actorId,
    metadata: { assessmentId, options: opts },
  });

  return buffer;
}

export class ExportError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ExportError";
  }
}
