import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  AiBloomLevel,
  AiBuilderSourceMode,
  AiBuilderStatus,
  AiMaterialType,
  AiQuestionType,
  AiUploadPurpose,
  AssessmentStatus,
  AssessmentType,
  PaperDocumentType,
  Prisma,
  QuestionBankSource,
  RubricTemplateScope,
  RubricTemplateStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { validateCurriculumSelection } from "./curriculumValidation";
import {
  detectMaterialType,
  extractTextFromFile,
  resolveMaterialText,
} from "./contentExtraction";
import { isPlaceholderText, sanitiseSourceText } from "./contentConcepts";
import {
  generateAssessmentFromMaterial,
  generateDraftFromExtractedQuestions,
  generateDraftFromQuestionBank,
  generateFromBlueprint,
  type AiGeneratedDraft,
} from "./aiAssessmentEngine";
import {
  buildBlueprintFromFramework,
  validateDraftAgainstBlueprint,
  type PaperBlueprint,
} from "./frameworkEngine";
import { sanitizeOcrText } from "./contentSanitizer";
import {
  extractQuestionsFromPastPaper,
  type ExtractedPaperQuestion,
} from "./pastPaperExtractor";
import {
  createQuestionBankItem,
} from "./questionBank";
import {
  findDuplicatesForQuestions,
  type DuplicateCheckResult,
} from "./questionDuplicateDetection";
import { runQualityChecks, bloomLevelLabel } from "./aiAssessmentQuality";
import { generateAiAssessmentPdf, type ExportType } from "./aiAssessmentExport";
import { uploadPaperVaultDocument, type UploadedVaultFile } from "./paperVault";
import type { UserAccessContext } from "./permissions";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

export class AiBuilderError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AiBuilderError";
  }
}

function materialUploadDir(workspaceId: string, requestId: string) {
  return path.join(UPLOAD_ROOT, workspaceId, "ai-materials", requestId);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

type LoadedRequest = NonNullable<Awaited<ReturnType<typeof loadBuilderRequest>>>;

export async function createBuilderRequest(workspaceId: string, userId: string) {
  return prisma.aiAssessmentBuilderRequest.create({
    data: {
      workspaceId,
      createdById: userId,
      status: "UPLOADING",
    },
    include: {
      materials: true,
      createdBy: { select: { id: true, fullName: true, email: true } },
      assessment: { select: { id: true, title: true, status: true } },
    },
  });
}

export async function loadBuilderRequest(id: string, workspaceId: string) {
  return prisma.aiAssessmentBuilderRequest.findFirst({
    where: { id, workspaceId },
    include: {
      materials: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      assessment: { select: { id: true, title: true, status: true } },
    },
  });
}

function assertEditable(request: LoadedRequest) {
  if (request.status === "APPROVED") {
    throw new AiBuilderError("This builder request has already been approved", 400);
  }
}

function assertCanView(request: LoadedRequest, userId: string, access: UserAccessContext, workspaceId: string) {
  if (request.createdById === userId) return;
  const isReviewer = access.memberships.some(
    (m) =>
      m.workspaceId === workspaceId &&
      m.roles.some((r) => ["HOD", "PRINCIPAL", "SCHOOL_ADMIN", "EXAM_BODY_ADMIN"].includes(r))
  );
  if (!isReviewer) {
    throw new AiBuilderError("Not permitted to view this builder request", 403);
  }
}

export async function uploadStudyMaterial(
  requestId: string,
  workspaceId: string,
  userId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  uploadPurpose: AiUploadPurpose = "STUDY_MATERIAL"
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("You can only upload materials to your own builder requests", 403);
  }

  if (request.materials.length >= MAX_FILES) {
    throw new AiBuilderError(`Maximum ${MAX_FILES} files allowed`, 400);
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AiBuilderError("File type not allowed. Supported: PDF, JPG, PNG, DOCX, TXT", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AiBuilderError("File exceeds 25 MB limit", 400);
  }

  const fileType = detectMaterialType(file.mimetype, file.originalname);
  if (!fileType) {
    throw new AiBuilderError("Could not determine file type", 400);
  }

  const dir = materialUploadDir(workspaceId, requestId);
  fs.mkdirSync(dir, { recursive: true });
  const storedKey = `${Date.now()}-${randomUUID()}-${sanitizeFileName(file.originalname)}`;
  const storedPath = path.join(dir, storedKey);
  fs.writeFileSync(storedPath, file.buffer);

  const material = await prisma.aiStudyMaterial.create({
    data: {
      requestId,
      workspaceId,
      fileType,
      fileName: file.originalname,
      storedKey,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadPurpose,
      uploadedById: userId,
    },
  });

  const sourceMode: AiBuilderSourceMode =
    uploadPurpose === "PAST_PAPER"
      ? "PAST_PAPER"
      : uploadPurpose === "ASSESSMENT_FRAMEWORK"
        ? "FRAMEWORK"
        : "STUDY_MATERIAL";

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: { sourceMode },
  });

  return serializeMaterial(material);
}

export async function deleteStudyMaterial(
  requestId: string,
  materialId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  const material = request.materials.find((m) => m.id === materialId);
  if (!material) throw new AiBuilderError("Material not found", 404);

  const filePath = path.join(materialUploadDir(workspaceId, requestId), material.storedKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.aiStudyMaterial.delete({ where: { id: materialId } });
  return { ok: true };
}

export async function extractAllContent(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  if (request.materials.length === 0) {
    throw new AiBuilderError("Upload at least one file", 400);
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: { status: "EXTRACTING" },
  });

  const results = [];

  for (const material of request.materials) {
    const filePath = path.join(
      materialUploadDir(workspaceId, requestId),
      material.storedKey
    );

    try {
      const extraction = await extractTextFromFile(material.fileType, filePath);
      const effectiveText = sanitiseSourceText(extraction.text);

      let extractedQuestions: ExtractedPaperQuestion[] | null = null;
      let duplicateWarnings: DuplicateCheckResult[] | null = null;

      if (
        material.uploadPurpose === "PAST_PAPER" &&
        effectiveText
      ) {
        extractedQuestions = extractQuestionsFromPastPaper(
          effectiveText,
          material.fileName
        );

        duplicateWarnings = await findDuplicatesForQuestions(
          workspaceId,
          extractedQuestions.map((q) => ({ id: q.id, questionText: q.questionText })),
          {
            subjectId: request.subjectId ?? undefined,
            gradeId: request.gradeId ?? undefined,
          }
        );
      }

      if (material.uploadPurpose === "ASSESSMENT_FRAMEWORK" && effectiveText) {
        await prisma.aiAssessmentBuilderRequest.update({
          where: { id: requestId },
          data: { frameworkText: effectiveText },
        });
      }

      const updated = await prisma.aiStudyMaterial.update({
        where: { id: material.id },
        data: {
          extractedText: extraction.text || null,
          extractionStatus: extraction.status,
          ocrAttempted: extraction.ocrAttempted,
          ocrConfidence: extraction.ocrConfidence ?? null,
          ...(extractedQuestions
            ? {
                extractedQuestions: extractedQuestions as unknown as Prisma.InputJsonValue,
                duplicateWarnings: duplicateWarnings as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      results.push(serializeMaterial(updated));
    } catch (err) {
      await prisma.aiStudyMaterial.update({
        where: { id: material.id },
        data: { extractionStatus: "FAILED" },
      });
      throw err;
    }
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: { status: "SETTINGS" },
  });

  return results;
}

export type SaveQuestionDecision = {
  extractedId: string;
  action: "save" | "skip" | "merge";
  mergedText?: string;
};

export async function saveExtractedQuestionsToBank(
  requestId: string,
  materialId: string,
  workspaceId: string,
  userId: string,
  decisions: SaveQuestionDecision[],
  context: {
    curriculumId: string;
    phaseId: string;
    gradeId: string;
    subjectId: string;
    term?: string | null;
  }
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  const material = request.materials.find((m) => m.id === materialId);
  if (!material) throw new AiBuilderError("Material not found", 404);

  await validateCurriculumSelection(context);

  const extracted = (material.extractedQuestions as ExtractedPaperQuestion[] | null) ?? [];
  if (extracted.length === 0) {
    throw new AiBuilderError("No extracted questions on this material", 400);
  }

  const saved: { extractedId: string; itemId: string }[] = [];
  const skipped: string[] = [];

  for (const decision of decisions) {
    if (decision.action === "skip") {
      skipped.push(decision.extractedId);
      continue;
    }

    const question = extracted.find((q) => q.id === decision.extractedId);
    if (!question) continue;

    const questionText =
      decision.action === "merge" && decision.mergedText?.trim()
        ? decision.mergedText.trim()
        : question.questionText;

    const item = await createQuestionBankItem({
      workspaceId,
      curriculumId: context.curriculumId,
      phaseId: context.phaseId,
      gradeId: context.gradeId,
      subjectId: context.subjectId,
      topic: question.topic ?? null,
      questionText,
      expectedAnswer: question.memoAnswer ?? null,
      memoNotes: question.rubricNotes ?? null,
      rubricNotes:
        question.questionType === "PARAGRAPH" || question.questionType === "CASE_STUDY"
          ? question.rubricNotes ?? "See rubric criteria"
          : null,
      marks: question.marks,
      difficulty: question.difficulty ?? null,
      cognitiveLevel: question.cognitiveLevel ?? null,
      source: QuestionBankSource.AI_GENERATED,
      createdById: userId,
      metadata: {
        sourcePaper: material.fileName,
        materialId: material.id,
        builderRequestId: requestId,
        questionNumber: question.questionNumber,
        questionType: question.questionType,
        term: context.term ?? null,
        tags: question.tags,
        extractedConfidence: question.confidence,
      },
    });

    saved.push({ extractedId: question.id, itemId: item.id });
  }

  return { saved, skipped, count: saved.length };
}

export async function refreshMaterialDuplicates(
  requestId: string,
  materialId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  const material = request.materials.find((m) => m.id === materialId);
  if (!material) throw new AiBuilderError("Material not found", 404);

  const extracted = (material.extractedQuestions as ExtractedPaperQuestion[] | null) ?? [];
  const duplicateWarnings = await findDuplicatesForQuestions(
    workspaceId,
    extracted.map((q) => ({ id: q.id, questionText: q.questionText })),
    {
      subjectId: request.subjectId ?? undefined,
      gradeId: request.gradeId ?? undefined,
    }
  );

  await prisma.aiStudyMaterial.update({
    where: { id: materialId },
    data: {
      duplicateWarnings: duplicateWarnings as unknown as Prisma.InputJsonValue,
    },
  });

  return duplicateWarnings;
}

export async function updateBuilderSource(
  requestId: string,
  workspaceId: string,
  userId: string,
  input: {
    sourceMode?: AiBuilderSourceMode;
    selectedQuestionBankIds?: string[];
    frameworkText?: string | null;
  }
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: {
      ...(input.sourceMode ? { sourceMode: input.sourceMode } : {}),
      ...(input.selectedQuestionBankIds
        ? { selectedQuestionBankIds: input.selectedQuestionBankIds }
        : {}),
      ...(input.frameworkText !== undefined ? { frameworkText: input.frameworkText } : {}),
    },
  });

  return loadBuilderRequest(requestId, workspaceId);
}

export async function updateMaterialText(
  requestId: string,
  materialId: string,
  workspaceId: string,
  userId: string,
  manualText: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  const material = request.materials.find((m) => m.id === materialId);
  if (!material) throw new AiBuilderError("Material not found", 404);

  const trimmed = manualText.trim();
  let extractedQuestions: ExtractedPaperQuestion[] | undefined;
  let duplicateWarnings: DuplicateCheckResult[] | undefined;

  if (material.uploadPurpose === "PAST_PAPER" && trimmed && !isPlaceholderText(trimmed)) {
    extractedQuestions = extractQuestionsFromPastPaper(trimmed, material.fileName);
    duplicateWarnings = await findDuplicatesForQuestions(
      workspaceId,
      extractedQuestions.map((q) => ({ id: q.id, questionText: q.questionText })),
      {
        subjectId: request.subjectId ?? undefined,
        gradeId: request.gradeId ?? undefined,
      }
    );
  }

  const updated = await prisma.aiStudyMaterial.update({
    where: { id: materialId },
    data: {
      manualText: trimmed || null,
      extractionStatus: trimmed && !isPlaceholderText(trimmed) ? "EXTRACTED" : material.extractionStatus,
      ...(extractedQuestions
        ? {
            extractedQuestions: extractedQuestions as unknown as Prisma.InputJsonValue,
            duplicateWarnings: duplicateWarnings as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });

  return serializeMaterial(updated);
}

export type BuilderSettingsInput = {
  curriculumId: string;
  phaseId: string;
  gradeId: string;
  subjectId: string;
  assessmentType: AssessmentType;
  title: string;
  term?: string | null;
  totalMarks: number;
  durationMinutes?: number | null;
  difficulty: "EASY" | "MODERATE" | "DIFFICULT" | "MIXED";
  questionTypes: string[];
  bloomLevels: string[];
  instructions?: string | null;
};

export async function saveBuilderSettings(
  requestId: string,
  workspaceId: string,
  userId: string,
  input: BuilderSettingsInput
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  await validateCurriculumSelection({
    curriculumId: input.curriculumId,
    phaseId: input.phaseId,
    gradeId: input.gradeId,
    subjectId: input.subjectId,
  });

  if (!input.title.trim()) throw new AiBuilderError("Assessment name is required", 400);
  if (!Number.isFinite(input.totalMarks) || input.totalMarks <= 0) {
    throw new AiBuilderError("Total marks must be a positive number", 400);
  }
  if (input.questionTypes.length === 0) {
    throw new AiBuilderError("Select at least one question type", 400);
  }
  if (input.bloomLevels.length === 0) {
    throw new AiBuilderError("Select at least one Bloom level", 400);
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: {
      curriculumId: input.curriculumId,
      phaseId: input.phaseId,
      gradeId: input.gradeId,
      subjectId: input.subjectId,
      assessmentType: input.assessmentType,
      title: input.title.trim(),
      term: input.term?.trim() || null,
      totalMarks: input.totalMarks,
      durationMinutes: input.durationMinutes ?? null,
      difficulty: input.difficulty,
      questionTypes: input.questionTypes as AiQuestionType[],
      bloomLevels: input.bloomLevels as AiBloomLevel[],
      instructions: input.instructions?.trim() || null,
      status: "SETTINGS",
    },
  });

  return loadBuilderRequest(requestId, workspaceId);
}

function combineSourceText(
  materials: LoadedRequest["materials"],
  purposes?: AiUploadPurpose[]
): string {
  const filtered = purposes
    ? materials.filter((m) => purposes.includes(m.uploadPurpose))
    : materials.filter((m) => m.uploadPurpose !== "ASSESSMENT_FRAMEWORK");

  const parts = filtered
    .map((m) => resolveMaterialText(m))
    .filter((t) => t && !isPlaceholderText(t))
    .map((t) => sanitizeOcrText(t));

  return sanitiseSourceText(parts.join("\n\n---\n\n"));
}

function resolveFrameworkText(request: LoadedRequest): string | null {
  const fromField = request.frameworkText?.trim();
  if (fromField) return fromField;

  const frameworkMaterial = request.materials.find(
    (m) => m.uploadPurpose === "ASSESSMENT_FRAMEWORK"
  );
  if (frameworkMaterial) {
    const text = resolveMaterialText(frameworkMaterial);
    if (text && !isPlaceholderText(text)) return text;
  }

  return null;
}

async function loadBankItemsForGeneration(
  request: LoadedRequest,
  workspaceId: string
) {
  const selectedIds = (request.selectedQuestionBankIds as string[] | null) ?? [];
  const where = {
    workspaceId,
    status: { not: "ARCHIVED" as const },
    ...(request.subjectId ? { subjectId: request.subjectId } : {}),
    ...(request.gradeId ? { gradeId: request.gradeId } : {}),
  };

  const allItems = await prisma.questionBankItem.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  if (selectedIds.length === 0) return allItems;

  const selected = allItems.filter((i) => selectedIds.includes(i.id));
  const rest = allItems.filter((i) => !selectedIds.includes(i.id));
  return [...selected, ...rest];
}

export async function generateAiAssessment(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  if (!request.title || !request.totalMarks || !request.curriculumId) {
    throw new AiBuilderError("Complete assessment settings before generating", 400);
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: { status: "GENERATING" },
  });

  try {
    const [grade, subject] = await Promise.all([
      prisma.grade.findUnique({ where: { id: request.gradeId! }, select: { name: true } }),
      prisma.subject.findUnique({ where: { id: request.subjectId! }, select: { name: true } }),
    ]);

    const genInput = {
      sourceText: "",
      title: request.title,
      totalMarks: request.totalMarks,
      durationMinutes: request.durationMinutes,
      difficulty: request.difficulty ?? "MODERATE" as const,
      questionTypes: request.questionTypes ?? [],
      bloomLevels: request.bloomLevels ?? [],
      instructions: request.instructions,
      gradeName: grade?.name,
      subjectName: subject?.name,
    };

    let draft: AiGeneratedDraft;
    let blueprint: PaperBlueprint | null = null;
    const frameworkText = resolveFrameworkText(request);

    if (frameworkText) {
      blueprint = buildBlueprintFromFramework(frameworkText);
      const studyText = combineSourceText(request.materials, ["STUDY_MATERIAL"]);
      const pastPaperText = combineSourceText(request.materials, ["PAST_PAPER"]);

      if (!studyText.trim() && !pastPaperText.trim()) {
        throw new AiBuilderError(
          "Framework requires study material or past paper content to fill question slots",
          400
        );
      }

      const allExtracted = request.materials
        .filter((m) => m.uploadPurpose === "PAST_PAPER")
        .flatMap((m) => (m.extractedQuestions as ExtractedPaperQuestion[] | null) ?? []);

      const bankItems = await loadBankItemsForGeneration(request, workspaceId);

      draft = generateFromBlueprint({
        blueprint,
        studyText: studyText || pastPaperText,
        bankItems: bankItems.map((b) => ({
          id: b.id,
          questionText: b.questionText,
          marks: b.marks,
          expectedAnswer: b.expectedAnswer,
          memoNotes: b.memoNotes,
          cognitiveLevel: b.cognitiveLevel,
          difficulty: b.difficulty,
          rubricNotes: b.rubricNotes,
          metadata: b.metadata,
        })),
        extractedQuestions: allExtracted.map((q) => ({
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          marks: q.marks,
          questionType: q.questionType,
          memoAnswer: q.memoAnswer,
          rubricNotes: q.rubricNotes,
          options: q.options,
        })),
        genInput: {
          ...genInput,
          sourceText: studyText || pastPaperText,
          totalMarks: blueprint.totalMarks,
        },
      });
    } else if (
      request.sourceMode === "QUESTION_BANK" ||
      ((request.selectedQuestionBankIds as string[] | null) ?? []).length > 0
    ) {
      const bankIds = (request.selectedQuestionBankIds as string[] | null) ?? [];
      const bankItems = await prisma.questionBankItem.findMany({
        where: { id: { in: bankIds }, workspaceId, status: { not: "ARCHIVED" } },
      });
      if (bankItems.length === 0) {
        throw new AiBuilderError("No valid question bank items selected", 400);
      }
      draft = generateDraftFromQuestionBank(genInput, bankItems);
    } else if (request.sourceMode === "PAST_PAPER") {
      const allExtracted = request.materials.flatMap(
        (m) => (m.extractedQuestions as ExtractedPaperQuestion[] | null) ?? []
      );
      if (allExtracted.length === 0) {
        throw new AiBuilderError(
          "No past paper questions extracted — upload a past paper and run extraction",
          400
        );
      }
      const sourceText = combineSourceText(request.materials);
      draft = generateDraftFromExtractedQuestions(genInput, allExtracted, sourceText);
    } else {
      const sourceText = combineSourceText(request.materials);
      if (!sourceText.trim()) {
        throw new AiBuilderError(
          "No usable extracted content — run OCR extraction or enter study material text manually",
          400
        );
      }
      genInput.sourceText = sourceText;
      draft = await generateAssessmentFromMaterial(genInput);
    }

    const targetMarks = blueprint?.totalMarks ?? request.totalMarks;
    const qualityChecks = runQualityChecks(draft, targetMarks, blueprint ?? undefined);
    const frameworkValidation = blueprint
      ? validateDraftAgainstBlueprint(draft, blueprint)
      : null;

    const combinedQuality = {
      ...qualityChecks,
      passed: qualityChecks.passed && (frameworkValidation?.passed ?? true),
      issues: [
        ...qualityChecks.issues,
        ...(frameworkValidation?.issues.map((i) => ({
          code: i.code,
          severity: i.severity,
          message: i.message,
          questionNumber: i.questionNumber,
        })) ?? []),
      ],
      frameworkValidation,
      blueprint: blueprint ?? undefined,
    };

    await prisma.aiAssessmentBuilderRequest.update({
      where: { id: requestId },
      data: {
        draftMetadata: draft as unknown as Prisma.InputJsonValue,
        qualityChecks: combinedQuality as unknown as Prisma.InputJsonValue,
        ...(blueprint ? { totalMarks: blueprint.totalMarks } : {}),
        status: "REVIEW",
      },
    });

    return { draft, qualityChecks: combinedQuality, blueprint };
  } catch (err) {
    await prisma.aiAssessmentBuilderRequest.update({
      where: { id: requestId },
      data: { status: "FAILED" },
    });
    if (err instanceof Error && !(err instanceof AiBuilderError)) {
      throw new AiBuilderError(err.message, 400);
    }
    throw err;
  }
}

export async function updateDraft(
  requestId: string,
  workspaceId: string,
  userId: string,
  draft: AiGeneratedDraft
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);
  assertEditable(request);

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  if (request.status !== "REVIEW" && request.status !== "GENERATING") {
    throw new AiBuilderError("Draft can only be edited in review stage", 400);
  }

  const qualityChecks = runQualityChecks(draft, request.totalMarks ?? draft.totalMarks);
  const frameworkText = resolveFrameworkText(request);
  let combinedQuality = qualityChecks;

  if (frameworkText) {
    const blueprint = buildBlueprintFromFramework(frameworkText);
    const frameworkValidation = validateDraftAgainstBlueprint(draft, blueprint);
    combinedQuality = {
      ...qualityChecks,
      passed: qualityChecks.passed && frameworkValidation.passed,
      issues: [
        ...qualityChecks.issues,
        ...frameworkValidation.issues.map((i) => ({
          code: i.code,
          severity: i.severity,
          message: i.message,
          questionNumber: i.questionNumber,
        })),
      ],
    };
  }

  await prisma.aiAssessmentBuilderRequest.update({
    where: { id: requestId },
    data: {
      draftMetadata: draft as unknown as Prisma.InputJsonValue,
      qualityChecks: combinedQuality as unknown as Prisma.InputJsonValue,
      status: "REVIEW",
    },
  });

  return { draft, qualityChecks: combinedQuality };
}

export async function approveBuilderRequest(
  requestId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);

  if (request.status !== "REVIEW") {
    throw new AiBuilderError("Request must be in REVIEW status to approve", 400);
  }

  if (request.assessmentId) {
    throw new AiBuilderError("This request has already been approved", 400);
  }

  if (request.createdById !== userId) {
    throw new AiBuilderError("Only the creator can approve this builder request", 403);
  }

  const draft = request.draftMetadata as unknown as AiGeneratedDraft | null;
  if (!draft?.questions?.length) {
    throw new AiBuilderError("No generated content to approve", 400);
  }

  const qualityChecks = runQualityChecks(draft, request.totalMarks!);
  if (!qualityChecks.passed) {
    throw new AiBuilderError(
      `Quality checks failed: ${qualityChecks.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`,
      400
    );
  }

  const [curriculum, phase, grade, subject] = await Promise.all([
    prisma.curriculum.findUnique({ where: { id: request.curriculumId! } }),
    prisma.phase.findUnique({ where: { id: request.phaseId! } }),
    prisma.grade.findUnique({ where: { id: request.gradeId! } }),
    prisma.subject.findUnique({ where: { id: request.subjectId! } }),
  ]);

  const description = [
    request.instructions,
    `AI Assessment Builder — generated from ${request.materials.length} study material(s).`,
    `Difficulty: ${request.difficulty}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const result = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: {
        workspaceId,
        title: request.title!,
        description,
        curriculumId: request.curriculumId!,
        phaseId: request.phaseId!,
        gradeId: request.gradeId!,
        subjectId: request.subjectId!,
        assessmentType: request.assessmentType!,
        term: request.term,
        totalMarks: request.totalMarks!,
        durationMinutes: request.durationMinutes,
        status: AssessmentStatus.DRAFT,
        creatorTeacherId: userId,
        aiMetadata: {
          aiBuilderRequestId: requestId,
          materialCount: request.materials.length,
          difficulty: request.difficulty,
          questionTypes: request.questionTypes,
          bloomLevels: request.bloomLevels,
          mock: draft.mock,
        },
      },
    });

    for (const [index, q] of draft.questions.entries()) {
      await tx.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          questionNumber: q.questionNumber,
          section: q.section ?? null,
          questionText: q.questionText,
          topic: q.section ?? null,
          marks: q.marks,
          cognitiveLevel: bloomLevelLabel(q.bloomLevel),
          difficulty: q.difficulty,
          expectedAnswer: q.memoAnswer,
          memoNotes: q.memoNotes ?? null,
          rubricNotes: q.rubric
            ? JSON.stringify(q.rubric.criteria)
            : null,
          orderIndex: index,
          analyticsMetadata: {
            questionType: q.questionType,
            bloomLevel: q.bloomLevel,
          },
        },
      });
    }

    const rubricQuestions = draft.questions.filter((q) => q.rubric?.criteria?.length);
    let rubricTemplateId: string | null = null;

    if (rubricQuestions.length > 0) {
      const totalRubricMarks = rubricQuestions.reduce((s, q) => s + q.marks, 0);
      const rubric = await tx.rubricTemplate.create({
        data: {
          workspaceId,
          name: `${request.title} — Rubric`,
          description: "Auto-generated rubric from AI Assessment Builder",
          subjectId: request.subjectId,
          scope: RubricTemplateScope.TEACHER_CREATED,
          status: RubricTemplateStatus.DRAFT,
          totalMarks: totalRubricMarks,
          createdById: userId,
        },
      });

      let orderIndex = 0;
      for (const q of rubricQuestions) {
        for (const c of q.rubric!.criteria) {
          await tx.rubricCriterion.create({
            data: {
              rubricTemplateId: rubric.id,
              name: `Q${q.questionNumber}: ${c.name}`,
              description: c.description,
              maxMarks: c.maxMarks,
              orderIndex: orderIndex++,
            },
          });
        }
      }

      await tx.assessment.update({
        where: { id: assessment.id },
        data: { rubricTemplateId: rubric.id },
      });

      rubricTemplateId = rubric.id;
    }

    await tx.aiAssessmentBuilderRequest.update({
      where: { id: requestId },
      data: {
        assessmentId: assessment.id,
        status: "APPROVED",
      },
    });

    return { assessment, rubricTemplateId, curriculum, phase, grade, subject };
  });

  const exportContext = {
    grade: result.grade?.name,
    subject: result.subject?.name,
    term: request.term ?? undefined,
  };

  const pdfTypes: { type: ExportType; docType: PaperDocumentType; name: string }[] = [
    { type: "question-paper", docType: "QUESTION_PAPER", name: "Question Paper" },
    { type: "memorandum", docType: "MEMORANDUM", name: "Memorandum" },
    { type: "rubric", docType: "RUBRIC_ATTACHMENT", name: "Rubric" },
  ];

  for (const { type, docType, name } of pdfTypes) {
    if (type === "rubric" && !draft.questions.some((q) => q.rubric?.criteria?.length)) {
      continue;
    }

    const buffer = await generateAiAssessmentPdf(draft, request.title!, type, exportContext);
    const vaultFile: UploadedVaultFile = {
      originalname: `${request.title} — ${name}.pdf`,
      mimetype: "application/pdf",
      size: buffer.length,
      buffer,
    };

    await uploadPaperVaultDocument(
      result.assessment.id,
      workspaceId,
      userId,
      access,
      { documentType: docType, file: vaultFile }
    );
  }

  return result;
}

export async function exportBuilderPdf(
  requestId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  exportType: ExportType
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);

  assertCanView(request, userId, access, workspaceId);

  const draft = request.draftMetadata as unknown as AiGeneratedDraft | null;
  if (!draft) throw new AiBuilderError("No generated content to export", 400);

  const qualityData = request.qualityChecks as {
    passed?: boolean;
    issues?: { severity: string; message: string }[];
  } | null;

  if (qualityData && qualityData.passed === false) {
    const errors = (qualityData.issues ?? [])
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    throw new AiBuilderError(
      `Cannot export — validation failed: ${errors || "Framework or quality checks failed"}`,
      400
    );
  }

  const frameworkText = resolveFrameworkText(request);
  if (frameworkText) {
    const blueprint = buildBlueprintFromFramework(frameworkText);
    const validation = validateDraftAgainstBlueprint(draft, blueprint);
    if (!validation.passed) {
      throw new AiBuilderError(
        `Cannot export — framework validation failed: ${validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ")}`,
        400
      );
    }
  }

  const [grade, subject] = await Promise.all([
    request.gradeId
      ? prisma.grade.findUnique({ where: { id: request.gradeId }, select: { name: true } })
      : null,
    request.subjectId
      ? prisma.subject.findUnique({ where: { id: request.subjectId }, select: { name: true } })
      : null,
  ]);

  const buffer = await generateAiAssessmentPdf(
    draft,
    request.title ?? "Assessment",
    exportType,
    { grade: grade?.name, subject: subject?.name, term: request.term ?? undefined }
  );

  const filename = `${request.title ?? "assessment"}-${exportType}.pdf`;
  return { buffer, filename, mimeType: "application/pdf" };
}

export async function getBlueprintPreview(
  requestId: string,
  workspaceId: string,
  userId: string,
  access: UserAccessContext
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);

  assertCanView(request, userId, access, workspaceId);

  const frameworkText = resolveFrameworkText(request);
  if (!frameworkText) {
    throw new AiBuilderError("No assessment framework uploaded or extracted", 400);
  }

  return buildBlueprintFromFramework(frameworkText);
}

export async function discardBuilderRequest(
  requestId: string,
  workspaceId: string,
  userId: string
) {
  const request = await loadBuilderRequest(requestId, workspaceId);
  if (!request) throw new AiBuilderError("Builder request not found", 404);

  if (request.assessmentId) {
    throw new AiBuilderError("Cannot discard an approved builder request", 400);
  }

  if (request.createdById !== userId) {
    throw new AiBuilderError("Not permitted", 403);
  }

  const dir = materialUploadDir(workspaceId, requestId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await prisma.aiAssessmentBuilderRequest.delete({ where: { id: requestId } });
  return { ok: true };
}

function serializeMaterial(material: {
  id: string;
  fileType: AiMaterialType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadPurpose: AiUploadPurpose;
  extractionStatus: string;
  extractedText: string | null;
  manualText: string | null;
  ocrAttempted: boolean;
  ocrConfidence: number | null;
  extractedQuestions: unknown;
  duplicateWarnings: unknown;
  createdAt: Date;
}) {
  return {
    id: material.id,
    fileType: material.fileType,
    fileName: material.fileName,
    mimeType: material.mimeType,
    fileSize: material.fileSize,
    uploadPurpose: material.uploadPurpose,
    extractionStatus: material.extractionStatus,
    extractedText: material.extractedText,
    manualText: material.manualText,
    effectiveText: resolveMaterialText(material),
    ocrAttempted: material.ocrAttempted,
    ocrConfidence: material.ocrConfidence,
    extractedQuestions: (material.extractedQuestions as ExtractedPaperQuestion[] | null) ?? [],
    duplicateWarnings: (material.duplicateWarnings as DuplicateCheckResult[] | null) ?? [],
    createdAt: material.createdAt.toISOString(),
  };
}

export async function serializeBuilderRequest(request: LoadedRequest) {
  const draft = request.draftMetadata as unknown as AiGeneratedDraft | null;
  const qualityChecks = request.qualityChecks;

  const [curriculum, phase, grade, subject] = await Promise.all([
    request.curriculumId
      ? prisma.curriculum.findUnique({
          where: { id: request.curriculumId },
          select: { id: true, code: true, name: true },
        })
      : null,
    request.phaseId
      ? prisma.phase.findUnique({
          where: { id: request.phaseId },
          select: { id: true, code: true, name: true },
        })
      : null,
    request.gradeId
      ? prisma.grade.findUnique({
          where: { id: request.gradeId },
          select: { id: true, code: true, name: true },
        })
      : null,
    request.subjectId
      ? prisma.subject.findUnique({
          where: { id: request.subjectId },
          select: { id: true, code: true, name: true },
        })
      : null,
  ]);

  return {
    id: request.id,
    workspaceId: request.workspaceId,
    status: request.status,
    curriculumId: request.curriculumId,
    phaseId: request.phaseId,
    gradeId: request.gradeId,
    subjectId: request.subjectId,
    assessmentType: request.assessmentType,
    title: request.title,
    term: request.term,
    totalMarks: request.totalMarks,
    durationMinutes: request.durationMinutes,
    difficulty: request.difficulty,
    questionTypes: request.questionTypes,
    bloomLevels: request.bloomLevels,
    instructions: request.instructions,
    draft,
    qualityChecks,
    sourceMode: request.sourceMode,
    selectedQuestionBankIds: (request.selectedQuestionBankIds as string[] | null) ?? [],
    frameworkText: request.frameworkText,
    assessmentId: request.assessmentId,
    assessment: request.assessment,
    curriculum,
    phase,
    grade,
    subject,
    materials: request.materials.map(serializeMaterial),
    createdBy: request.createdBy,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}
