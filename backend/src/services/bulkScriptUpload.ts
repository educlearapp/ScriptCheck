import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { LearnerScriptStatus, ScriptBatchStatus } from "@prisma/client";
import { prisma } from "../prisma";
import {
  createLearner,
  ScriptError,
} from "./scriptMarking";
import { createDefaultLayersForScript, initQuestionMarksForScript } from "./bulkScriptHelpers";
import { ensureRubricMarksForScript } from "./rubricMarking";

import { MAX_BULK_SCRIPT_FILE_SIZE, MAX_UPLOAD_FILES } from "../config/uploadLimits";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = MAX_BULK_SCRIPT_FILE_SIZE;

export type BulkUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type ExtractedPage = {
  buffer: Buffer;
  width: number;
  height: number;
  sourceName: string;
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

async function extractPagesFromPdf(buffer: Buffer, sourceName: string): Promise<ExtractedPage[]> {
  const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = sourcePdf.getPageCount();
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const singlePdf = await PDFDocument.create();
    const [copied] = await singlePdf.copyPages(sourcePdf, [i]);
    singlePdf.addPage(copied);
    const { width, height } = copied.getSize();
    const pageBuffer = Buffer.from(await singlePdf.save());
    pages.push({
      buffer: pageBuffer,
      width: Math.round(width),
      height: Math.round(height),
      sourceName,
    });
  }

  return pages;
}

async function collectAllPages(files: BulkUploadFile[]): Promise<ExtractedPage[]> {
  const allPages: ExtractedPage[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new ScriptError(`File ${file.originalname} exceeds 50 MB limit`, 400);
    }

    const mime = file.mimetype.toLowerCase();
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));

    if (mime === "application/pdf" || ext === ".pdf") {
      const pages = await extractPagesFromPdf(file.buffer, file.originalname);
      allPages.push(...pages);
    } else if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png" || [".jpg", ".jpeg", ".png"].includes(ext)) {
      allPages.push({
        buffer: file.buffer,
        width: 0,
        height: 0,
        sourceName: file.originalname,
      });
    } else {
      throw new ScriptError(
        `"${file.originalname}" is not supported. Upload PDF or image files only.`,
        400
      );
    }
  }

  return allPages;
}

export async function bulkUploadScripts(
  batchId: string,
  workspaceId: string,
  userId: string,
  files: BulkUploadFile[]
) {
  if (!files.length) throw new ScriptError("No files provided", 400);
  if (files.length > MAX_UPLOAD_FILES) {
    throw new ScriptError(`Maximum ${MAX_UPLOAD_FILES} files allowed per upload`, 400);
  }

  const batch = await prisma.scriptBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          gradeId: true,
          pagesPerScript: true,
          setupComplete: true,
        },
      },
      learnerScripts: true,
    },
  });

  if (!batch) throw new ScriptError("Script batch not found", 404);

  if (
    batch.status !== ScriptBatchStatus.DRAFT &&
    batch.status !== ScriptBatchStatus.MARKING &&
    batch.status !== ScriptBatchStatus.RETURNED_TO_TEACHER
  ) {
    throw new ScriptError("Cannot upload scripts to batch in current status", 400);
  }

  const pagesPerScript = batch.assessment.pagesPerScript;
  if (!pagesPerScript || pagesPerScript < 1) {
    throw new ScriptError(
      "Assessment setup required: set pages per script before bulk upload",
      400
    );
  }

  const allPages = await collectAllPages(files);
  if (allPages.length === 0) {
    throw new ScriptError("No pages found in uploaded files", 400);
  }

  const scriptCount = Math.ceil(allPages.length / pagesPerScript);
  const startingScriptNumber = batch.learnerScripts.length;
  const createdScripts: string[] = [];

  for (let s = 0; s < scriptCount; s++) {
    const scriptIndex = startingScriptNumber + s + 1;
    const learnerNumber = `BULK-${batchId.slice(0, 8)}-${scriptIndex}`;
    const learner = await createLearner(workspaceId, {
      learnerNumber,
      firstName: "Learner",
      lastName: `Script ${scriptIndex}`,
      gradeId: batch.assessment.gradeId,
    });

    const script = await prisma.learnerScript.create({
      data: {
        batchId,
        learnerId: learner.id,
        assessmentId: batch.assessmentId,
        scriptNumber: String(scriptIndex),
        pageCount: 0,
        status: LearnerScriptStatus.NOT_MARKED,
      },
    });

    await createDefaultLayersForScript(script.id, userId);

    const assessmentMeta = await prisma.assessment.findUnique({
      where: { id: batch.assessmentId },
      select: { rubricTemplateId: true },
    });
    if (assessmentMeta?.rubricTemplateId) {
      await ensureRubricMarksForScript(script.id, assessmentMeta.rubricTemplateId);
    } else {
      await initQuestionMarksForScript(script.id, batch.assessmentId);
    }

    const pageSlice = allPages.slice(s * pagesPerScript, (s + 1) * pagesPerScript);
    const uploadDir = path.join(UPLOAD_ROOT, workspaceId, script.id);
    ensureDir(uploadDir);

    let pageNumber = 1;
    for (const page of pageSlice) {
      const storedName = `${Date.now()}-page-${pageNumber}.pdf`;
      const filePath = path.join(uploadDir, storedName);
      fs.writeFileSync(filePath, page.buffer);

      await prisma.scriptPage.create({
        data: {
          learnerScriptId: script.id,
          pageNumber,
          fileName: `${page.sourceName} (page ${pageNumber})`,
          filePath,
          mimeType: "application/pdf",
          fileSize: page.buffer.length,
          width: page.width || null,
          height: page.height || null,
          uploadedById: userId,
        },
      });
      pageNumber++;
    }

    const actualPageCount = pageSlice.length;
    await prisma.learnerScript.update({
      where: { id: script.id },
      data: {
        pageCount: actualPageCount,
        status:
          actualPageCount >= pagesPerScript
            ? LearnerScriptStatus.UPLOADED
            : LearnerScriptStatus.NOT_MARKED,
      },
    });

    createdScripts.push(script.id);
  }

  const totalScripts = await prisma.learnerScript.count({ where: { batchId } });
  const totalPages = await prisma.learnerScript.aggregate({
    where: { batchId },
    _sum: { pageCount: true },
  });

  await prisma.scriptBatch.update({
    where: { id: batchId },
    data: {
      totalScripts,
      totalPages: totalPages._sum.pageCount ?? 0,
      totalLearners: totalScripts,
      status:
        batch.status === ScriptBatchStatus.DRAFT
          ? ScriptBatchStatus.MARKING
          : batch.status,
    },
  });

  return {
    batchId,
    totalPagesUploaded: allPages.length,
    pagesPerScript,
    scriptsCreated: createdScripts.length,
    scriptIds: createdScripts,
  };
}
