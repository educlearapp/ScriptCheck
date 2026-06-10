import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import type { AnnotationData, ScriptLayerDetail } from "../types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;
const SAVED_DISPLAY_MS = 2000;

export function useDebouncedLayerSave(
  scriptId: string,
  onLayerSaved: (layer: ScriptLayerDetail) => void
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<Map<string, AnnotationData>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const flushLayer = useCallback(
    async (layerType: string, data: AnnotationData) => {
      if (inFlight.current.has(layerType)) {
        pending.current.set(layerType, data);
        return;
      }

      inFlight.current.add(layerType);
      setStatus("saving");
      setErrorMessage("");

      try {
        const updated = await apiFetch<ScriptLayerDetail>(
          `/scripts/${scriptId}/layers/${layerType}`,
          {
            method: "PUT",
            body: JSON.stringify({ annotationData: data }),
          }
        );
        onLayerSaved(updated);

        if (pending.current.has(layerType)) {
          const next = pending.current.get(layerType)!;
          pending.current.delete(layerType);
          inFlight.current.delete(layerType);
          await flushLayer(layerType, next);
          return;
        }

        setStatus("saved");
        const t = setTimeout(() => setStatus("idle"), SAVED_DISPLAY_MS);
        timers.current.push(t);
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Save failed");
      } finally {
        inFlight.current.delete(layerType);
      }
    },
    [scriptId, onLayerSaved]
  );

  const scheduleSave = useCallback(
    (layerType: string, data: AnnotationData) => {
      clearTimers();
      const t = setTimeout(() => {
        void flushLayer(layerType, data);
      }, DEBOUNCE_MS);
      timers.current.push(t);
    },
    [flushLayer]
  );

  const saveNow = useCallback(
    (layerType: string, data: AnnotationData) => {
      clearTimers();
      void flushLayer(layerType, data);
    },
    [flushLayer]
  );

  return { status, errorMessage, scheduleSave, saveNow };
}
