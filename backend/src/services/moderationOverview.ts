import { AssessmentStatus, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { getAssessmentStatusLabel, getScriptBatchStatusLabel } from "../utils/statusLabels";

export type DhModerationItem = {
  id: string;
  type: "assessment" | "script_batch";
  assessmentName: string;
  grade: string;
  subject: string;
  teacher: string;
  status: string;
  statusLabel: string;
  assessmentId: string;
  batchId?: string;
  scriptCount?: number;
};

export async function getDhModerationOverview(
  workspaceId: string
): Promise<{ items: DhModerationItem[] }> {
  const [assessmentQueue, scriptQueue] = await Promise.all([
    prisma.assessment.findMany({
      where: {
        workspaceId,
        status: { in: [AssessmentStatus.SUBMITTED_TO_HOD, AssessmentStatus.HOD_REVIEW] },
      },
      include: {
        grade: { select: { name: true } },
        subject: { select: { name: true } },
        creatorTeacher: { select: { fullName: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.scriptBatch.findMany({
      where: {
        workspaceId,
        status: { in: [ScriptBatchStatus.SUBMITTED_TO_HOD, ScriptBatchStatus.HOD_REVIEW] },
      },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            grade: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
        createdBy: { select: { fullName: true } },
        _count: { select: { learnerScripts: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const items: DhModerationItem[] = [
    ...assessmentQueue.map((a) => ({
      id: a.id,
      type: "assessment" as const,
      assessmentName: a.title,
      grade: a.grade.name,
      subject: a.subject.name,
      teacher: a.creatorTeacher.fullName,
      status: a.status,
      statusLabel: getAssessmentStatusLabel(a.status),
      assessmentId: a.id,
    })),
    ...scriptQueue.map((b) => ({
      id: b.id,
      type: "script_batch" as const,
      assessmentName: b.assessment.title,
      grade: b.assessment.grade.name,
      subject: b.assessment.subject.name,
      teacher: b.createdBy.fullName,
      status: b.status,
      statusLabel: getScriptBatchStatusLabel(b.status),
      assessmentId: b.assessment.id,
      batchId: b.id,
      scriptCount: b._count.learnerScripts,
    })),
  ];

  return { items };
}
