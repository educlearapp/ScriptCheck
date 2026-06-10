import { ExaminationIncidentStatus, ExaminationOpsSessionStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { getLatestExamReadiness } from "./examReadiness";
import { generateModerationVarianceReport } from "./moderationVariance";
import { getCoverageReport } from "./examinationInvigilators";

export async function getExaminationDashboard(workspaceId: string) {
  const [
    scheduled,
    completed,
    outstanding,
    readiness,
    invigilatorCoverage,
    varianceReport,
    incidentsOpen,
    sessions,
  ] = await Promise.all([
    prisma.examinationOpsSession.count({
      where: {
        workspaceId,
        status: {
          in: [
            ExaminationOpsSessionStatus.SCHEDULED,
            ExaminationOpsSessionStatus.READY,
            ExaminationOpsSessionStatus.IN_PROGRESS,
          ],
        },
      },
    }),
    prisma.examinationOpsSession.count({
      where: { workspaceId, status: ExaminationOpsSessionStatus.COMPLETED },
    }),
    prisma.examinationOpsSession.count({
      where: {
        workspaceId,
        status: {
          in: [ExaminationOpsSessionStatus.SCHEDULED, ExaminationOpsSessionStatus.READY],
        },
        scheduledStart: { lt: new Date() },
      },
    }),
    getLatestExamReadiness(workspaceId),
    getCoverageReport(workspaceId),
    generateModerationVarianceReport(workspaceId),
    prisma.examinationIncident.count({
      where: {
        workspaceId,
        status: { in: [ExaminationIncidentStatus.OPEN, ExaminationIncidentStatus.UNDER_REVIEW] },
      },
    }),
    prisma.examinationOpsSession.findMany({
      where: { workspaceId },
      include: {
        venue: { select: { name: true } },
        invigilatorAssignments: { select: { id: true } },
      },
      orderBy: { scheduledStart: "asc" },
      take: 10,
    }),
  ]);

  return {
    stats: {
      examsScheduled: scheduled,
      examsCompleted: completed,
      examsOutstanding: outstanding,
      readinessScore: readiness.readinessPercentage,
      readinessStatus: readiness.status,
      invigilatorsAssigned: invigilatorCoverage.covered,
      invigilatorsRequired: invigilatorCoverage.totalSessions,
      moderationCompliance: varianceReport.summary.moderationCompliance,
      incidentsLogged: incidentsOpen,
    },
    upcomingSessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      scheduledStart: s.scheduledStart.toISOString(),
      venue: s.venue?.name ?? "—",
      invigilatorCount: s.invigilatorAssignments.length,
      learnerCount: s.learnerCount,
      durationMinutes: s.durationMinutes,
    })),
    invigilatorCoverage,
    readiness,
  };
}
