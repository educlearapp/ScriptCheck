import { AssessmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  hasPermission,
  hasRole,
  PERMISSIONS,
  UserAccessContext,
} from "./permissions";
import { WorkspaceRole } from "@prisma/client";

export class QuestionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "QuestionError";
  }
}

const EDITABLE_STATUSES: AssessmentStatus[] = [
  AssessmentStatus.DRAFT,
  AssessmentStatus.RETURNED_TO_TEACHER,
];

export type QuestionInput = {
  questionNumber?: string;
  section?: string | null;
  questionText?: string;
  topic?: string | null;
  marks?: number;
  cognitiveLevel?: string | null;
  difficulty?: string | null;
  expectedAnswer?: string | null;
  memoNotes?: string | null;
  rubricNotes?: string | null;
  orderIndex?: number;
};

export function serializeQuestion(question: {
  id: string;
  assessmentId: string;
  questionNumber: string;
  section: string | null;
  questionText: string;
  topic: string | null;
  marks: number;
  cognitiveLevel: string | null;
  difficulty: string | null;
  expectedAnswer: string | null;
  memoNotes: string | null;
  rubricNotes: string | null;
  orderIndex: number;
  analyticsMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: question.id,
    assessmentId: question.assessmentId,
    questionNumber: question.questionNumber,
    section: question.section,
    questionText: question.questionText,
    topic: question.topic,
    marks: question.marks,
    cognitiveLevel: question.cognitiveLevel,
    difficulty: question.difficulty,
    expectedAnswer: question.expectedAnswer,
    memoNotes: question.memoNotes,
    rubricNotes: question.rubricNotes,
    orderIndex: question.orderIndex,
    analyticsMetadata: question.analyticsMetadata,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

export async function loadWorkspaceAssessment(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new QuestionError("Assessment not found", 404);
  }

  return assessment;
}

/** @deprecated Use loadWorkspaceAssessment */
export const loadSchoolAssessment = loadWorkspaceAssessment;

export async function calculateMarksSummary(
  assessmentId: string,
  declaredTotalMarks: number
) {
  const agg = await prisma.assessmentQuestion.aggregate({
    where: { assessmentId },
    _sum: { marks: true },
    _count: { id: true },
  });

  const calculatedFromQuestions = agg._sum.marks ?? 0;
  const questionCount = agg._count.id;

  return {
    declaredTotalMarks,
    calculatedFromQuestions,
    mismatch: questionCount > 0 && calculatedFromQuestions !== declaredTotalMarks,
    questionCount,
  };
}

export function assertCanEditQuestions(
  assessment: { status: AssessmentStatus; creatorTeacherId: string },
  userId: string,
  access: UserAccessContext,
  workspaceId: string
) {
  if (!EDITABLE_STATUSES.includes(assessment.status)) {
    throw new QuestionError(
      "Questions can only be edited while assessment is DRAFT or RETURNED_TO_TEACHER",
      400
    );
  }

  const canEditAll = hasPermission(
    access,
    workspaceId,
    PERMISSIONS.ASSESSMENTS_EDIT
  );
  const canEditOwn = hasPermission(
    access,
    workspaceId,
    PERMISSIONS.ASSESSMENTS_EDIT_OWN
  );

  if (!canEditAll && !canEditOwn) {
    throw new QuestionError("Insufficient permissions to edit questions", 403);
  }

  const isTeacherOnly =
    hasRole(access, workspaceId, WorkspaceRole.TEACHER) && !canEditAll;

  if (isTeacherOnly && assessment.creatorTeacherId !== userId) {
    throw new QuestionError(
      "Teachers can only edit questions on their own assessments",
      403
    );
  }
}

function parseMarks(value: unknown): number {
  const marks = Number(value);
  if (!Number.isFinite(marks) || marks <= 0) {
    throw new QuestionError("marks must be a positive number");
  }
  return marks;
}

function buildAnalyticsPlaceholder() {
  return {
    averageScore: null,
    attemptCount: null,
    weakTopicFlag: null,
    cognitiveLevelPerformance: null,
    difficultyPerformance: null,
  };
}

export async function listAssessmentQuestions(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);

  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { orderIndex: "asc" },
  });

  const marksSummary = await calculateMarksSummary(
    assessment.id,
    assessment.totalMarks
  );

  return {
    questions: questions.map(serializeQuestion),
    marksSummary,
  };
}

export async function createAssessmentQuestion(
  assessmentId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  input: QuestionInput
) {
  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);
  assertCanEditQuestions(assessment, userId, access, workspaceId);

  if (!input.questionText?.trim()) {
    throw new QuestionError("questionText is required");
  }

  const marks = parseMarks(input.marks);
  const maxOrder = await prisma.assessmentQuestion.aggregate({
    where: { assessmentId: assessment.id },
    _max: { orderIndex: true },
  });
  const orderIndex = input.orderIndex ?? (maxOrder._max.orderIndex ?? -1) + 1;

  const questionNumber =
    input.questionNumber?.trim() ||
    String(orderIndex + 1);

  const question = await prisma.assessmentQuestion.create({
    data: {
      assessmentId: assessment.id,
      questionNumber,
      section: input.section?.trim() || null,
      questionText: input.questionText.trim(),
      topic: input.topic?.trim() || null,
      marks,
      cognitiveLevel: input.cognitiveLevel?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      expectedAnswer: input.expectedAnswer?.trim() || null,
      memoNotes: input.memoNotes?.trim() || null,
      rubricNotes: input.rubricNotes?.trim() || null,
      orderIndex,
      analyticsMetadata: buildAnalyticsPlaceholder(),
    },
  });

  return {
    question: serializeQuestion(question),
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
  };
}

export async function updateAssessmentQuestion(
  assessmentId: string,
  questionId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  input: QuestionInput
) {
  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);
  assertCanEditQuestions(assessment, userId, access, workspaceId);

  const existing = await prisma.assessmentQuestion.findFirst({
    where: { id: questionId, assessmentId: assessment.id },
  });

  if (!existing) {
    throw new QuestionError("Question not found", 404);
  }

  const question = await prisma.assessmentQuestion.update({
    where: { id: existing.id },
    data: {
      ...(input.questionNumber !== undefined
        ? { questionNumber: String(input.questionNumber).trim() }
        : {}),
      ...(input.section !== undefined
        ? { section: input.section?.trim() || null }
        : {}),
      ...(input.questionText !== undefined
        ? { questionText: String(input.questionText).trim() }
        : {}),
      ...(input.topic !== undefined ? { topic: input.topic?.trim() || null } : {}),
      ...(input.marks !== undefined ? { marks: parseMarks(input.marks) } : {}),
      ...(input.cognitiveLevel !== undefined
        ? { cognitiveLevel: input.cognitiveLevel?.trim() || null }
        : {}),
      ...(input.difficulty !== undefined
        ? { difficulty: input.difficulty?.trim() || null }
        : {}),
      ...(input.expectedAnswer !== undefined
        ? { expectedAnswer: input.expectedAnswer?.trim() || null }
        : {}),
      ...(input.memoNotes !== undefined
        ? { memoNotes: input.memoNotes?.trim() || null }
        : {}),
      ...(input.rubricNotes !== undefined
        ? { rubricNotes: input.rubricNotes?.trim() || null }
        : {}),
      ...(input.orderIndex !== undefined ? { orderIndex: Number(input.orderIndex) } : {}),
    },
  });

  return {
    question: serializeQuestion(question),
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
  };
}

export async function deleteAssessmentQuestion(
  assessmentId: string,
  questionId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext
) {
  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);
  assertCanEditQuestions(assessment, userId, access, workspaceId);

  const existing = await prisma.assessmentQuestion.findFirst({
    where: { id: questionId, assessmentId: assessment.id },
  });

  if (!existing) {
    throw new QuestionError("Question not found", 404);
  }

  await prisma.assessmentQuestion.delete({ where: { id: existing.id } });

  return {
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
  };
}
