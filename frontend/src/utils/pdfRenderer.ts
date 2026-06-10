import * as pdfjs from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type PdfDocCache = {
  data: ArrayBuffer;
  doc: pdfjs.PDFDocumentProxy;
};

const pdfCache = new Map<string, PdfDocCache>();
const renderCache = new Map<string, string>();

function cacheKey(fileKey: string, pageIndex: number, scale: number) {
  return `${fileKey}:${pageIndex}:${scale.toFixed(3)}`;
}

export async function loadPdfDocument(
  fileKey: string,
  data: ArrayBuffer
): Promise<pdfjs.PDFDocumentProxy> {
  const cached = pdfCache.get(fileKey);
  if (cached && cached.data.byteLength === data.byteLength) {
    return cached.doc;
  }

  const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
  const doc = await loadingTask.promise;
  pdfCache.set(fileKey, { data, doc });
  return doc;
}

export async function renderPdfPageToDataUrl(
  fileKey: string,
  data: ArrayBuffer,
  pageIndex: number,
  scale: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const key = cacheKey(fileKey, pageIndex, scale);
  const cached = renderCache.get(key);
  if (cached) {
    const doc = await loadPdfDocument(fileKey, data);
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale });
    return { dataUrl: cached, width: viewport.width, height: viewport.height };
  }

  const doc = await loadPdfDocument(fileKey, data);
  const page = await doc.getPage(pageIndex);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  renderCache.set(key, dataUrl);

  return { dataUrl, width: viewport.width, height: viewport.height };
}

export function clearPdfCache(fileKey?: string) {
  if (fileKey) {
    pdfCache.delete(fileKey);
    for (const key of renderCache.keys()) {
      if (key.startsWith(`${fileKey}:`)) renderCache.delete(key);
    }
  } else {
    pdfCache.clear();
    renderCache.clear();
  }
}

import { getAuthToken } from "../auth/session";
import { API_URL } from "../api";

export async function fetchPageBytes(
  scriptId: string,
  pageId: string
): Promise<ArrayBuffer> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/scripts/${scriptId}/pages/${pageId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to load page file (${res.status})`);
  return res.arrayBuffer();
}
