import {
  AssessmentStatus,
  AssessmentTemplateStatus,
  AssessmentType,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  assertCanEditQuestions,
  calculateMarksSummary,
  loadWorkspaceAssessment,
} from "./assessmentQuestions";
import { UserAccessContext } from "./permissions";

export class TemplateError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

const templateInclude = {
  createdBy: { select: { id: true, fullName: true } },
  questions: { orderBy: { orderIndex: "asc" as const } },
};

function serializeTemplate(
  template: {
    id: string;
    workspaceId: string;
    curriculumId: string;
    phaseId: string;
    gradeId: string;
    subjectId: string;
    name: string;
    description: string | null;
    status: AssessmentTemplateStatus;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; fullName: string };
    questions: Array<{ id: string; marks: number }>;
  },
  refs?: {
    curriculum?: { id: string; code: string; name: string };
    phase?: { id: string; code: string; name: string };
    grade?: { id: string; code: string; name: string };
    subject?: { id: string; code: string; name: string };
  }
) {
  return {
    id: template.id,
    workspaceId: template.workspaceId,
    curriculumId: template.curriculumId,
    phaseId: template.phaseId,
    gradeId: template.gradeId,
    subjectId: template.subjectId,
    name: template.name,
    description: template.description,
    status: template.status,
    questionCount: template.questions.length,
    totalMarks: template.questions.reduce((sum, q) => sum + q.marks, 0),
    createdBy: template.createdBy,
    curriculum: refs?.curriculum ?? null,
    phase: refs?.phase ?? null,
    grade: refs?.grade ?? null,
    subject: refs?.subject ?? null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export async function listAssessmentTemplates(
  workspaceId: string,
  filters?: {
    curriculumId?: string;
    phaseId?: string;
    gradeId?: string;
    subjectId?: string;
  }
) {
  const templates = await prisma.assessmentTemplate.findMany({
    where: {
      workspaceId,
      status: AssessmentTemplateStatus.ACTIVE,
      ...(filters?.curriculumId ? { curriculumId: filters.curriculumId } : {}),
      ...(filters?.phaseId ? { phaseId: filters.phaseId } : {}),
      ...(filters?.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    include: templateInclude,
    orderBy: { updatedAt: "desc" },
  });

  const curriculumIds = [...new Set(templates.map((t) => t.curriculumId))];
  const phaseIds = [...new Set(templates.map((t) => t.phaseId))];
  const gradeIds = [...new Set(templates.map((t) => t.gradeId))];
  const subjectIds = [...new Set(templates.map((t) => t.subjectId))];

  const [curriculums, phases, grades, subjects] = await Promise.all([
    prisma.curriculum.findMany({
      where: { id: { in: curriculumIds } },
      select: { id: true, code: true, name: true },
    }),
    prisma.phase.findMany({
      where: { id: { in: phaseIds } },
      select: { id: true, code: true, name: true },
    }),
    prisma.grade.findMany({
      where: { id: { in: gradeIds } },
      select: { id: true, code: true, name: true },
    }),
    prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const cMap = Object.fromEntries(curriculums.map((c) => [c.id, c]));
  const pMap = Object.fromEntries(phases.map((p) => [p.id, p]));
  const gMap = Object.fromEntries(grades.map((g) => [g.id, g]));
  const sMap = Object.fromEntries(subjects.map((s) => [s.id, s]));

  return templates.map((t) =>
    serializeTemplate(t, {
      curriculum: cMap[t.curriculumId],
      phase: pMap[t.phaseId],
      grade: gMap[t.gradeId],
      subject: sMap[t.subjectId],
    })
  );
}

function extractSubtopic(analyticsMetadata: unknown): string | null {
  if (!analyticsMetadata || typeof analyticsMetadata !== "object") return null;
  const sub = (analyticsMetadata as { subtopic?: string }).subtopic;
  return sub?.trim() || null;
}

export async function createTemplateFromAssessment(
  assessmentId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  data: { name: string; description?: string | null }
) {
  const name = data.name.trim();
  if (!name) throw new TemplateError("Template name is required", 400);

  const assessment = await loadWorkspaceAssessment(assessmentId, workspaceId);
  assertCanEditQuestions(assessment, userId, access, workspaceId);

  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { orderIndex: "asc" },
  });

  if (questions.length === 0) {
    throw new TemplateError("Assessment has no questions to save as template", 400);
  }

  const template = await prisma.assessmentTemplate.create({
    data: {
      workspaceId,
      curriculumId: assessment.curriculumId,
      phaseId: assessment.phaseId,
      gradeId: assessment.gradeId,
      subjectId: assessment.subjectId,
      name,
      description: data.description?.trim() || null,
      createdById: userId,
      questions: {
        create: questions.map((q) => ({
          questionText: q.questionText,
          topic: q.topic,
          subtopic: extractSubtopic(q.analyticsMetadata),
          expectedAnswer: q.expectedAnswer,
          memoNotes: q.memoNotes,
          rubricNotes: q.rubricNotes,
          marks: q.marks,
          difficulty: q.difficulty,
          cognitiveLevel: q.cognitiveLevel,
          orderIndex: q.orderIndex,
        })),
      },
    },
    include: templateInclude,
  });

  return serializeTemplate(template);
}

function buildSpread(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim() || "Unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getTemplatePreview(templateId: string, workspaceId: string) {
  const template = await prisma.assessmentTemplate.findFirst({
    where: { id: templateId, workspaceId, status: AssessmentTemplateStatus.ACTIVE },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });

  if (!template) throw new TemplateError("Template not found", 404);

  const [curriculum, phase, grade, subject] = await Promise.all([
    prisma.curriculum.findUnique({
      where: { id: template.curriculumId },
      select: { id: true, code: true, name: true },
    }),
    prisma.phase.findUnique({
      where: { id: template.phaseId },
      select: { id: true, code: true, name: true },
    }),
    prisma.grade.findUnique({
      where: { id: template.gradeId },
      select: { id: true, code: true, name: true },
    }),
    prisma.subject.findUnique({
      where: { id: template.subjectId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const totalMarks = template.questions.reduce((sum, q) => sum + q.marks, 0);

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    questionCount: template.questions.length,
    totalMarks,
    topicSpread: buildSpread(template.questions.map((q) => q.topic)),
    difficultySpread: buildSpread(template.questions.map((q) => q.difficulty)),
    createdBy: template.createdBy,
    curriculum,
    phase,
    grade,
    subject,
    questions: template.questions.map((q, idx) => ({
      orderIndex: idx + 1,
      questionText: q.questionText,
      topic: q.topic,
      subtopic: q.subtopic,
      marks: q.marks,
      difficulty: q.difficulty,
      cognitiveLevel: q.cognitiveLevel,
    })),
  };
}

export async function useAssessmentTemplate(
  templateId: string,
  workspaceId: string,
  userId: string,
  data: {
    title?: string;
    assessmentType?: AssessmentType;
    totalMarks?: number;
  }
) {
  const template = await prisma.assessmentTemplate.findFirst({
    where: { id: templateId, workspaceId, status: AssessmentTemplateStatus.ACTIVE },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });

  if (!template) throw new TemplateError("Template not found", 404);
  if (template.questions.length === 0) {
    throw new TemplateError("Template has no questions", 400);
  }

  const questionTotal = template.questions.reduce((sum, q) => sum + q.marks, 0);
  const title = data.title?.trim() || template.name;
  const totalMarks = data.totalMarks ?? questionTotal;

  const assessment = await prisma.assessment.create({
    data: {
      workspaceId,
      title,
      description: template.description,
      curriculumId: template.curriculumId,
      phaseId: template.phaseId,
      gradeId: template.gradeId,
      subjectId: template.subjectId,
      assessmentType: data.assessmentType ?? AssessmentType.TEST,
      totalMarks,
      status: AssessmentStatus.DRAFT,
      creatorTeacherId: userId,
      questions: {
        create: template.questions.map((q, idx) => ({
          questionNumber: String(idx + 1),
          questionText: q.questionText,
          topic: q.topic,
          marks: q.marks,
          cognitiveLevel: q.cognitiveLevel,
          difficulty: q.difficulty,
          expectedAnswer: q.expectedAnswer,
          memoNotes: q.memoNotes,
          rubricNotes: q.rubricNotes,
          orderIndex: idx,
          analyticsMetadata: {
            averageScore: null,
            attemptCount: null,
            weakTopicFlag: null,
            cognitiveLevelPerformance: null,
            difficultyPerformance: null,
            subtopic: q.subtopic,
            fromTemplateId: template.id,
          },
        })),
      },
    },
  });

  return {
    assessmentId: assessment.id,
    questionCount: template.questions.length,
    marksSummary: await calculateMarksSummary(assessment.id, assessment.totalMarks),
  };
}

export async function archiveAssessmentTemplate(
  templateId: string,
  workspaceId: string
) {
  const template = await prisma.assessmentTemplate.findFirst({
    where: { id: templateId, workspaceId },
  });

  if (!template) throw new TemplateError("Template not found", 404);

  return prisma.assessmentTemplate.update({
    where: { id: templateId },
    data: { status: AssessmentTemplateStatus.ARCHIVED },
    include: templateInclude,
  });
}
