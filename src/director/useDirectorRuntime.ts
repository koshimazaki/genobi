import { useCallback, useEffect, useRef, useState } from "react";
import type { Bundle } from "./bundle";
import { loadExample } from "./bundle";
import { loadRemix } from "./remix-template";
import { findTemplate } from "./template-catalogue";
import { loadHouseTemplate } from "./house-template";
import {
  findHouseTemplate,
  findMixTemplate,
} from "../../shared/templates/catalogue";
import { loadMixTemplate } from "./mix-template";
import { loadShowcase } from "./showcase";
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
    if (studioStore.getState().director.bundle) return;
    let cancelled = false;
    const params = new URLSearchParams(location.search),
      example = params.get("example"),
      house = findHouseTemplate(example),
      mix = findMixTemplate(example),
      showcase = params.get("showcase");
    void (
      showcase
        ? loadShowcase(showcase, Number(params.get("version"))).then(
            ({ bundle, note }) => {
              if (note && !cancelled) setTimeout(() => report(note), 0);
              return bundle;
            },
          )
        : example === "studio"
          ? loadExample()
          : mix
            ? loadMixTemplate(mix)
            : house
              ? loadHouseTemplate(house, location.search)
              : loadRemix(findTemplate(params.get("template"))?.id)
    )
      .then((b) => {
        if (!cancelled) studioStore.getState().actions.initialize(b);
      })
      .catch((e) => {
        if (!cancelled) report(e);
      });
    return () => {
      cancelled = true;
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
