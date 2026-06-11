import { PaperDocumentType } from "@prisma/client";
import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";
import { getLearnerScriptStatusLabel } from "../utils/statusLabels";

export type AssessmentFileEntry = {
  id: string;
  category: "assessment" | "script";
  fileType: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: string;
  scriptNumber?: string;
  learnerName?: string;
};

const DOC_TYPE_LABELS: Record<PaperDocumentType, string> = {
  QUESTION_PAPER: "Question Paper",
  MEMORANDUM: "Memorandum",
  MARKING_GUIDELINE: "Marking Guideline",
  RUBRIC_ATTACHMENT: "Rubric",
  SUPPORTING_MATERIAL: "Supporting Document",
};

export async function listAssessmentFiles(
  assessmentId: string,
  workspaceId: string
): Promise<{
  assessmentFiles: AssessmentFileEntry[];
  scriptFiles: AssessmentFileEntry[];
}> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: { id: true },
  });
  if (!assessment) throw new ScriptError("Assessment not found", 404);

  const [vaultDocs, scriptPages] = await Promise.all([
    prisma.paperVaultDocument.findMany({
      where: { assessmentId, isCurrentVersion: true },
      include: { uploadedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.scriptPage.findMany({
      where: {
        learnerScript: { assessmentId },
      },
      include: {
        uploadedBy: { select: { fullName: true } },
        learnerScript: {
          include: { learner: true },
        },
      },
      orderBy: [{ learnerScript: { scriptNumber: "asc" } }, { pageNumber: "asc" }],
    }),
  ]);

  const assessmentFiles: AssessmentFileEntry[] = vaultDocs.map((doc) => ({
    id: doc.id,
    category: "assessment",
    fileType: DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType,
    fileName: doc.fileName,
    uploadedBy: doc.uploadedBy.fullName,
    uploadedAt: doc.createdAt.toISOString(),
    status: doc.status.replaceAll("_", " "),
  }));

  const scriptFileMap = new Map<string, AssessmentFileEntry>();

  for (const page of scriptPages) {
    const key = `${page.learnerScriptId}-${page.filePath}`;
    if (!scriptFileMap.has(key)) {
      const script = page.learnerScript;
      scriptFileMap.set(key, {
        id: page.id,
        category: "script",
        fileType: "Learner Script",
        fileName: page.fileName,
        uploadedBy: page.uploadedBy?.fullName ?? "—",
        uploadedAt: page.uploadedAt.toISOString(),
        status: getLearnerScriptStatusLabel(script.status),
        scriptNumber: script.scriptNumber,
        learnerName: `${script.learner.firstName} ${script.learner.lastName}`,
      });
    }
  }

  const scriptFiles = Array.from(scriptFileMap.values());

  return { assessmentFiles, scriptFiles };
}
