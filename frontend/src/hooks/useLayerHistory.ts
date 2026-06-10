import { useCallback, useRef, useState } from "react";
import type { AnnotationData } from "../types";

const MAX_HISTORY = 50;

function cloneData(data: AnnotationData): AnnotationData {
  return JSON.parse(JSON.stringify(data)) as AnnotationData;
}

export function useLayerHistory(layerType: string | null) {
  const undoStacks = useRef<Map<string, AnnotationData[]>>(new Map());
  const redoStacks = useRef<Map<string, AnnotationData[]>>(new Map());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback((type: string) => {
    setCanUndo((undoStacks.current.get(type)?.length ?? 0) > 0);
    setCanRedo((redoStacks.current.get(type)?.length ?? 0) > 0);
  }, []);

  const pushHistory = useCallback(
    (type: string, previous: AnnotationData) => {
      const stack = undoStacks.current.get(type) ?? [];
      stack.push(cloneData(previous));
      if (stack.length > MAX_HISTORY) stack.shift();
      undoStacks.current.set(type, stack);
      redoStacks.current.set(type, []);
      syncFlags(type);
    },
    [syncFlags]
  );

  const undo = useCallback(
    (type: string, current: AnnotationData): AnnotationData | null => {
      const stack = undoStacks.current.get(type);
      if (!stack?.length) return null;

      const previous = stack.pop()!;
      undoStacks.current.set(type, stack);

      const redo = redoStacks.current.get(type) ?? [];
      redo.push(cloneData(current));
      redoStacks.current.set(type, redo);

      syncFlags(type);
      return previous;
    },
    [syncFlags]
  );

  const redo = useCallback(
    (type: string, current: AnnotationData): AnnotationData | null => {
      const stack = redoStacks.current.get(type);
      if (!stack?.length) return null;

      const next = stack.pop()!;
      redoStacks.current.set(type, stack);

      const undo = undoStacks.current.get(type) ?? [];
      undo.push(cloneData(current));
      undoStacks.current.set(type, undo);

      syncFlags(type);
      return next;
    },
    [syncFlags]
  );

  const resetHistory = useCallback((type: string) => {
    undoStacks.current.set(type, []);
    redoStacks.current.set(type, []);
    if (type === layerType) {
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [layerType]);

  return {
    canUndo: layerType ? canUndo : false,
    canRedo: layerType ? canRedo : false,
    pushHistory,
    undo,
    redo,
    resetHistory,
  };
}
