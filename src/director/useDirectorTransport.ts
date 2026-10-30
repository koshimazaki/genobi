import { useRef } from "react";
import type { Bundle } from "./bundle";
import { exportMp4 } from "./export";
import { play } from "./playback";
import type { useDirectorRuntime } from "./useDirectorRuntime";
import { useStudio } from "../studio/useStudio";
import { renderReport } from "../../shared/licensing/render-report";
import { readSelection, readUsage } from "../licensing/preferences";

/** Seek, preview playback and local MP4 export over the live renderer. */
export function useDirectorTransport(
  {
    runtime,
    playback,
    abort,
    ready,
    setStatus,
    setError,
    report,
    setRenderUrl,
    setRenderSummary,
  }: ReturnType<typeof useDirectorRuntime>,
  bundle: Bundle | undefined,
) {
  const { looping } = useStudio((s) => s.settings);
  const { frame } = useStudio((s) => s.transport);
  const { workingFile, playing, rendering } = useStudio((s) => s.operations);
  const actions = useStudio((s) => s.actions);
  const setFrame = (frame: number) => actions.transport({ frame });
  const setPlaying = (playing: boolean) => actions.operations({ playing });
  const setRendering = (rendering: boolean) =>
    actions.operations({ rendering });
  const loop = useRef(looping);
  loop.current = looping;
  async function seek(frame: number) {
    if (!runtime.current || playing || rendering) return;
    setFrame(frame);
    try {
      await runtime.current.render(frame);
    } catch (e) {
      report(e);
    }
  }
  async function togglePlay() {
    if (playback.current) {
      playback.current.cancel();
      await playback.current.done;
      playback.current = null;
      setPlaying(false);
      return;
    }
    if (!runtime.current || !bundle || rendering || workingFile || !ready)
      return;
    setError("");
    setPlaying(true);
    const p = play(
      runtime.current,
      frame >= bundle.project.composition.durationFrames - 1 ? 0 : frame,
      setFrame,
      undefined,
      () => loop.current,
    );
    playback.current = p;
    try {
      await p.done;
    } catch (e) {
      report(e);
    } finally {
      playback.current = null;
      setPlaying(false);
    }
  }
  /**
   * Stop: end playback, then show frame 0. It renders directly rather than
   * through `seek`, whose closure still reads `playing` from before the
   * pause and would return without moving.
   */
  async function stop() {
    const running = playback.current;
    if (running) {
      running.cancel();
      await running.done.catch(() => {});
      playback.current = null;
      setPlaying(false);
    }
    if (!runtime.current || rendering) return;
    setFrame(0);
    try {
      await runtime.current.render(0);
    } catch (e) {
      report(e);
    }
  }
  async function exportVideo() {
    if (!runtime.current) return;
    const renderer = runtime.current;
    setError("");
    setRendering(true);
    setFrame(0);
    setStatus("Rendering MP4 · every frame, locally");
    setRenderUrl("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const summary = renderReport(renderer.bundle.project, {
        selection: readSelection(),
        usage: readUsage(),
      });
      const total = runtime.current.bundle.project.composition.durationFrames;
      const blob = await exportMp4(
        renderer,
        (f) => {
          setFrame(f);
          setStatus(`Encoding frame ${f + 1}/${total} · local MP4`);
        },
        controller.signal,
      );
      if (controller.signal.aborted || runtime.current !== renderer) return;
      setRenderSummary(summary);
      setRenderUrl(URL.createObjectURL(blob));
      setStatus("Render ready · MP4 with audio");
    } catch (e) {
      report(e);
      setStatus("Render stopped");
    } finally {
      setRendering(false);
      abort.current = null;
    }
  }
  return { seek, togglePlay, stop, exportVideo };
}
