import {
  AssessmentGenerationStatus,
  AssessmentStatus,
  AssessmentType,
  GenerationDifficulty,
  GenerationMode,
  Prisma,
} from "@prisma/client";
import { prisma } from "../prisma";
import { validateCurriculumSelection } from "./curriculumValidation";

export class GenerationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export type GeneratedQuestion = {
  questionNumber: string;
  questionText: string;
  marks: number;
  topic: string;
  cognitiveLevel: string;
  difficulty: string;
  expectedAnswer?: string;
  memoNotes?: string;
};

export type GeneratedMemoEntry = {
  questionNumber: string;
  markAllocation: number;
  expectedAnswer: string;
  memoNotes: string;
};

export type GenerationMetadata = {
  questions: GeneratedQuestion[];
  memo: {
    entries: GeneratedMemoEntry[];
    markAllocation: { questionNumber: string; marks: number }[];
  } | null;
  summary: {
    questionCount: number;
    totalMarks: number;
    topicsUsed: string[];
    difficulty: GenerationDifficulty;
    outputMode: GenerationMode;
    cognitiveLevels: string[];
  };
  mock: true;
  generatedAt: string;
};

export type CreateGenerationInput = {
  workspaceId: string;
  createdById: string;
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  assessmentType: AssessmentType;
  outputMode: GenerationMode;
  term?: string | null;
  title: string;
  totalMarks: number;
  difficulty: GenerationDifficulty;
  instructions?: string | null;
  topics: string[];
};

const COGNITIVE_LEVELS = ["Remember", "Understand", "Apply", "Analyse", "Evaluate"];

function allocateMarks(totalMarks: number, questionCount: number): number[] {
  const base = Math.floor(totalMarks / questionCount);
  const remainder = totalMarks % questionCount;
  return Array.from({ length: questionCount }, (_, i) =>
    base + (i < remainder ? 1 : 0)
  );
}

function questionCountForMarks(totalMarks: number): number {
  if (totalMarks <= 20) return 4;
  if (totalMarks <= 50) return 5;
  if (totalMarks <= 80) return 6;
  return 8;
}

function difficultyLabel(difficulty: GenerationDifficulty): string {
  switch (difficulty) {
    case "EASY":
      return "Easy";
    case "CHALLENGING":
      return "Challenging";
    default:
      return "Standard";
  }
}

/**
 * Deterministic mock generator — no external AI calls.
 * Content is derived from topics, marks, and difficulty.
 */
export async function generateAssessment(
  input: CreateGenerationInput
): Promise<GenerationMetadata> {
  const topics =
    input.topics.length > 0
      ? input.topics.map((t) => t.trim()).filter(Boolean)
      : ["General"];

  const questionCount = questionCountForMarks(input.totalMarks);
  const markSplit = allocateMarks(input.totalMarks, questionCount);
  const diffLabel = difficultyLabel(input.difficulty);

  const questions: GeneratedQuestion[] = markSplit.map((marks, index) => {
    const topic = topics[index % topics.length];
    const cognitiveLevel = COGNITIVE_LEVELS[index % COGNITIVE_LEVELS.length];
    const questionNumber = String(index + 1);

    return {
      questionNumber,
      questionText: `[${diffLabel}] Question ${questionNumber}: Solve a ${input.difficulty.toLowerCase()} problem involving ${topic}. Show all working.`,
      marks,
      topic,
      cognitiveLevel,
      difficulty: diffLabel,
      ...(input.outputMode !== "QUESTIONS_ONLY"
        ? {
            expectedAnswer: `Model answer for ${topic} (${marks} marks).`,
            memoNotes: `Award full marks for correct method and answer related to ${topic}.`,
          }
        : {}),
    };
  });

  const memo =
    input.outputMode === "QUESTIONS_ONLY"
      ? null
      : {
          entries: questions.map((q) => ({
            questionNumber: q.questionNumber,
            markAllocation: q.marks,
            expectedAnswer: q.expectedAnswer ?? `See memo for Q${q.questionNumber}.`,
            memoNotes: q.memoNotes ?? `Marking guide for ${q.topic}.`,
          })),
          markAllocation: questions.map((q) => ({
            questionNumber: q.questionNumber,
            marks: q.marks,
          })),
        };

  return {
    questions,
    memo,
    summary: {
      questionCount: questions.length,
      totalMarks: input.totalMarks,
      topicsUsed: topics,
      difficulty: input.difficulty,
      outputMode: input.outputMode,
      cognitiveLevels: [...new Set(questions.map((q) => q.cognitiveLevel))],
    },
    mock: true,
    generatedAt: new Date().toISOString(),
  };
}

type LoadedGenerationRequest = NonNullable<
  Awaited<ReturnType<typeof loadGenerationRequest>>
>;

export async function createAndGenerateRequest(
  input: CreateGenerationInput
): Promise<{
  request: LoadedGenerationRequest;
  generated: GenerationMetadata;
}> {
  await validateCurriculumSelection({
    curriculumId: input.curriculumId,
    phaseId: input.phaseId,
    gradeId: input.gradeId,
    subjectId: input.subjectId,
  });

  if (input.topics.length === 0) {
    throw new GenerationError("At least one topic is required", 400);
  }

  const request = await prisma.assessmentGenerationRequest.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.createdById,
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      subjectId: input.subjectId,
      assessmentType: input.assessmentType,
      outputMode: input.outputMode,
      term: input.term?.trim() || null,
      title: input.title.trim(),
      totalMarks: input.totalMarks,
      difficulty: input.difficulty,
      instructions: input.instructions?.trim() || null,
      topics: input.topics,
      status: AssessmentGenerationStatus.GENERATING,
    },
  });

  try {
    const metadata = await generateAssessment(input);
    const generated = await prisma.generatedAssessment.create({
      data: {
        requestId: request.id,
        version: 1,
        generatedBy: input.createdById,
        generationMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    const updated = await prisma.assessmentGenerationRequest.update({
      where: { id: request.id },
      data: { status: AssessmentGenerationStatus.GENERATED },
    });

    const loaded = await loadGenerationRequest(updated.id, input.workspaceId);
    if (!loaded) {
      throw new GenerationError("Request not found after generation", 500);
    }

    return { request: loaded, generated: metadata };
  } catch (err) {
    await prisma.assessmentGenerationRequest.update({
      where: { id: request.id },
      data: { status: AssessmentGenerationStatus.FAILED },
    });
    throw err;
  }
}

export async function regenerateRequest(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadGenerationRequest(requestId, workspaceId);
  if (!request) throw new GenerationError("Generation request not found", 404);

  if (request.generated.some((g) => g.assessmentId)) {
    throw new GenerationError("Cannot regenerate an approved request", 400);
  }

  const topics = (request.topics as string[]) ?? [];

  await prisma.assessmentGenerationRequest.update({
    where: { id: requestId },
    data: { status: AssessmentGenerationStatus.GENERATING },
  });

  try {
    const metadata = await generateAssessment({
      workspaceId: request.workspaceId,
      createdById: request.createdById,
      curriculumId: request.curriculumId,
      phaseId: request.phaseId,
      gradeId: request.gradeId,
      subjectId: request.subjectId,
      assessmentType: request.assessmentType,
      outputMode: request.outputMode,
      term: request.term,
      title: request.title,
      totalMarks: request.totalMarks,
      difficulty: request.difficulty,
      instructions: request.instructions,
      topics,
    });

    const nextVersion =
      (request.generated.reduce((max, g) => Math.max(max, g.version), 0) || 0) + 1;

    await prisma.generatedAssessment.create({
      data: {
        requestId,
        version: nextVersion,
        generatedBy: userId,
        generationMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.assessmentGenerationRequest.update({
      where: { id: requestId },
      data: { status: AssessmentGenerationStatus.GENERATED },
    });

    const loaded = await loadGenerationRequest(requestId, workspaceId);
    if (!loaded) throw new GenerationError("Request not found after regeneration", 500);

    return { request: loaded, generated: metadata };
  } catch (err) {
    await prisma.assessmentGenerationRequest.update({
      where: { id: requestId },
      data: { status: AssessmentGenerationStatus.FAILED },
    });
    throw err;
  }
}

export async function approveGeneratedRequest(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadGenerationRequest(requestId, workspaceId);
  if (!request) throw new GenerationError("Generation request not found", 404);

  if (request.status !== AssessmentGenerationStatus.GENERATED) {
    throw new GenerationError("Request must be in GENERATED status to approve", 400);
  }

  const latest = request.generated.sort((a, b) => b.version - a.version)[0];
  if (!latest) throw new GenerationError("No generated content to approve", 400);

  if (latest.assessmentId) {
    throw new GenerationError("This generation has already been approved", 400);
  }

  const metadata = latest.generationMetadata as unknown as GenerationMetadata;

  const [curriculum, phase, grade, subject] = await Promise.all([
    prisma.curriculum.findUnique({ where: { id: request.curriculumId } }),
    prisma.phase.findUnique({ where: { id: request.phaseId } }),
    prisma.grade.findUnique({ where: { id: request.gradeId } }),
    prisma.subject.findUnique({ where: { id: request.subjectId } }),
  ]);

  const description = [
    request.instructions,
    `AI-generated (${metadata.summary.outputMode.replaceAll("_", " ").toLowerCase()}).`,
    `Topics: ${metadata.summary.topicsUsed.join(", ")}.`,
    `Difficulty: ${metadata.summary.difficulty}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const result = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: {
        workspaceId,
        title: request.title,
        description,
        curriculumId: request.curriculumId,
        phaseId: request.phaseId,
        gradeId: request.gradeId,
        subjectId: request.subjectId,
        assessmentType: request.assessmentType,
        term: request.term,
        totalMarks: request.totalMarks,
        status: AssessmentStatus.DRAFT,
        creatorTeacherId: userId,
        aiMetadata: {
          generationRequestId: requestId,
          generatedVersion: latest.version,
          difficulty: request.difficulty,
          outputMode: request.outputMode,
          topics: metadata.summary.topicsUsed,
          mock: true,
        },
      },
      include: {
        curriculum: { select: { id: true, code: true, name: true } },
        phase: { select: { id: true, code: true, name: true } },
        grade: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true, category: true } },
      },
    });

    for (const [index, q] of metadata.questions.entries()) {
      await tx.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          topic: q.topic,
          marks: q.marks,
          cognitiveLevel: q.cognitiveLevel,
          difficulty: q.difficulty,
          expectedAnswer: q.expectedAnswer ?? null,
          memoNotes: q.memoNotes ?? null,
          orderIndex: index,
          analyticsMetadata: {
            averageScore: null,
            attemptCount: null,
            weakTopicFlag: null,
          },
        },
      });
    }

    await tx.generatedAssessment.update({
      where: { id: latest.id },
      data: { assessmentId: assessment.id },
    });

    return {
      assessment,
      curriculum,
      phase,
      grade,
      subject,
      version: latest.version,
    };
  });

  return result;
}

export async function discardGenerationRequest(
  requestId: string,
  workspaceId: string
) {
  const request = await prisma.assessmentGenerationRequest.findFirst({
    where: { id: requestId, workspaceId },
    include: { generated: true },
  });

  if (!request) throw new GenerationError("Generation request not found", 404);

  if (request.generated.some((g) => g.assessmentId)) {
    throw new GenerationError("Cannot discard an approved generation", 400);
  }

  await prisma.assessmentGenerationRequest.delete({ where: { id: requestId } });
  return { ok: true };
}

export async function loadGenerationRequest(id: string, workspaceId: string) {
  return prisma.assessmentGenerationRequest.findFirst({
    where: { id, workspaceId },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      generated: { orderBy: { version: "desc" } },
    },
  });
}

export async function serializeGenerationRequest(request: LoadedGenerationRequest) {
  const latest = request.generated[0] ?? null;
  const metadata = latest
    ? (latest.generationMetadata as unknown as GenerationMetadata)
    : null;

  const [curriculum, phase, grade, subject] = await Promise.all([
    prisma.curriculum.findUnique({
      where: { id: request.curriculumId },
      select: { id: true, code: true, name: true },
    }),
    prisma.phase.findUnique({
      where: { id: request.phaseId },
      select: { id: true, code: true, name: true },
    }),
    prisma.grade.findUnique({
      where: { id: request.gradeId },
      select: { id: true, code: true, name: true },
    }),
    prisma.subject.findUnique({
      where: { id: request.subjectId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return {
    id: request.id,
    workspaceId: request.workspaceId,
    title: request.title,
    assessmentType: request.assessmentType,
    outputMode: request.outputMode,
    term: request.term,
    totalMarks: request.totalMarks,
    difficulty: request.difficulty,
    instructions: request.instructions,
    topics: request.topics as string[],
    status: request.status,
    curriculumId: request.curriculumId,
    phaseId: request.phaseId,
    gradeId: request.gradeId,
    subjectId: request.subjectId,
    curriculum,
    phase,
    grade,
    subject,
    createdBy: request.createdBy,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    latestVersion: latest?.version ?? null,
    approvedAssessmentId: latest?.assessmentId ?? null,
    preview: metadata,
    versions: request.generated.map((g) => ({
      id: g.id,
      version: g.version,
      assessmentId: g.assessmentId,
      createdAt: g.createdAt,
    })),
  };
}
