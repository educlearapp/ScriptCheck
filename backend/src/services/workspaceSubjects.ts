import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { validateCurriculumSelection } from "./curriculumValidation";

async function validateWorkspaceSubjectContext(input: {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  catalogSubjectId?: string | null;
}) {
  const [curriculum, phase, grade] = await Promise.all([
    prisma.curriculum.findUnique({ where: { id: input.curriculumId } }),
    prisma.phase.findUnique({ where: { id: input.phaseId } }),
    prisma.grade.findUnique({ where: { id: input.gradeId } }),
  ]);

  if (!curriculum) {
    throw new SubjectError("Curriculum not found", 400);
  }
  if (!phase || phase.curriculumId !== curriculum.id) {
    throw new SubjectError("Phase not found for selected curriculum", 400);
  }
  if (!grade || grade.phaseId !== phase.id) {
    throw new SubjectError("Grade not found for selected phase", 400);
  }

  if (input.catalogSubjectId) {
    await validateCurriculumSelection({
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      subjectId: input.catalogSubjectId,
    });
  }
}

export class SubjectError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "SubjectError";
  }
}

const subjectInclude = {
  curriculum: { select: { id: true, code: true, name: true } },
  phase: { select: { id: true, code: true, name: true } },
  grade: { select: { id: true, code: true, name: true } },
  catalogSubject: { select: { id: true, code: true, name: true, category: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkspaceSubjectInclude;

type WorkspaceSubjectRow = Prisma.WorkspaceSubjectGetPayload<{
  include: typeof subjectInclude;
}>;

export function serializeWorkspaceSubject(subject: WorkspaceSubjectRow) {
  return {
    id: subject.id,
    name: subject.name,
    code: subject.code,
    department: subject.department,
    active: subject.active,
    archivedAt: subject.archivedAt,
    curriculum: subject.curriculum,
    phase: subject.phase,
    grade: subject.grade,
    catalogSubject: subject.catalogSubject,
    createdBy: subject.createdBy,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

export type CreateWorkspaceSubjectInput = {
  name: string;
  code: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  catalogSubjectId?: string | null;
  department?: string | null;
};

export async function listWorkspaceSubjects(
  workspaceId: string,
  filters?: { active?: boolean; department?: string; gradeId?: string }
) {
  const subjects = await prisma.workspaceSubject.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      ...(filters?.active != null ? { active: filters.active } : {}),
      ...(filters?.department ? { department: filters.department } : {}),
      ...(filters?.gradeId ? { gradeId: filters.gradeId } : {}),
    },
    include: subjectInclude,
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });

  return subjects.map(serializeWorkspaceSubject);
}

export async function createWorkspaceSubject(
  workspaceId: string,
  userId: string,
  input: CreateWorkspaceSubjectInput
) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  if (!name || !code) {
    throw new SubjectError("Name and subject code are required");
  }

  await validateWorkspaceSubjectContext(input);

  const existing = await prisma.workspaceSubject.findFirst({
    where: { workspaceId, code, archivedAt: null },
  });
  if (existing) {
    throw new SubjectError("A subject with this code already exists", 409);
  }

  const subject = await prisma.workspaceSubject.create({
    data: {
      workspaceId,
      name,
      code,
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      catalogSubjectId: input.catalogSubjectId ?? null,
      department: input.department?.trim() || null,
      createdById: userId,
    },
    include: subjectInclude,
  });

  return serializeWorkspaceSubject(subject);
}

export async function updateWorkspaceSubject(
  workspaceId: string,
  subjectId: string,
  input: Partial<CreateWorkspaceSubjectInput> & { active?: boolean }
) {
  const existing = await prisma.workspaceSubject.findFirst({
    where: { id: subjectId, workspaceId, archivedAt: null },
  });
  if (!existing) {
    throw new SubjectError("Subject not found", 404);
  }

  if (
    input.curriculumId ||
    input.phaseId ||
    input.gradeId ||
    input.catalogSubjectId !== undefined
  ) {
    await validateWorkspaceSubjectContext({
      curriculumId: input.curriculumId ?? existing.curriculumId,
      phaseId: input.phaseId ?? existing.phaseId,
      gradeId: input.gradeId ?? existing.gradeId,
      catalogSubjectId:
        input.catalogSubjectId !== undefined
          ? input.catalogSubjectId
          : existing.catalogSubjectId,
    });
  }

  if (input.code && input.code.trim().toUpperCase() !== existing.code) {
    const duplicate = await prisma.workspaceSubject.findFirst({
      where: {
        workspaceId,
        code: input.code.trim().toUpperCase(),
        archivedAt: null,
        id: { not: subjectId },
      },
    });
    if (duplicate) {
      throw new SubjectError("A subject with this code already exists", 409);
    }
  }

  const subject = await prisma.workspaceSubject.update({
    where: { id: subjectId },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.code != null ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.curriculumId != null ? { curriculumId: input.curriculumId } : {}),
      ...(input.phaseId != null ? { phaseId: input.phaseId } : {}),
      ...(input.gradeId != null ? { gradeId: input.gradeId } : {}),
      ...(input.catalogSubjectId !== undefined
        ? { catalogSubjectId: input.catalogSubjectId }
        : {}),
      ...(input.department !== undefined
        ? { department: input.department?.trim() || null }
        : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
    include: subjectInclude,
  });

  return serializeWorkspaceSubject(subject);
}

export async function archiveWorkspaceSubject(workspaceId: string, subjectId: string) {
  const existing = await prisma.workspaceSubject.findFirst({
    where: { id: subjectId, workspaceId, archivedAt: null },
  });
  if (!existing) {
    throw new SubjectError("Subject not found", 404);
  }

  const subject = await prisma.workspaceSubject.update({
    where: { id: subjectId },
    data: { active: false, archivedAt: new Date() },
    include: subjectInclude,
  });

  return serializeWorkspaceSubject(subject);
}
