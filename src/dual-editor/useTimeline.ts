import { useCallback, useEffect, useRef, useState } from "react";
import { FrameSource } from "./frame-source";
import {
  boundary,
  duration,
  sourceFrame,
  validateEdit,
  type EditClip,
  type Lane,
} from "./timeline-model";
import type { TimelineSource } from "./timeline-export";

export function useTimeline() {
  const [sources, setSources] = useState(new Map<string, TimelineSource>());
  const [history, setHistory] = useState<EditClip[][]>([[]]);
  const [selected, select] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const clips = history.at(-1)!;
  const owned = useRef(new Map<string, TimelineSource>()),
    lock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const source of owned.current.values()) {
        source.engine.dispose();
        URL.revokeObjectURL(source.url);
      }
      owned.current.clear();
    },
    [],
  );
  const timing = new Map([...sources].map(([id, s]) => [id, s.engine]));
  function commit(next: EditClip[]) {
    try {
      if (next.length) validateEdit(next, timing);
      setHistory((h) => [...h.slice(-39), next]);
      setMessage("");
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    }
  }
  function update(id: string, patch: Partial<EditClip>) {
    return commit(clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  async function add(file: File, lane: Lane) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("Reading clip…");
    const controller = new AbortController();
    abort.current = controller;
    let engine: FrameSource | undefined;
    try {
      const existing = [...owned.current.values()].find((s) => s.file === file);
      if (!existing && owned.current.size >= 20)
        throw new Error(
          "The timeline holds 20 source files. Reload after exporting to start a new edit.",
        );
      engine =
        existing?.engine ??
        (await FrameSource.open(file, controller.signal, () => {}));
      if (engine.codec === "image")
        throw new Error("Use images in Frames; add a video to the timeline.");
      const id = existing?.id ?? crypto.randomUUID();
      const nextSources = new Map(sources);
      let source = existing;
      if (!source) {
        const strip = document.createElement("canvas");
        strip.width = 360;
        strip.height = 68;
        const context = strip.getContext("2d")!;
        for (let i = 0; i < 3; i++) {
          const image = await engine.decode(
            Math.floor(((engine.frames.length - 1) * i) / 2),
          );
          context.drawImage(image, i * 120, 0, 120, 68);
        }
        const thumb = strip.toDataURL("image/jpeg", 0.65);
        source = { id, file, engine, url: URL.createObjectURL(file), thumb };
      }
      nextSources.set(id, source);
      const nextTiming = new Map(
        [...nextSources].map(([key, s]) => [key, s.engine]),
      );
      const start = duration(clips, nextTiming),
        room = 120 - start;
      if (room <= 0)
        throw new Error(
          "The two-minute timeline is full. Shorten or remove a section first.",
        );
      let out = engine.frames.length;
      const first = boundary(engine, 0);
      while (out > 1 && boundary(engine, out) - first > room) out--;
      const clip: EditClip = {
        id: crypto.randomUUID(),
        source: id,
        lane,
        start,
        in: 0,
        out,
        muted: false,
      };
      validateEdit([...clips, clip], nextTiming);
      owned.current.set(id, source);
      setSources(nextSources);
      setHistory((h) => [...h.slice(-39), [...clips, clip]]);
      select(clip.id);
      setMessage(
        out < engine.frames.length
          ? "Added the portion that fits within two minutes. Adjust source In / Out below."
          : "Clip appended. Split at the playhead, or trim the source frames below.",
      );
    } catch (error) {
      if (
        engine &&
        ![...owned.current.values()].some((s) => s.engine === engine)
      )
        engine.dispose();
      if (!controller.signal.aborted) setMessage((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const undo = useCallback(
    () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)),
    [],
  );
  function trimAt(time: number, edge: "in" | "out") {
    const c = clips.find((c) => c.id === selected);
    if (!c) return;
    const s = sources.get(c.source)!.engine;
    const frame = sourceFrame(s, boundary(s, c.in) + time - c.start);
    update(
      c.id,
      edge === "in"
        ? { in: Math.min(c.out - 1, Math.max(c.in, frame)) }
        : { out: Math.max(c.in + 1, Math.min(c.out, frame + 1)) },
    );
  }
  return {
    sources,
    clips,
    timing,
    selected,
    select,
    busy,
    message,
    setMessage,
    add,
    commit,
    update,
    undo,
    canUndo: history.length > 1,
    trimAt,
  };
}
export type TimelineSession = ReturnType<typeof useTimeline>;
