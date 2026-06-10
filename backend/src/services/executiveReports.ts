import PDFDocument from "pdfkit";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { listAtRiskLearners } from "./atRisk";
import { getSchoolAcademicTrends } from "./academicTrends";
import { getLatestExamReadiness } from "./examReadiness";
import { listInterventions } from "./learnerInterventions";
import { getPrincipalDashboard } from "./academicDashboard";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";

const GOLD = "#d4af37";
const DARK = "#1a1a1a";
const MUTED = "#666666";

function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.rect(0, 0, doc.page.width, 80).fill(DARK);
  doc.fillColor(GOLD).fontSize(22).font("Helvetica-Bold");
  doc.text("ScriptCheck", 50, 24);
  doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold");
  doc.text(title, 50, 48);
  doc.fillColor("#cccccc").fontSize(9).font("Helvetica");
  doc.text(subtitle, 50, 66);
  doc.fillColor("#000000");
  doc.y = 100;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.fillColor(GOLD).fontSize(12).font("Helvetica-Bold").text(title);
  doc.fillColor("#000000").moveDown(0.3);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed = 60) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

export function canGenerateExecutiveReports(
  access: UserAccessContext,
  workspaceId: string
): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.REPORTS_GENERATE);
}

async function loadExecutiveContext(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

  const [dashboard, trends, readiness, atRisk, interventions] = await Promise.all([
    getPrincipalDashboard(workspaceId),
    getSchoolAcademicTrends(workspaceId),
    getLatestExamReadiness(workspaceId),
    listAtRiskLearners(workspaceId),
    listInterventions(workspaceId),
  ]);

  return { workspace, dashboard, trends, readiness, atRisk, interventions };
}

export async function generatePrincipalExecutivePdf(
  workspaceId: string,
  access: UserAccessContext,
  actorId: string
): Promise<Buffer> {
  if (!canGenerateExecutiveReports(access, workspaceId)) {
    throw new Error("Not authorised to generate executive reports");
  }

  const ctx = await loadExecutiveContext(workspaceId);
  const generatedAt = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const buffer = await pdfBuffer((doc) => {
    drawHeader(
      doc,
      "Principal Executive Report",
      `${ctx.workspace?.name ?? "School"} · ${generatedAt}`
    );

    sectionTitle(doc, "School Overview");
    const stats = ctx.dashboard.stats;
    doc.fontSize(10).font("Helvetica");
    doc.text(`School average: ${formatPct(stats.schoolAverage)}`);
    doc.text(`Pass rate: ${formatPct(stats.passRate)}`);
    doc.text(`Distinction rate: ${formatPct(stats.distinctionRate)}`);
    doc.text(`At-risk learners: ${stats.atRiskLearnerCount}`);
    doc.text(`Assessments outstanding: ${stats.assessmentsOutstanding}`);
    doc.text(`Moderation compliance: ${formatPct(stats.moderationCompliance)}`);
    doc.text(`Exam readiness: ${formatPct(stats.examReadinessScore)} (${stats.examReadinessStatus ?? "—"})`);

    sectionTitle(doc, "Academic Snapshot");
    const snap = ctx.dashboard.academicSnapshot;
    doc.text(`Top subject: ${snap.topSubject?.subject ?? "—"} (${formatPct(snap.topSubject?.average ?? null)})`);
    doc.text(`Lowest subject: ${snap.lowestSubject?.subject ?? "—"} (${formatPct(snap.lowestSubject?.average ?? null)})`);
    doc.text(`Most improved: ${snap.mostImprovedSubject?.subject ?? "—"}`);
    doc.text(`Most declined: ${snap.mostDeclinedSubject?.subject ?? "—"}`);

    sectionTitle(doc, "Subject Analysis");
    for (const row of ctx.dashboard.subjectPerformance.slice(0, 10)) {
      ensureSpace(doc, 20);
      doc.text(`${row.subject}: avg ${formatPct(row.average)} · pass ${formatPct(row.passRate)} · trend ${row.trend}`);
    }

    sectionTitle(doc, "Grade Analysis");
    for (const row of ctx.dashboard.gradePerformance.slice(0, 10)) {
      ensureSpace(doc, 20);
      doc.text(
        `${row.grade}: avg ${formatPct(row.gradeAverage)} · pass ${formatPct(row.passRate)} · distinctions ${row.distinctions} · ${row.trend}`
      );
    }

    sectionTitle(doc, "At-Risk Learners");
    if (ctx.atRisk.length === 0) {
      doc.text("No active at-risk flags.");
    } else {
      for (const learner of ctx.atRisk.slice(0, 15)) {
        ensureSpace(doc, 20);
        doc.text(`${learner.learnerName} (${learner.className ?? "—"}): ${learner.reasons.join(", ")}`);
      }
    }

    sectionTitle(doc, "Moderation Compliance");
    doc.text(`Compliance rate: ${formatPct(stats.moderationCompliance)}`);

    sectionTitle(doc, "Exam Readiness");
    doc.text(`Score: ${formatPct(ctx.readiness.readinessPercentage)}`);
    doc.text(`Status: ${ctx.readiness.status.replaceAll("_", " ")}`);

    doc.moveDown(2);
    doc.fillColor(MUTED).fontSize(8).text("Confidential — for principal use only", { align: "center" });
  });

  await logAudit({
    action: "EXECUTIVE_REPORT_GENERATED",
    workspaceId,
    actorId,
    metadata: { reportType: "principal" },
  });

  return buffer;
}

export async function generateGoverningBodyExecutivePdf(
  workspaceId: string,
  access: UserAccessContext,
  actorId: string
): Promise<Buffer> {
  if (!canGenerateExecutiveReports(access, workspaceId)) {
    throw new Error("Not authorised to generate executive reports");
  }

  const ctx = await loadExecutiveContext(workspaceId);
  const generatedAt = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const buffer = await pdfBuffer((doc) => {
    drawHeader(
      doc,
      "Governing Body Academic Report",
      `${ctx.workspace?.name ?? "School"} · ${generatedAt}`
    );

    sectionTitle(doc, "Academic Performance");
    const stats = ctx.dashboard.stats;
    doc.fontSize(10).font("Helvetica");
    doc.text(`School average: ${formatPct(stats.schoolAverage)}`);
    doc.text(`Pass rate: ${formatPct(stats.passRate)}`);
    doc.text(`Distinction rate: ${formatPct(stats.distinctionRate)}`);

    sectionTitle(doc, "Academic Trends");
    for (const trend of ctx.trends.subjectTrends.slice(0, 8)) {
      ensureSpace(doc, 20);
      doc.text(
        `${trend.subject}: current ${formatPct(trend.currentAverage)} · previous ${formatPct(trend.previousAverage)} · ${trend.trend}`
      );
    }

    sectionTitle(doc, "Year-over-Year Performance");
    for (const year of ctx.trends.historicalTrends) {
      ensureSpace(doc, 20);
      doc.text(
        `${year.year}: ${formatPct(year.average)} · YoY change ${year.yearOverYearChange != null ? `${year.yearOverYearChange}%` : "—"}`
      );
    }

    sectionTitle(doc, "Interventions");
    const openInterventions = ctx.interventions.filter((i) => i.status !== "CLOSED");
    doc.text(`Active interventions: ${openInterventions.length}`);
    for (const item of openInterventions.slice(0, 10)) {
      ensureSpace(doc, 20);
      doc.text(`${item.learner.learnerName}: ${item.status.replaceAll("_", " ")} — ${item.riskReason.replaceAll("_", " ")}`);
    }

    sectionTitle(doc, "Exam Readiness");
    doc.text(`Readiness score: ${formatPct(ctx.readiness.readinessPercentage)}`);
    doc.text(`Status: ${ctx.readiness.status.replaceAll("_", " ")}`);

    doc.moveDown(2);
    doc.fillColor(MUTED).fontSize(8).text("Confidential — for governing body review", { align: "center" });
  });

  await logAudit({
    action: "EXECUTIVE_REPORT_GENERATED",
    workspaceId,
    actorId,
    metadata: { reportType: "governing-body" },
  });

  return buffer;
}
