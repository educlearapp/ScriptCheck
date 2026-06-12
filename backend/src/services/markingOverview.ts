import { AssessmentStatus, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { UserAccessContext } from "./permissions";
import { hasBroadResultsAccess } from "./assessmentResults";
import { getAssessmentStatusLabel } from "../utils/statusLabels";

export type MarkingOverviewItem = {
  id: string;
  title: string;
  grade: { id: string; name: string };
  subject: { id: string; name: string };
  status: string;
  statusLabel: string;
  scriptCount: number;
  setupComplete: boolean;
  pagesPerScript: number | null;
  batchId: string | null;
  batchStatus: string | null;
};

export async function getMarkingOverview(
  workspaceId: string,
  userId: string,
  access: UserAccessContext
): Promise<{ items: MarkingOverviewItem[] }> {
  const broad = hasBroadResultsAccess(access, workspaceId);
  const creatorFilter = broad ? {} : { creatorTeacherId: userId };

  const assessments = await prisma.assessment.findMany({
    where: {
      workspaceId,
      ...creatorFilter,
      status: {
        in: [
          AssessmentStatus.MARKING,
          AssessmentStatus.WRITTEN,
          AssessmentStatus.MARKED,
          AssessmentStatus.APPROVED,
        ],
      },
    },
    include: {
      grade: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      scriptBatches: {
        where: {
          status: {
            in: [
              ScriptBatchStatus.DRAFT,
              ScriptBatchStatus.MARKING,
              ScriptBatchStatus.TEACHER_REVIEW,
              ScriptBatchStatus.RETURNED_TO_TEACHER,
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          totalScripts: true,
          status: true,
        },
      },
      _count: { select: { learnerScripts: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items: MarkingOverviewItem[] = assessments.map((a) => {
    const activeBatch = a.scriptBatches[0] ?? null;
    return {
      id: a.id,
      title: a.title,
      grade: a.grade,
      subject: a.subject,
      status: a.status,
      statusLabel: getAssessmentStatusLabel(a.status),
      scriptCount: activeBatch?.totalScripts ?? a._count.learnerScripts,
      setupComplete: a.setupComplete,
      pagesPerScript: a.pagesPerScript,
      batchId: activeBatch?.id ?? null,
      batchStatus: activeBatch?.status ?? null,
    };
  });

  return { items };
}
