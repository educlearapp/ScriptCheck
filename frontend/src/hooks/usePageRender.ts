import { useEffect, useState } from "react";
import { apiBlobUrl } from "../api";
import type { ScriptPageInfo } from "../types";
import {
  fetchPageBytes,
  renderPdfPageToDataUrl,
} from "../utils/pdfRenderer";
import { formatPdfRenderError } from "../utils/pdfRenderErrors";

type RenderState = {
  src: string | null;
  width: number;
  height: number;
  loading: boolean;
  error: string | null;
};

export function usePageRender(
  scriptId: string,
  page: ScriptPageInfo | null,
  scale: number,
  thumbMode = false
): RenderState {
  const [state, setState] = useState<RenderState>({
    src: null,
    width: page?.width ?? 800,
    height: page?.height ?? 1100,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;

    if (!page) {
      setState({ src: null, width: 800, height: 1100, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const run = async () => {
      try {
        if (page.mimeType === "application/pdf") {
          const pageIndex = page.sourcePageIndex ?? 1;
          const bytes = await fetchPageBytes(scriptId, page.id);
          if (revoked) return;

          const renderScale = thumbMode ? 0.15 : scale;
          const fileKey = `${scriptId}-${page.id}-${page.fileName}`;
          const { dataUrl, width, height } = await renderPdfPageToDataUrl(
            fileKey,
            bytes,
            pageIndex,
            renderScale
          );
          if (revoked) return;

          const baseWidth = thumbMode
            ? width / renderScale
            : page.width ?? width / scale;
          const baseHeight = thumbMode
            ? height / renderScale
            : page.height ?? height / scale;

          setState({
            src: dataUrl,
            width: baseWidth,
            height: baseHeight,
            loading: false,
            error: null,
          });
        } else {
          blobUrl = await apiBlobUrl(`/scripts/${scriptId}/pages/${page.id}/file`);
          if (revoked) {
            URL.revokeObjectURL(blobUrl);
            return;
          }

          if (thumbMode) {
            setState({
              src: blobUrl,
              width: page.width ?? 800,
              height: page.height ?? 1100,
              loading: false,
              error: null,
            });
          } else {
            const img = new Image();
            img.onload = () => {
              if (revoked) return;
              setState({
                src: blobUrl,
                width: page.width ?? img.naturalWidth,
                height: page.height ?? img.naturalHeight,
                loading: false,
                error: null,
              });
            };
            img.onerror = () => {
              if (!revoked) setState((s) => ({ ...s, loading: false, error: "Image load failed" }));
            };
            img.src = blobUrl;
          }
        }
      } catch (err) {
        if (!revoked) {
          setState((s) => ({
            ...s,
            loading: false,
            error: formatPdfRenderError(err),
          }));
        }
      }
    };

    void run();

    return () => {
      revoked = true;
      if (blobUrl && page.mimeType !== "application/pdf") {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [scriptId, page?.id, page?.mimeType, page?.sourcePageIndex, page?.width, page?.height, scale, thumbMode]);

  return state;
}
