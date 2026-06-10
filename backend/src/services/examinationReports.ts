import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { getExaminationDashboard } from "./examinationDashboard";
import { getTimetableCalendar, listSlots } from "./examinationTimetable";
import { listInvigilatorAssignments, getCoverageReport } from "./examinationInvigilators";
import { listIncidents } from "./examinationIncidents";
import { generateModerationVarianceReport } from "./moderationVariance";
import { getLatestExamReadiness } from "./examReadiness";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import {
  drawPdfHeader,
  drawSectionTitle,
  ensurePdfSpace,
  formatPct,
  pdfBuffer,
} from "./pdfHelpers";

export function canGenerateExamReports(
  access: UserAccessContext,
  workspaceId: string
): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.REPORTS_GENERATE);
}

async function loadExamReportContext(workspaceId: string) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [workspace, dashboard, calendar, slots, invigilators, incidents, readiness, variance] =
    await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      getExaminationDashboard(workspaceId),
      getTimetableCalendar(workspaceId, now.toISOString(), weekEnd.toISOString(), "weekly"),
      listSlots(workspaceId),
      listInvigilatorAssignments(workspaceId),
      listIncidents(workspaceId),
      getLatestExamReadiness(workspaceId),
      generateModerationVarianceReport(workspaceId),
    ]);

  return { workspace, dashboard, calendar, slots, invigilators, incidents, readiness, variance };
}

export async function generatePrincipalExaminationPdf(
  workspaceId: string,
  access: UserAccessContext,
  actorId: string
): Promise<Buffer> {
  if (!canGenerateExamReports(access, workspaceId)) {
    throw new Error("Not authorised to generate examination reports");
  }

  const ctx = await loadExamReportContext(workspaceId);
  const generatedAt = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const buffer = await pdfBuffer((doc) => {
    drawPdfHeader(
      doc,
      "Principal Examination Report",
      `${ctx.workspace?.name ?? "School"} · ${generatedAt}`
    );

    drawSectionTitle(doc, "Timetable summary");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Examination slots scheduled: ${ctx.slots.length}`);
    doc.text(`Upcoming sessions: ${ctx.dashboard.stats.examsScheduled}`);
    doc.text(`Completed sessions: ${ctx.dashboard.stats.examsCompleted}`);

    drawSectionTitle(doc, "Readiness score");
    doc.text(`Score: ${formatPct(ctx.readiness.readinessPercentage)}`);
    doc.text(`Status: ${ctx.readiness.status.replaceAll("_", " ")}`);

    drawSectionTitle(doc, "Moderation compliance");
    doc.text(`Compliance: ${formatPct(ctx.variance.summary.moderationCompliance)}`);
    doc.text(`Scripts moderated: ${ctx.variance.summary.totalScripts}`);

    drawSectionTitle(doc, "Invigilator allocations");
    doc.text(
      `Coverage: ${ctx.dashboard.invigilatorCoverage.covered}/${ctx.dashboard.invigilatorCoverage.totalSessions} sessions`
    );
    for (const a of ctx.invigilators.slice(0, 10)) {
      ensurePdfSpace(doc, 14);
      doc.text(`${a.user.fullName}: ${a.session.title}`);
    }

    drawSectionTitle(doc, "Incident summary");
    doc.text(`Open incidents: ${ctx.dashboard.stats.incidentsLogged}`);
    for (const inc of ctx.incidents.slice(0, 8)) {
      ensurePdfSpace(doc, 16);
      doc.text(`${inc.incidentType.replaceAll("_", " ")} — ${inc.status}: ${inc.description.slice(0, 80)}`);
    }
  });

  await logAudit({
    action: "EXAM_REPORT_GENERATED",
    workspaceId,
    actorId,
    metadata: { reportType: "principal-examination" },
  });

  return buffer;
}

export async function generateExaminationBoardPdf(
  workspaceId: string,
  access: UserAccessContext,
  actorId: string
): Promise<Buffer> {
  if (!canGenerateExamReports(access, workspaceId)) {
    throw new Error("Not authorised to generate examination reports");
  }

  const ctx = await loadExamReportContext(workspaceId);
  const generatedAt = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const buffer = await pdfBuffer((doc) => {
    drawPdfHeader(
      doc,
      "Examination Board Report",
      `${ctx.workspace?.name ?? "School"} · ${generatedAt}`
    );

    drawSectionTitle(doc, "Examination statistics");
    const s = ctx.dashboard.stats;
    doc.fontSize(10).font("Helvetica");
    doc.text(`Scheduled: ${s.examsScheduled} · Completed: ${s.examsCompleted} · Outstanding: ${s.examsOutstanding}`);

    drawSectionTitle(doc, "Compliance");
    doc.text(`Moderation compliance: ${formatPct(s.moderationCompliance)}`);
    doc.text(`Invigilator coverage: ${s.invigilatorsAssigned}/${s.invigilatorsRequired}`);

    drawSectionTitle(doc, "Incidents");
    doc.text(`Active incidents: ${s.incidentsLogged}`);
    for (const inc of ctx.incidents.filter((i) => i.status !== "CLOSED").slice(0, 10)) {
      ensurePdfSpace(doc, 16);
      doc.text(`${inc.incidentType.replaceAll("_", " ")}: ${inc.description.slice(0, 100)}`);
    }

    drawSectionTitle(doc, "Readiness");
    doc.text(`Readiness: ${formatPct(s.readinessScore)} (${s.readinessStatus.replaceAll("_", " ")})`);

    drawSectionTitle(doc, "Moderation analysis");
    for (const subj of ctx.variance.subjectVariance.slice(0, 6)) {
      ensurePdfSpace(doc, 14);
      doc.text(`${subj.name}: avg variance ${formatPct(subj.averageVariance)} · ${subj.band} band`);
    }
  });

  await logAudit({
    action: "EXAM_REPORT_GENERATED",
    workspaceId,
    actorId,
    metadata: { reportType: "examination-board" },
  });

  return buffer;
}
