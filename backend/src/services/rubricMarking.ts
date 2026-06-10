import { AssessmentStatus, MarkCaptureSource } from "@prisma/client";
import { prisma } from "../prisma";
import { computeMarkTotals } from "./markTotals";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import {
  canEditHodLayer,
  canEditTeacherLayer,
  isScriptReadOnly,
} from "./scriptWorkflow";
import { ScriptError } from "./scriptMarking";
import { syncMarkFromRubric } from "./markCapture";
import { evaluateLearnerAtRisk } from "./atRisk";

export type RubricMarkInput = {
  rubricCriterionId: string;
  teacherMark?: number | null;
  teacherComment?: string | null;
  hodMark?: number | null;
  hodComment?: string | null;
};

function computeFinalMark(teacherMark: number | null, hodMark: number | null): number | null {
  if (hodMark != null) return hodMark;
  if (teacherMark != null) return teacherMark;
  return null;
}

function sumMarks(marks: (number | null)[]): number {
  return marks.reduce<number>((sum, m) => sum + (m ?? 0), 0);
}

export async function ensureRubricMarksForScript(
  learnerScriptId: string,
  rubricTemplateId: string
) {
  const criteria = await prisma.rubricCriterion.findMany({
    where: { rubricTemplateId },
    orderBy: { orderIndex: "asc" },
  });

  for (const criterion of criteria) {
    await prisma.scriptRubricMark.upsert({
      where: {
        learnerScriptId_rubricCriterionId: {
          learnerScriptId,
          rubricCriterionId: criterion.id,
        },
      },
      create: {
        learnerScriptId,
        rubricCriterionId: criterion.id,
      },
      update: {},
    });
  }
}

export async function getRubricMarksForScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      assessment: {
        include: {
          rubricTemplate: {
            include: { criteria: { orderBy: { orderIndex: "asc" } } },
          },
        },
      },
      rubricMarks: {
        include: { rubricCriterion: true },
        orderBy: { rubricCriterion: { orderIndex: "asc" } },
      },
    },
  });

  if (!script) throw new ScriptError("Learner script not found", 404);

  const template = script.assessment.rubricTemplate;
  if (!template) {
    return { rubricTemplate: null, marks: [], totals: null };
  }

  if (script.rubricMarks.length === 0) {
    await ensureRubricMarksForScript(scriptId, template.id);
    return getRubricMarksForScript(scriptId, workspaceId);
  }

  const marks = template.criteria.map((criterion) => {
    const mark = script.rubricMarks.find((m) => m.rubricCriterionId === criterion.id);
    return {
      id: mark?.id ?? null,
      rubricCriterionId: criterion.id,
      name: criterion.name,
      description: criterion.description,
      maxMarks: criterion.maxMarks,
      orderIndex: criterion.orderIndex,
      teacherMark: mark?.teacherMark ?? null,
      hodMark: mark?.hodMark ?? null,
      finalMark: mark?.finalMark ?? null,
      teacherComment: mark?.teacherComment ?? null,
      hodComment: mark?.hodComment ?? null,
    };
  });

  const teacherTotal = sumMarks(marks.map((m) => m.teacherMark));
  const hodMarks = marks.map((m) => m.hodMark);
  const hodTotal = hodMarks.some((m) => m != null) ? sumMarks(hodMarks) : null;
  const finalTotal = sumMarks(marks.map((m) => computeFinalMark(m.teacherMark, m.hodMark)));
  const outOf = template.totalMarks;
  const percentage = outOf > 0 ? Math.round((finalTotal / outOf) * 1000) / 10 : null;

  return {
    rubricTemplate: {
      id: template.id,
      name: template.name,
      totalMarks: template.totalMarks,
      status: template.status,
    },
    marks,
    totals: {
      teacherTotal,
      hodTotal,
      finalTotal,
      outOf,
      percentage,
    },
  };
}

async function recalculateRubricScriptTotals(learnerScriptId: string) {
  const script = await prisma.learnerScript.findUnique({
    where: { id: learnerScriptId },
    include: {
      rubricMarks: true,
      assessment: {
        select: {
          totalMarks: true,
          rubricTemplate: { select: { totalMarks: true } },
        },
      },
    },
  });
  if (!script) return;

  for (const mark of script.rubricMarks) {
    const finalMark = computeFinalMark(mark.teacherMark, mark.hodMark);
    if (mark.finalMark !== finalMark) {
      await prisma.scriptRubricMark.update({
        where: { id: mark.id },
        data: { finalMark },
      });
    }
  }

  const updatedMarks = await prisma.scriptRubricMark.findMany({
    where: { learnerScriptId },
  });

  const teacherTotal = sumMarks(updatedMarks.map((m) => m.teacherMark));
  const hodMarks = updatedMarks.map((m) => m.hodMark);
  const hodTotal = hodMarks.some((m) => m != null) ? sumMarks(hodMarks) : null;
  const finalTotal = sumMarks(
    updatedMarks.map((m) => computeFinalMark(m.teacherMark, m.hodMark))
  );

  const assessmentTotal =
    script.assessment.rubricTemplate?.totalMarks ?? script.assessment.totalMarks;

  const computed = computeMarkTotals(teacherTotal, hodTotal, finalTotal, assessmentTotal);

  await prisma.learnerScript.update({
    where: { id: learnerScriptId },
    data: {
      teacherTotal: computed.teacherTotal,
      hodTotal: computed.hodTotal,
      finalTotal: computed.finalTotal,
      markDifference: computed.markDifference,
      teacherPercentage: computed.teacherPercentage,
      hodPercentage: computed.hodPercentage,
      finalPercentage: computed.finalPercentage,
      moderationVariancePercent: computed.moderationVariancePercent,
      varianceLevel: computed.varianceLevel,
    },
  });
}

export async function saveRubricMarks(
  scriptId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  marks: RubricMarkInput[]
) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: {
      assessment: {
        select: {
          status: true,
          rubricTemplateId: true,
          rubricTemplate: { include: { criteria: true } },
        },
      },
      learner: { select: { id: true } },
    },
  });

  if (!script) throw new ScriptError("Learner script not found", 404);
  if (!script.assessment.rubricTemplateId || !script.assessment.rubricTemplate) {
    throw new ScriptError("Assessment has no rubric template attached", 400);
  }
  if (script.assessment.status === AssessmentStatus.PUBLISHED) {
    throw new ScriptError("Published results are read-only", 403);
  }
  if (isScriptReadOnly(script)) {
    throw new ScriptError("Finalised scripts are read-only", 403);
  }

  const canMark = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MARK);
  const canModerate = hasPermission(access, workspaceId, PERMISSIONS.SCRIPTS_MODERATE);
  if (!canMark && !canModerate) {
    throw new ScriptError("Insufficient permissions to save rubric marks", 403);
  }

  const teacherEditable = canEditTeacherLayer(script);
  const hodEditable = canEditHodLayer(script);
  const criterionMap = new Map(
    script.assessment.rubricTemplate.criteria.map((c) => [c.id, c])
  );

  await ensureRubricMarksForScript(scriptId, script.assessment.rubricTemplateId);

  for (const entry of marks) {
    const criterion = criterionMap.get(entry.rubricCriterionId);
    if (!criterion) continue;

    const existing = await prisma.scriptRubricMark.findUnique({
      where: {
        learnerScriptId_rubricCriterionId: {
          learnerScriptId: scriptId,
          rubricCriterionId: entry.rubricCriterionId,
        },
      },
    });
    if (!existing) continue;

    const updateData: Record<string, unknown> = {};

    if (canMark && teacherEditable) {
      if (entry.teacherMark !== undefined) {
        const val = entry.teacherMark;
        if (val != null && (val < 0 || val > criterion.maxMarks)) {
          throw new ScriptError(
            `Mark for "${criterion.name}" must be between 0 and ${criterion.maxMarks}`,
            400
          );
        }
        updateData.teacherMark = val;
        updateData.teacherMarkedById = userId;
      }
      if (entry.teacherComment !== undefined) {
        updateData.teacherComment = entry.teacherComment?.trim() || null;
      }
    }

    if (canModerate && hodEditable) {
      if (entry.hodMark !== undefined) {
        const val = entry.hodMark;
        if (val != null && (val < 0 || val > criterion.maxMarks)) {
          throw new ScriptError(
            `HOD mark for "${criterion.name}" must be between 0 and ${criterion.maxMarks}`,
            400
          );
        }
        updateData.hodMark = val;
        updateData.hodModeratedById = userId;
      }
      if (entry.hodComment !== undefined) {
        updateData.hodComment = entry.hodComment?.trim() || null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.scriptRubricMark.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
  }

  await recalculateRubricScriptTotals(scriptId);
  await syncMarkFromRubric(scriptId, userId, MarkCaptureSource.RUBRIC_MARKING);
  await evaluateLearnerAtRisk(workspaceId, script.learnerId).catch((err) => {
    console.error("[atRisk] evaluation failed", err);
  });

  return getRubricMarksForScript(scriptId, workspaceId);
}
