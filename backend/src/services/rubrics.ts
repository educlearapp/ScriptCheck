import { RubricTemplateScope, RubricTemplateStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export class RubricError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "RubricError";
  }
}

export type RubricCriterionInput = {
  name: string;
  description?: string | null;
  maxMarks: number;
  orderIndex?: number;
};

const rubricInclude = {
  subject: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  criteria: { orderBy: { orderIndex: "asc" as const } },
} satisfies Prisma.RubricTemplateInclude;

type RubricRow = Prisma.RubricTemplateGetPayload<{ include: typeof rubricInclude }>;

export function calculateRubricTotal(criteria: { maxMarks: number }[]): number {
  return criteria.reduce((sum, c) => sum + c.maxMarks, 0);
}

export function serializeRubricTemplate(template: RubricRow) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    scope: template.scope,
    status: template.status,
    totalMarks: template.totalMarks,
    subject: template.subject,
    createdBy: template.createdBy,
    approvedBy: template.approvedBy,
    approvedAt: template.approvedAt,
    criteria: template.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      maxMarks: c.maxMarks,
      orderIndex: c.orderIndex,
    })),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function validateCriteria(criteria: RubricCriterionInput[]) {
  if (!criteria.length) {
    throw new RubricError("At least one rubric criterion is required");
  }

  for (const criterion of criteria) {
    const marks = Number(criterion.maxMarks);
    if (!criterion.name.trim()) {
      throw new RubricError("Each criterion must have a name");
    }
    if (!Number.isFinite(marks) || marks <= 0) {
      throw new RubricError(`Invalid max marks for criterion "${criterion.name}"`);
    }
  }
}

export type CreateRubricInput = {
  name: string;
  description?: string | null;
  subjectId?: string | null;
  scope: RubricTemplateScope;
  criteria: RubricCriterionInput[];
  submitForApproval?: boolean;
};

export async function listRubricTemplates(
  workspaceId: string,
  filters?: {
    status?: RubricTemplateStatus;
    subjectId?: string;
    scope?: RubricTemplateScope;
    includeArchived?: boolean;
  }
) {
  const templates = await prisma.rubricTemplate.findMany({
    where: {
      workspaceId,
      ...(filters?.includeArchived ? {} : { archivedAt: null }),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters?.scope ? { scope: filters.scope } : {}),
    },
    include: rubricInclude,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return templates.map(serializeRubricTemplate);
}

export async function getRubricTemplate(workspaceId: string, rubricId: string) {
  const template = await prisma.rubricTemplate.findFirst({
    where: { id: rubricId, workspaceId, archivedAt: null },
    include: rubricInclude,
  });
  if (!template) {
    throw new RubricError("Rubric template not found", 404);
  }
  return serializeRubricTemplate(template);
}

export async function createRubricTemplate(
  workspaceId: string,
  userId: string,
  input: CreateRubricInput
) {
  const name = input.name.trim();
  if (!name) {
    throw new RubricError("Rubric name is required");
  }

  validateCriteria(input.criteria);

  const totalMarks = calculateRubricTotal(input.criteria);
  const status = input.submitForApproval
    ? RubricTemplateStatus.PENDING_APPROVAL
    : RubricTemplateStatus.DRAFT;

  const template = await prisma.rubricTemplate.create({
    data: {
      workspaceId,
      name,
      description: input.description?.trim() || null,
      subjectId: input.subjectId ?? null,
      scope: input.scope,
      status,
      totalMarks,
      createdById: userId,
      criteria: {
        create: input.criteria.map((c, index) => ({
          name: c.name.trim(),
          description: c.description?.trim() || null,
          maxMarks: Number(c.maxMarks),
          orderIndex: c.orderIndex ?? index,
        })),
      },
    },
    include: rubricInclude,
  });

  return serializeRubricTemplate(template);
}

export async function updateRubricTemplate(
  workspaceId: string,
  rubricId: string,
  input: Partial<CreateRubricInput>
) {
  const existing = await prisma.rubricTemplate.findFirst({
    where: { id: rubricId, workspaceId, archivedAt: null },
    include: { criteria: true },
  });
  if (!existing) {
    throw new RubricError("Rubric template not found", 404);
  }
  if (existing.status === RubricTemplateStatus.APPROVED) {
    throw new RubricError("Approved rubrics cannot be edited. Create a new version.", 403);
  }

  if (input.criteria) {
    validateCriteria(input.criteria);
  }

  const totalMarks = input.criteria
    ? calculateRubricTotal(input.criteria)
    : existing.totalMarks;

  await prisma.$transaction(async (tx) => {
    if (input.criteria) {
      await tx.rubricCriterion.deleteMany({ where: { rubricTemplateId: rubricId } });
      await tx.rubricCriterion.createMany({
        data: input.criteria!.map((c, index) => ({
          rubricTemplateId: rubricId,
          name: c.name.trim(),
          description: c.description?.trim() || null,
          maxMarks: Number(c.maxMarks),
          orderIndex: c.orderIndex ?? index,
        })),
      });
    }

    await tx.rubricTemplate.update({
      where: { id: rubricId },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
        ...(input.scope != null ? { scope: input.scope } : {}),
        totalMarks,
        ...(input.submitForApproval
          ? { status: RubricTemplateStatus.PENDING_APPROVAL }
          : {}),
      },
    });
  });

  return getRubricTemplate(workspaceId, rubricId);
}

export async function approveRubricTemplate(
  workspaceId: string,
  rubricId: string,
  approverId: string
) {
  const existing = await prisma.rubricTemplate.findFirst({
    where: { id: rubricId, workspaceId, archivedAt: null },
  });
  if (!existing) {
    throw new RubricError("Rubric template not found", 404);
  }
  if (existing.status === RubricTemplateStatus.APPROVED) {
    throw new RubricError("Rubric is already approved");
  }

  const template = await prisma.rubricTemplate.update({
    where: { id: rubricId },
    data: {
      status: RubricTemplateStatus.APPROVED,
      approvedById: approverId,
      approvedAt: new Date(),
    },
    include: rubricInclude,
  });

  return serializeRubricTemplate(template);
}

export async function archiveRubricTemplate(workspaceId: string, rubricId: string) {
  const existing = await prisma.rubricTemplate.findFirst({
    where: { id: rubricId, workspaceId, archivedAt: null },
  });
  if (!existing) {
    throw new RubricError("Rubric template not found", 404);
  }

  const template = await prisma.rubricTemplate.update({
    where: { id: rubricId },
    data: { status: RubricTemplateStatus.ARCHIVED, archivedAt: new Date() },
    include: rubricInclude,
  });

  return serializeRubricTemplate(template);
}
