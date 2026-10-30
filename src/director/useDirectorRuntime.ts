import { useCallback, useEffect, useRef, useState } from "react";
import type { Bundle } from "./bundle";
import { directorRoute } from "./route-template";
import { DirectorRenderer } from "./renderer";
import type { Playback } from "./playback";
import { studioStore } from "../studio/store";
import { useProjectCopy } from "./useProjectCopy";
import type { RenderReport } from "../../shared/licensing/render-report";

/** GPU, decoded media and object URLs remain outside the document store. */
export function useDirectorRuntime(
  bundle: Bundle | undefined,
  active: boolean,
) {
  const [status, setStatus] = useState("Loading example…"),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  /** The renderer is preparing and has not drawn its first frame yet. */
  const [firstFrame, setFirstFrame] = useState(false);
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const [renderUrl, setRenderUrl] = useState("");
  const [renderSummary, setRenderSummary] = useState<RenderReport>();
  // The canvas the stage has mounted. The Editor wraps Program in its row
  // and the simple Director does not, so switching between them mounts a new
  // canvas; the renderer is rebuilt on the one showing, never left drawing
  // into a canvas that left the page.
  const [element, setElement] = useState<HTMLCanvasElement | null>(null);
  const canvas = useCallback(
    (el: HTMLCanvasElement | null) => setElement(el),
    [],
  );
  const runtime = useRef<DirectorRenderer | null>(null),
    playback = useRef<Playback | null>(null),
    abort = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    playback.current?.cancel();
    abort.current?.abort();
  }, []);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  // The local server's copy of this project, and agents' commands on it.
  useProjectCopy(bundle, setError);
  useEffect(() => {
    let request = 0;
    const navigate = async () => {
      const ticket = ++request;
      const state = studioStore.getState();
      const before = state.director.bundle;
      try {
        const route = directorRoute(location.search);
        if (before && (!route.explicit || before.project.id === route.id))
          return;
        if (Object.values(state.operations).some(Boolean))
          throw new Error(
            "Wait for playback, import or export to finish first.",
          );
        const saved = state.director.drafts[route.id]?.bundle;
        const opened = saved ? { bundle: saved, note: "" } : await route.load();
        // A newer route or an edit while media loaded wins over this result.
        if (
          ticket !== request ||
          studioStore.getState().director.bundle !== before
        )
          return;
        // An export or playback started during the fetch owns this renderer.
        // Replacing its bundle would dispose it and abort that operation.
        if (Object.values(studioStore.getState().operations).some(Boolean))
          throw new Error(
            "Wait for playback, import or export to finish first.",
          );
        if (before) state.actions.commit(opened.bundle, before);
        else state.actions.initialize(opened.bundle);
        if (opened.note) report(opened.note);
      } catch (e) {
        if (ticket === request) report(e);
      }
    };
    void navigate();
    // The runtime stays mounted across workspaces. Read new URLs on history
    // navigation too; a mount-only loader kept the previous template open.
    window.addEventListener("popstate", navigate);
    return () => {
      request++;
      window.removeEventListener("popstate", navigate);
    };
  }, []);
  useEffect(() => {
    if (!bundle || !element) return;
    let cancelled = false;
    let initialized = false;
    setReady(false);
    setFirstFrame(true);
    setStatus("Preparing layers…");
    let r: DirectorRenderer;
    try {
      r = new DirectorRenderer(bundle, element);
    } catch (e) {
      report(e);
      setStatus("Preview unavailable");
      setFirstFrame(false);
      return;
    }
    void r
      .init()
      .then(async () => {
        initialized = true;
        if (cancelled) {
          r.dispose();
          return;
        }
        runtime.current = r;
        await r.render(studioStore.getState().transport.frame);
        if (!cancelled) {
          setFirstFrame(false);
          setWaveforms(r.waveforms());
          setReady(true);
          setStatus("Ready · local preview");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setFirstFrame(false);
          report(e);
          setStatus("Preview unavailable");
        }
      });
    return () => {
      cancelled = true;
      stop();
      runtime.current = null;
      if (initialized) r.dispose();
    };
  }, [bundle, element, stop]);
  // A finished render belongs to the project it was made from: cleared (and
  // revoked below) when the bundle changes, kept when only the canvas does,
  // as when Edit in Editor takes a finished render to the Editor.
  useEffect(() => setRenderUrl(""), [bundle]);
  useEffect(
    () => () => {
      if (renderUrl) URL.revokeObjectURL(renderUrl);
    },
    [renderUrl],
  );
  useEffect(() => {
    // Hiding a preset pauses playback; an explicit export continues.
    if (!active) playback.current?.cancel();
  }, [active]);
  return {
    canvas,
    runtime,
    playback,
    abort,
    status,
    setStatus,
    error,
    setError,
    report,
    ready,
    setReady,
    firstFrame,
    waveforms,
    renderUrl,
    renderSummary,
    setRenderSummary,
    setRenderUrl,
  };
}
