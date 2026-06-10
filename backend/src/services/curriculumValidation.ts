import { prisma } from "../prisma";

export class CurriculumValidationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "CurriculumValidationError";
  }
}

export async function validateCurriculumSelection(input: {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
}) {
  const [curriculum, phase, grade, subject] = await Promise.all([
    prisma.curriculum.findUnique({ where: { id: input.curriculumId } }),
    prisma.phase.findUnique({ where: { id: input.phaseId } }),
    prisma.grade.findUnique({
      where: { id: input.gradeId },
      include: { phase: true },
    }),
    prisma.subject.findUnique({
      where: { id: input.subjectId },
      include: { phase: true },
    }),
  ]);

  if (!curriculum) {
    throw new CurriculumValidationError("Curriculum not found", 400);
  }

  if (!phase || phase.curriculumId !== curriculum.id) {
    throw new CurriculumValidationError(
      "Phase not found for selected curriculum",
      400
    );
  }

  if (!grade || grade.phaseId !== phase.id) {
    throw new CurriculumValidationError(
      "Grade not found for selected phase",
      400
    );
  }

  if (!subject || !subject.active) {
    throw new CurriculumValidationError("Subject not found or inactive", 400);
  }

  if (subject.phaseId !== phase.id) {
    throw new CurriculumValidationError(
      "Subject not found for selected phase",
      400
    );
  }

  if (subject.curriculumId !== curriculum.id) {
    throw new CurriculumValidationError(
      "Subject does not belong to selected curriculum",
      400
    );
  }

  return { curriculum, phase, grade, subject };
}
