import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import sizeOf from "image-size";
import { LearnerScriptStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function scriptUploadDir(workspaceId: string, scriptId: string) {
  return path.join(UPLOAD_ROOT, workspaceId, scriptId);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function loadScript(scriptId: string, workspaceId: string) {
  const script = await prisma.learnerScript.findFirst({
    where: { id: scriptId, batch: { workspaceId } },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!script) throw new ScriptError("Learner script not found", 404);
  return script;
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    const dims = sizeOf(buffer);
    if (dims.width && dims.height) {
      return { width: dims.width, height: dims.height };
    }
  } catch {
    // ignore
  }
  return null;
}

async function getPdfPageInfo(buffer: Buffer) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const pages: { width: number; height: number }[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    pages.push({ width: Math.round(width), height: Math.round(height) });
  }

  return { pageCount, pages };
}

function withSourcePageIndex(
  pages: Array<{
    id: string;
    pageNumber: number;
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    width: number | null;
    height: number | null;
    uploadedAt: Date;
  }>
) {
  const pdfGroups = new Map<string, typeof pages>();
  for (const page of pages) {
    if (page.mimeType === "application/pdf") {
      const group = pdfGroups.get(page.filePath) ?? [];
      group.push(page);
      pdfGroups.set(page.filePath, group);
    }
  }

  const sourceIndexById = new Map<string, number>();
  for (const group of pdfGroups.values()) {
    group.sort((a, b) => a.pageNumber - b.pageNumber);
    group.forEach((page, index) => {
      sourceIndexById.set(page.id, index + 1);
    });
  }

  return pages.map((p) => ({
    id: p.id,
    pageNumber: p.pageNumber,
    fileName: p.fileName,
    mimeType: p.mimeType,
    fileSize: p.fileSize,
    width: p.width,
    height: p.height,
    uploadedAt: p.uploadedAt,
    sourcePageIndex: sourceIndexById.get(p.id) ?? null,
  }));
}

export async function listScriptPages(scriptId: string, workspaceId: string) {
  const script = await loadScript(scriptId, workspaceId);
  return withSourcePageIndex(script.pages);
}

export async function uploadScriptPages(
  scriptId: string,
  workspaceId: string,
  userId: string,
  files: UploadedFile[]
) {
  if (!files.length) throw new ScriptError("No files provided", 400);

  const script = await loadScript(scriptId, workspaceId);
  const uploadDir = scriptUploadDir(workspaceId, scriptId);
  ensureDir(uploadDir);

  const existingMaxPage = script.pages.reduce((max, p) => Math.max(max, p.pageNumber), 0);
  let nextPageNumber = existingMaxPage + 1;
  const createdPageIds: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new ScriptError(`File ${file.originalname} exceeds 25 MB limit`, 400);
    }

    const mimeType = file.mimetype.toLowerCase();
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    const allowedExt = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
    if (!ALLOWED_MIME_TYPES.has(mimeType) && !allowedExt.has(ext)) {
      throw new ScriptError(
        `"${file.originalname}" is not supported. Upload PDF, JPG, or PNG files only.`,
        400
      );
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadDir, storedName);
    fs.writeFileSync(filePath, file.buffer);

    if (mimeType === "application/pdf") {
      const { pageCount, pages } = await getPdfPageInfo(file.buffer);

      for (let i = 0; i < pageCount; i++) {
        const page = await prisma.scriptPage.create({
          data: {
            learnerScriptId: scriptId,
            pageNumber: nextPageNumber,
            fileName: `${safeName} (page ${i + 1})`,
            filePath,
            mimeType,
            fileSize: file.size,
            width: pages[i]?.width ?? null,
            height: pages[i]?.height ?? null,
            uploadedById: userId,
          },
        });
        createdPageIds.push(page.id);
        nextPageNumber++;
      }
    } else {
      const dims = getImageDimensions(file.buffer);
      const page = await prisma.scriptPage.create({
        data: {
          learnerScriptId: scriptId,
          pageNumber: nextPageNumber,
          fileName: safeName,
          filePath,
          mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType,
          fileSize: file.size,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          uploadedById: userId,
        },
      });
      createdPageIds.push(page.id);
      nextPageNumber++;
    }
  }

  const totalPages = await prisma.scriptPage.count({
    where: { learnerScriptId: scriptId },
  });

  const scriptBefore = await prisma.learnerScript.findUnique({
    where: { id: scriptId },
    select: { status: true },
  });

  const preUploadStatuses: LearnerScriptStatus[] = [
    LearnerScriptStatus.NOT_MARKED,
    LearnerScriptStatus.IN_PROGRESS,
  ];

  await prisma.learnerScript.update({
    where: { id: scriptId },
    data: {
      pageCount: totalPages,
      ...(scriptBefore && preUploadStatuses.includes(scriptBefore.status)
        ? { status: LearnerScriptStatus.UPLOADED }
        : {}),
    },
  });

  const batchPageSum = await prisma.learnerScript.aggregate({
    where: { batchId: script.batchId },
    _sum: { pageCount: true },
  });

  await prisma.scriptBatch.update({
    where: { id: script.batchId },
    data: { totalPages: batchPageSum._sum.pageCount ?? 0 },
  });

  const allPages = await listScriptPages(scriptId, workspaceId);
  const createdIdSet = new Set(createdPageIds);

  return {
    pages: allPages.filter((p) => createdIdSet.has(p.id)),
    pageCount: totalPages,
  };
}

export async function getScriptPageFile(
  scriptId: string,
  pageId: string,
  workspaceId: string
) {
  const page = await prisma.scriptPage.findFirst({
    where: {
      id: pageId,
      learnerScriptId: scriptId,
      learnerScript: { batch: { workspaceId } },
    },
  });

  if (!page) throw new ScriptError("Script page not found", 404);

  if (!fs.existsSync(page.filePath)) {
    throw new ScriptError("Page file missing on server", 404);
  }

  let sourcePageIndex: number | null = null;
  if (page.mimeType === "application/pdf") {
    const siblings = await prisma.scriptPage.findMany({
      where: { learnerScriptId: scriptId, filePath: page.filePath },
      orderBy: { pageNumber: "asc" },
      select: { id: true },
    });
    const idx = siblings.findIndex((s) => s.id === page.id);
    sourcePageIndex = idx >= 0 ? idx + 1 : 1;
  }

  return {
    filePath: page.filePath,
    mimeType: page.mimeType,
    fileName: page.fileName,
    pageNumber: page.pageNumber,
    sourcePageIndex,
    width: page.width,
    height: page.height,
  };
}
