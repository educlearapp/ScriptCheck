import {
  AssessmentStatus,
  AssessmentType,
  Prisma,
  QuestionBankSource,
  QuestionBankStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { UserAccessContext } from "./permissions";
import { hasPermission, PERMISSIONS } from "./permissions";
import {
  assertCanEditQuestions,
  calculateMarksSummary,
  loadWorkspaceAssessment,
  serializeQuestion,
} from "./assessmentQuestions";

export class QuestionBankError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "QuestionBankError";
  }
}

export type QuestionBankFilters = {
  workspaceId: string;
  curriculumId?: string;
  phaseId?: string;
  gradeId?: string;
  subjectId?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  marks?: number;
  status?: QuestionBankStatus;
  forPicker?: boolean;
};

const itemInclude = {
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
};

function assertCanEdit(
  access: UserAccessContext,
  workspaceId: string,
  item: { createdById: string; status: QuestionBankStatus }
) {
  if (item.status === QuestionBankStatus.ARCHIVED) {
    throw new QuestionBankError("Archived items cannot be edited", 400);
  }

  if (hasPermission(access, workspaceId, PERMISSIONS.QUESTION_BANK_EDIT)) {
    return;
  }

  if (
    item.createdById === access.userId &&
    item.status === QuestionBankStatus.DRAFT &&
    hasPermission(access, workspaceId, PERMISSIONS.QUESTION_BANK_CREATE)
  ) {
    return;
  }

  throw new QuestionBankError("Insufficient permissions to edit this item", 403);
}

export async function listQuestionBankItems(filters: QuestionBankFilters) {
  const items = await prisma.questionBankItem.findMany({
    where: {
      workspaceId: filters.workspaceId,
      ...(filters.curriculumId ? { curriculumId: filters.curriculumId } : {}),
      ...(filters.phaseId ? { phaseId: filters.phaseId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.topic ? { topic: { contains: filters.topic, mode: "insensitive" } } : {}),
      ...(filters.subtopic
        ? { subtopic: { contains: filters.subtopic, mode: "insensitive" } }
        : {}),
      ...(filters.difficulty
        ? { difficulty: { equals: filters.difficulty, mode: "insensitive" } }
        : {}),
      ...(filters.marks != null ? { marks: filters.marks } : {}),
      ...(filters.status
        ? { status: filters.status }
        : filters.forPicker
          ? { status: { not: QuestionBankStatus.ARCHIVED } }
          : {}),
    },
    include: itemInclude,
  });

  if (filters.forPicker) {
    items.sort((a, b) => {
      const aApproved = a.status === QuestionBankStatus.APPROVED ? 1 : 0;
      const bApproved = b.status === QuestionBankStatus.APPROVED ? 1 : 0;
      if (bApproved !== aApproved) return bApproved - aApproved;
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  } else {
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return items;
}

export async function getSavedFromAssessmentMap(
  workspaceId: string,
  assessmentId: string
) {
  const items = await prisma.questionBankItem.findMany({
    where: {
      workspaceId,
      metadata: {
        path: ["assessmentId"],
        equals: assessmentId,
      },
    },
    select: { id: true, metadata: true },
  });

  const map: Record<string, string> = {};
  for (const item of items) {
    const meta = item.metadata as { assessmentQuestionId?: string } | null;
    if (meta?.assessmentQuestionId) {
      map[meta.assessmentQuestionId] = item.id;
    }
  }
  return map;
}

export async function createQuestionBankItem(
  data: {
    workspaceId: string;
    curriculumId: string;
    phaseId: string;
    gradeId: string;
    subjectId: string;
    topic?: string | null;
    subtopic?: string | null;
    questionText: string;
    expectedAnswer?: string | null;
    memoNotes?: string | null;
    rubricNotes?: string | null;
    marks: number;
    difficulty?: string | null;
    cognitiveLevel?: string | null;
    source: QuestionBankSource;
    status?: QuestionBankStatus;
    createdById: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (!data.questionText.trim()) {
    throw new QuestionBankError("questionText is required", 400);
  }

  if (!Number.isFinite(data.marks) || data.marks <= 0) {
    throw new QuestionBankError("marks must be a positive number", 400);
  }

  return prisma.questionBankItem.create({
    data: {
      workspaceId: data.workspaceId,
      curriculumId: data.curriculumId,
      phaseId: data.phaseId,
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      topic: data.topic?.trim() || null,
      subtopic: data.subtopic?.trim() || null,
      questionText: data.questionText.trim(),
      expectedAnswer: data.expectedAnswer?.trim() || null,
      memoNotes: data.memoNotes?.trim() || null,
      rubricNotes: data.rubricNotes?.trim() || null,
      marks: data.marks,
      difficulty: data.difficulty?.trim() || null,
      cognitiveLevel: data.cognitiveLevel?.trim() || null,
      source: data.source,
      status: data.status ?? QuestionBankStatus.DRAFT,
      createdById: data.createdById,
      metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    include: itemInclude,
  });
}

export async function updateQuestionBankItem(
  id: string,
  workspaceId: string,
  access: UserAccessContext,
  updates: Partial<{
    topic: string | null;
    subtopic: string | null;
    questionText: string;
    expectedAnswer: string | null;
    memoNotes: string | null;
    rubricNotes: string | null;
    marks: number;
    difficulty: string | null;
    cognitiveLevel: string | null;
  }>
) {
  const item = await prisma.questionBankItem.findFirst({
    where: { id, workspaceId },
  });

  if (!item) throw new QuestionBankError("Question bank item not found", 404);

  assertCanEdit(access, workspaceId, item);

  if (updates.marks != null && updates.marks <= 0) {
    throw new QuestionBankError("marks must be a positive number", 400);
  }

  return prisma.questionBankItem.update({
    where: { id },
    data: {
      ...(updates.topic !== undefined ? { topic: updates.topic?.trim() || null } : {}),
      ...(updates.subtopic !== undefined ? { subtopic: updates.subtopic?.trim() || null } : {}),
      ...(updates.questionText !== undefined
        ? { questionText: updates.questionText.trim() }
        : {}),
      ...(updates.expectedAnswer !== undefined
        ? { expectedAnswer: updates.expectedAnswer?.trim() || null }
        : {}),
      ...(updates.memoNotes !== undefined
        ? { memoNotes: updates.memoNotes?.trim() || null }
        : {}),
      ...(updates.rubricNotes !== undefined
        ? { rubricNotes: updates.rubricNotes?.trim() || null }
        : {}),
      ...(updates.marks !== undefined ? { marks: updates.marks } : {}),
      ...(updates.difficulty !== undefined
        ? { difficulty: updates.difficulty?.trim() || null }
        : {}),
      ...(updates.cognitiveLevel !== undefined
        ? { cognitiveLevel: updates.cognitiveLevel?.trim() || null }
        : {}),
    },
    include: itemInclude,
  });
}

export async function approveQuestionBankItem(
  id: string,
  workspaceId: string,
  approvedById: string
) {
  const item = await prisma.questionBankItem.findFirst({
    where: { id, workspaceId },
  });

  if (!item) throw new QuestionBankError("Question bank item not found", 404);
  if (item.status === QuestionBankStatus.ARCHIVED) {
    throw new QuestionBankError("Cannot approve archived item", 400);
  }
  if (item.status === QuestionBankStatus.APPROVED) {
    throw new QuestionBankError("Item is already approved", 400);
  }

  return prisma.questionBankItem.update({
    where: { id },
    data: {
      status: QuestionBankStatus.APPROVED,
      approvedById,
      approvedAt: new Date(),
      source:
        item.source === QuestionBankSource.TEACHER_CREATED
          ? QuestionBankSource.HOD_APPROVED
          : item.source,
    },
    include: itemInclude,
  });
}

export async function archiveQuestionBankItem(id: string, workspaceId: string) {
  const item = await prisma.questionBankItem.findFirst({
    where: { id, workspaceId },
  });

  if (!item) throw new QuestionBankError("Question bank item not found", 404);

  return prisma.questionBankItem.update({
    where: { id },
    data: {
      status: QuestionBankStatus.ARCHIVED,
      archivedAt: new Date(),
    },
    include: itemInclude,
  });
}

function sourceForAssessment(status: AssessmentStatus): QuestionBankSource {
  if (status === AssessmentStatus.APPROVED || status === AssessmentStatus.PUBLISHED) {
    return QuestionBankSource.HOD_APPROVED;
  }
  return QuestionBankSource.TEACHER_CREATED;
}

async function questionToBankItem(
  assessment: {
    id: string;
    workspaceId: string;
    curriculumId: string;
    phaseId: string;
    gradeId: string;
    subjectId: string;
    status: AssessmentStatus;
  },
  question: {
    id: string;
    questionText: string;
    topic: string | null;
    marks: number;
    difficulty: string | null;
    cognitiveLevel: string | null;
    expectedAnswer: string | null;
    memoNotes: string | null;
    rubricNotes: string | null;
  },
  userId: string
) {
  const existing = await prisma.questionBankItem.findFirst({
    where: {
      workspaceId: assessment.workspaceId,
      metadata: {
        path: ["assessmentQuestionId"],
        equals: question.id,
      },
    },
  });

  if (existing) return { item: existing, created: false };

  const item = await createQuestionBankItem({
    workspaceId: assessment.workspaceId,
    curriculumId: assessment.curriculumId,
    phaseId: assessment.phaseId,
    gradeId: assessment.gradeId,
    subjectId: assessment.subjectId,
    topic: question.topic,
    questionText: question.questionText,
    expectedAnswer: question.expectedAnswer,
    memoNotes: question.memoNotes,
    rubricNotes: question.rubricNotes,
    marks: question.marks,
    difficulty: question.difficulty,
    cognitiveLevel: question.cognitiveLevel,
    source: sourceForAssessment(assessment.status),
    status: QuestionBankStatus.DRAFT,
    createdById: userId,
    metadata: {
      assessmentId: assessment.id,
      assessmentQuestionId: question.id,
    },
  });

  return { item, created: true };
}

export async function saveAssessmentQuestionsToBank(
  assessmentId: string,
  workspaceId: string,
  userId: string,
  questionId?: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      questions: questionId
        ? { where: { id: questionId } }
        : { orderBy: { orderIndex: "asc" } },
    },
  });

  if (!assessment) throw new QuestionBankError("Assessment not found", 404);
  if (questionId && assessment.questions.length === 0) {
    throw new QuestionBankError("Question not found on assessment", 404);
  }
  if (assessment.questions.length === 0) {
    throw new QuestionBankError("Assessment has no questions to save", 400);
  }

  const results = [];
  for (const question of assessment.questions) {
    results.push(await questionToBankItem(assessment, question, userId));
  }

  return {
    saved: results.filter((r) => r.created).length,
    skipped: results.filter((r) => !r.created).length,
    items: results.map((r) => r.item),
  };
}

export async function saveGeneratedQuestionsToBank(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await prisma.assessmentGenerationRequest.findFirst({
    where: { id: requestId, workspaceId },
    include: { generated: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!request) throw new QuestionBankError("Generation request not found", 404);

  const latest = request.generated[0];
  if (!latest) throw new QuestionBankError("No generated content found", 400);

  const metadata = latest.generationMetadata as {
    questions?: Array<{
      questionNumber: string;
      questionText: string;
      marks: number;
      topic: string;
      cognitiveLevel: string;
      difficulty: string;
      expectedAnswer?: string;
      memoNotes?: string;
    }>;
  };

  const questions = metadata.questions ?? [];
  if (questions.length === 0) {
    throw new QuestionBankError("No questions in generated content", 400);
  }

  const items = [];
  let saved = 0;
  let skipped = 0;

  for (const q of questions) {
    const key = `${requestId}:${q.questionNumber}`;
    const existing = await prisma.questionBankItem.findFirst({
      where: {
        workspaceId,
        metadata: { path: ["generationKey"], equals: key },
      },
    });

    if (existing) {
      skipped += 1;
      items.push(existing);
      continue;
    }

    const item = await createQuestionBankItem({
      workspaceId,
      curriculumId: request.curriculumId,
      phaseId: request.phaseId,
      gradeId: request.gradeId,
      subjectId: request.subjectId,
      topic: q.topic,
      questionText: q.questionText,
      expectedAnswer: q.expectedAnswer ?? null,
      memoNotes: q.memoNotes ?? null,
      marks: q.marks,
      difficulty: q.difficulty,
      cognitiveLevel: q.cognitiveLevel,
      source: QuestionBankSource.AI_GENERATED,
      status: QuestionBankStatus.DRAFT,
      createdById: userId,
      metadata: {
        generationRequestId: requestId,
        generationKey: key,
        questionNumber: q.questionNumber,
      },
    });
    saved += 1;
    items.push(item);
  }

  return { saved, skipped, items };
}

export async function listCurriculumTopics(filters: {
  curriculumId?: string;
  phaseId?: string;
  gradeId?: string;
  subjectId?: string;
}) {
  return prisma.curriculumTopic.findMany({
    where: {
      active: true,
      ...(filters.curriculumId ? { curriculumId: filters.curriculumId } : {}),
      ...(filters.phaseId ? { phaseId: filters.phaseId } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    orderBy: [{ orderIndex: "asc" }, { topic: "asc" }],
  });
}

export async function createCurriculumTopic(data: {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  topic: string;
  subtopic?: string | null;
  orderIndex?: number;
}) {
  const topic = data.topic.trim();
  if (!topic) throw new QuestionBankError("topic is required", 400);

  const subtopic = data.subtopic?.trim() || "";

  return prisma.curriculumTopic.create({
    data: {
      curriculumId: data.curriculumId,
      phaseId: data.phaseId,
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      topic,
      subtopic,
      orderIndex: data.orderIndex ?? 0,
    },
  });
}

export async function addQuestionBankItemsToAssessment(
  assessmentId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  itemIds: string[]
) {
  if (!itemIds.length) {
    throw new QuestionBankError("At least one question bank item is required", 400);
  }

  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);
  assertCanEditQuestions(assessment, userId, access, workspaceId);

  const bankItems = await prisma.questionBankItem.findMany({
    where: {
      id: { in: itemIds },
      workspaceId,
      status: { not: QuestionBankStatus.ARCHIVED },
    },
  });

  if (bankItems.length !== itemIds.length) {
    throw new QuestionBankError("One or more question bank items not found", 404);
  }

  const maxOrder = await prisma.assessmentQuestion.aggregate({
    where: { assessmentId: assessment.id },
    _max: { orderIndex: true },
  });
  let nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;
  let nextNumber = nextOrder + 1;

  const createdQuestions = [];
  const now = new Date();

  for (const item of bankItems) {
    const question = await prisma.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        questionNumber: String(nextNumber),
        questionText: item.questionText,
        topic: item.topic,
        marks: item.marks,
        cognitiveLevel: item.cognitiveLevel,
        difficulty: item.difficulty,
        expectedAnswer: item.expectedAnswer,
        memoNotes: item.memoNotes,
        rubricNotes: item.rubricNotes,
        orderIndex: nextOrder,
        analyticsMetadata: {
          averageScore: null,
          attemptCount: null,
          weakTopicFlag: null,
          cognitiveLevelPerformance: null,
          difficultyPerformance: null,
          questionBankItemId: item.id,
          subtopic: item.subtopic,
        },
      },
    });

    await prisma.questionBankItem.update({
      where: { id: item.id },
      data: {
        usageCount: { increment: 1 },
        firstUsedAt: item.firstUsedAt ?? now,
        lastUsedAt: now,
      },
    });

    createdQuestions.push(question);
    nextOrder += 1;
    nextNumber += 1;
  }

  return {
    questions: createdQuestions.map(serializeQuestion),
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
    usedItemIds: bankItems.map((i) => i.id),
  };
}

export async function createAssessmentFromQuestionBank(
  workspaceId: string,
  userId: string,
  data: {
    title: string;
    curriculumId: string;
    phaseId: string;
    gradeId: string;
    subjectId: string;
    assessmentType?: AssessmentType;
    totalMarks?: number;
    itemIds: string[];
  }
) {
  if (!data.itemIds.length) {
    throw new QuestionBankError("At least one question bank item is required", 400);
  }

  const title = data.title.trim();
  if (!title) throw new QuestionBankError("title is required", 400);

  const bankItems = await prisma.questionBankItem.findMany({
    where: {
      id: { in: data.itemIds },
      workspaceId,
      status: { not: QuestionBankStatus.ARCHIVED },
    },
  });

  if (bankItems.length !== data.itemIds.length) {
    throw new QuestionBankError("One or more question bank items not found", 404);
  }

  const questionTotal = bankItems.reduce((sum, q) => sum + q.marks, 0);
  const totalMarks = data.totalMarks ?? questionTotal;
  const now = new Date();

  const assessment = await prisma.assessment.create({
    data: {
      workspaceId,
      title,
      curriculumId: data.curriculumId,
      phaseId: data.phaseId,
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      assessmentType: data.assessmentType ?? "TEST",
      totalMarks,
      status: AssessmentStatus.DRAFT,
      creatorTeacherId: userId,
    },
  });

  const createdQuestions = [];
  for (let i = 0; i < bankItems.length; i++) {
    const item = bankItems[i];
    const question = await prisma.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        questionNumber: String(i + 1),
        questionText: item.questionText,
        topic: item.topic,
        marks: item.marks,
        cognitiveLevel: item.cognitiveLevel,
        difficulty: item.difficulty,
        expectedAnswer: item.expectedAnswer,
        memoNotes: item.memoNotes,
        rubricNotes: item.rubricNotes,
        orderIndex: i,
        analyticsMetadata: {
          averageScore: null,
          attemptCount: null,
          weakTopicFlag: null,
          cognitiveLevelPerformance: null,
          difficultyPerformance: null,
          questionBankItemId: item.id,
          subtopic: item.subtopic,
        },
      },
    });

    await prisma.questionBankItem.update({
      where: { id: item.id },
      data: {
        usageCount: { increment: 1 },
        firstUsedAt: item.firstUsedAt ?? now,
        lastUsedAt: now,
      },
    });

    createdQuestions.push(question);
  }

  return {
    assessmentId: assessment.id,
    questionCount: createdQuestions.length,
    usedItemIds: bankItems.map((i) => i.id),
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
  };
}

export async function saveApprovedAssessmentQuestionsToBank(
  assessmentId: string,
  workspaceId: string,
  approvedById: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });

  if (!assessment) throw new QuestionBankError("Assessment not found", 404);
  if (assessment.questions.length === 0) {
    throw new QuestionBankError("Assessment has no questions to save", 400);
  }

  const now = new Date();
  const items = [];

  for (const question of assessment.questions) {
    const existing = await prisma.questionBankItem.findFirst({
      where: {
        workspaceId,
        metadata: {
          path: ["assessmentQuestionId"],
          equals: question.id,
        },
      },
    });

    if (existing) {
      const updated = await prisma.questionBankItem.update({
        where: { id: existing.id },
        data: {
          status: QuestionBankStatus.APPROVED,
          source: QuestionBankSource.HOD_APPROVED,
          approvedById,
          approvedAt: now,
          questionText: question.questionText,
          topic: question.topic,
          marks: question.marks,
          difficulty: question.difficulty,
          cognitiveLevel: question.cognitiveLevel,
          expectedAnswer: question.expectedAnswer,
          memoNotes: question.memoNotes,
          rubricNotes: question.rubricNotes,
        },
        include: itemInclude,
      });
      items.push(updated);
    } else {
      const created = await prisma.questionBankItem.create({
        data: {
          workspaceId,
          curriculumId: assessment.curriculumId,
          phaseId: assessment.phaseId,
          gradeId: assessment.gradeId,
          subjectId: assessment.subjectId,
          topic: question.topic,
          questionText: question.questionText,
          expectedAnswer: question.expectedAnswer,
          memoNotes: question.memoNotes,
          rubricNotes: question.rubricNotes,
          marks: question.marks,
          difficulty: question.difficulty,
          cognitiveLevel: question.cognitiveLevel,
          source: QuestionBankSource.HOD_APPROVED,
          status: QuestionBankStatus.APPROVED,
          createdById: assessment.creatorTeacherId,
          approvedById,
          approvedAt: now,
          metadata: {
            assessmentId: assessment.id,
            assessmentQuestionId: question.id,
            hodApproved: true,
          },
        },
        include: itemInclude,
      });
      items.push(created);
    }
  }

  return { saved: items.length, items };
}
