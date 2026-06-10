import { ModerationVarianceLevel, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { VARIANCE_LABELS } from "./markTotals";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function varianceBand(level: ModerationVarianceLevel): "low" | "medium" | "high" {
  if (level === ModerationVarianceLevel.OK || level === ModerationVarianceLevel.NONE) return "low";
  if (level === ModerationVarianceLevel.WARNING) return "medium";
  return "high";
}

export async function generateModerationVarianceReport(
  workspaceId: string,
  actorId?: string
) {
  const scripts = await prisma.learnerScript.findMany({
    where: {
      batch: { workspaceId },
      hodTotal: { not: null },
      teacherTotal: { not: null },
    },
    select: {
      id: true,
      teacherTotal: true,
      hodTotal: true,
      moderationVariancePercent: true,
      varianceLevel: true,
      assessment: {
        select: {
          id: true,
          title: true,
          subject: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
          creatorTeacher: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  const subjectMap = new Map<string, { name: string; variances: number[]; levels: ModerationVarianceLevel[] }>();
  const gradeMap = new Map<string, { name: string; variances: number[]; levels: ModerationVarianceLevel[] }>();
  const teacherMap = new Map<string, { name: string; variances: number[]; levels: ModerationVarianceLevel[] }>();

  let low = 0;
  let medium = 0;
  let high = 0;

  for (const script of scripts) {
    const v = script.moderationVariancePercent ?? 0;
    const band = varianceBand(script.varianceLevel);
    if (band === "low") low++;
    else if (band === "medium") medium++;
    else high++;

    const subjectKey = script.assessment.subject.id;
    const gradeKey = script.assessment.grade.id;
    const teacherKey = script.assessment.creatorTeacher.id;

    for (const [key, map, name] of [
      [subjectKey, subjectMap, script.assessment.subject.name] as const,
      [gradeKey, gradeMap, script.assessment.grade.name] as const,
      [teacherKey, teacherMap, script.assessment.creatorTeacher.fullName] as const,
    ]) {
      const entry = map.get(key) ?? { name, variances: [], levels: [] };
      entry.variances.push(v);
      entry.levels.push(script.varianceLevel);
      map.set(key, entry);
    }
  }

  const toSummary = (map: Map<string, { name: string; variances: number[]; levels: ModerationVarianceLevel[] }>) =>
    Array.from(map.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      scriptCount: data.variances.length,
      averageVariance: data.variances.length
        ? round1(data.variances.reduce((s, v) => s + v, 0) / data.variances.length)
        : null,
      highVarianceCount: data.levels.filter(
        (l) => l === ModerationVarianceLevel.SIGNIFICANT || l === ModerationVarianceLevel.CRITICAL
      ).length,
      band:
        data.variances.length === 0
          ? ("low" as const)
          : data.variances.filter((v) => v > 10).length / data.variances.length > 0.2
            ? ("high" as const)
            : data.variances.filter((v) => v > 5).length / data.variances.length > 0.2
              ? ("medium" as const)
              : ("low" as const),
    }));

  const [totalBatches, moderatedBatches] = await Promise.all([
    prisma.scriptBatch.count({
      where: { workspaceId, status: { not: ScriptBatchStatus.DRAFT } },
    }),
    prisma.scriptBatch.count({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.APPROVED, ScriptBatchStatus.PUBLISHED] },
      },
    }),
  ]);

  const moderationCompliance =
    totalBatches > 0 ? round1((moderatedBatches / totalBatches) * 100) : 100;

  const report = {
    summary: {
      totalScripts: scripts.length,
      lowVariance: low,
      mediumVariance: medium,
      highVariance: high,
      moderationCompliance,
    },
    subjectVariance: toSummary(subjectMap).sort((a, b) => (b.averageVariance ?? 0) - (a.averageVariance ?? 0)),
    gradeVariance: toSummary(gradeMap).sort((a, b) => (b.averageVariance ?? 0) - (a.averageVariance ?? 0)),
    teacherVariance: toSummary(teacherMap).sort((a, b) => (b.averageVariance ?? 0) - (a.averageVariance ?? 0)),
    varianceLabels: VARIANCE_LABELS,
    scripts: scripts.slice(0, 50).map((s) => ({
      id: s.id,
      assessment: s.assessment.title,
      subject: s.assessment.subject.name,
      grade: s.assessment.grade.name,
      teacher: s.assessment.creatorTeacher.fullName,
      teacherMark: s.teacherTotal,
      moderatorMark: s.hodTotal,
      variancePercent: s.moderationVariancePercent,
      varianceLevel: s.varianceLevel,
      band: varianceBand(s.varianceLevel),
    })),
  };

  if (actorId) {
    await logAudit({
      action: "MODERATION_VARIANCE_GENERATED",
      workspaceId,
      actorId,
      metadata: {
        totalScripts: scripts.length,
        moderationCompliance,
      },
    });
  }

  return report;
}
