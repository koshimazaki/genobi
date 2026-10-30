import { useCallback, useEffect, useRef, useState } from "react";
import { FrameSource } from "./frame-source";
import { clampFrame } from "./frame-math";

export function useFrameSlot() {
  const [source, setSource] = useState<FrameSource | null>(null);
  const [selected, setSelected] = useState(0);
  const [shown, setShown] = useState<{
    index: number;
    canvas: HTMLCanvasElement;
  } | null>(null);
  const [status, setStatus] = useState("Drop a video to begin");
  const [error, setError] = useState("");
  const current = useRef<FrameSource | null>(null);
  const controller = useRef<AbortController | null>(null);
  const wanted = useRef(0);
  const running = useRef(false);
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    current.current?.dispose();
    current.current = null;
    setSource(null);
    setShown(null);
    setSelected(0);
    setError("");
    setStatus("Drop a video to begin");
  }, []);

  const render = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (current.current) {
        const engine = current.current,
          index = wanted.current,
          version = generation.current;
        try {
          const canvas = await engine.decode(index);
          if (version === generation.current && index === wanted.current) {
            setShown({ index, canvas });
            setStatus("Frame ready");
            break;
          }
        } catch (error) {
          if (version === generation.current && index === wanted.current) {
            setShown(null);
            setError(
              error instanceof Error ? error.message : "Frame decoding failed.",
            );
            setStatus("Decode failed");
            break;
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  const seek = useCallback(
    (index: number) => {
      if (!current.current) return;
      wanted.current = clampFrame(index, current.current.frames.length);
      setSelected(wanted.current);
      setError("");
      setStatus("Decoding frame…");
      void render();
    },
    [render],
  );

  const load = useCallback(
    async (file: File, initialFrame = 0) => {
      clear();
      const version = generation.current;
      const abort = new AbortController();
      controller.current = abort;
      setStatus("Indexing video frames…");
      try {
        const engine = await FrameSource.open(file, abort.signal, (count) => {
          if (version === generation.current)
            setStatus(`Indexing ${count.toLocaleString()} frames…`);
        });
        if (version !== generation.current) {
          engine.dispose();
          return;
        }
        current.current = engine;
        setSource(engine);
        wanted.current = 0;
        seek(initialFrame);
      } catch (error) {
        if (version !== generation.current) return;
        setError(
          error instanceof Error
            ? error.message
            : "This video could not be opened.",
        );
        setStatus("Could not open video");
      }
    },
    [clear, seek],
  );

  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      current.current?.dispose();
      current.current = null;
    },
    [],
  );

  return {
    source,
    selected,
    shown,
    status,
    error,
    load,
    seek,
    clear,
    ready:
      !!source &&
      !!shown &&
      shown.index === selected &&
      status === "Frame ready",
  };
}
export type FrameSlot = ReturnType<typeof useFrameSlot>;
