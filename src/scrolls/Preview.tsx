import { scrollDuration } from "../../shared/scrolls/timing";
import { useEffect, useRef, useState } from "react";
import type { ScrollBundle } from "./bundle";
import { directorBundle } from "./director";
import { download } from "../director/bundle";
import type { DirectorRenderer } from "../director/renderer";
import type { Playback } from "../director/playback";
export function useScrollPlayback({
  bundle,
  active,
}: {
  bundle: ScrollBundle;
  active: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    renderer = useRef<DirectorRenderer | undefined>(undefined),
    playback = useRef<Playback | undefined>(undefined),
    controller = useRef<AbortController | undefined>(undefined);
  const [frame, setFrame] = useState(0),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [rendering, setRendering] = useState(false),
    [error, setError] = useState("");
  const [waveform, setWaveform] = useState<number[]>([]),
    [sampleRate, setSampleRate] = useState<number>();
  const duration = scrollDuration(bundle.document);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setPlaying(false);
    setFrame(0);
    setError("");
    setWaveform([]);
    setSampleRate(undefined);
    if (!active || !canvas.current) return;
    const output = canvas.current;
    void import("../director/renderer")
      .then(async ({ DirectorRenderer }) => {
        if (cancelled) return;
        const instance = new DirectorRenderer(
          directorBundle(bundle, true),
          output,
        );
        renderer.current = instance;
        try {
          await instance.init();
          if (!cancelled) {
            await instance.render(0);
            setReady(true);
            setWaveform(instance.waveforms()["scroll-audio"] ?? []);
            setSampleRate(
              instance.audioInfo(bundle.document.timing.audioId ?? "")
                ?.sampleRate,
            );
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        }
        if (cancelled) instance.dispose();
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
      playback.current?.cancel();
      controller.current?.abort();
      renderer.current?.dispose();
      renderer.current = undefined;
    };
  }, [bundle, active]);
  async function toggle() {
    if (playing) {
      playback.current?.cancel();
      setPlaying(false);
      return;
    }
    if (!ready || !renderer.current) return;
    const instance = renderer.current;
    const { play } = await import("../director/playback");
    if (renderer.current !== instance) return;
    setPlaying(true);
    const p = play(instance, frame >= duration - 1 ? 0 : frame, setFrame);
    playback.current = p;
    try {
      await p.done;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlaying(false);
    }
  }
  async function exportVideo() {
    if (!renderer.current || !ready) return;
    playback.current?.cancel();
    setPlaying(false);
    setRendering(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const { exportMp4 } = await import("../director/export");
      const blob = await exportMp4(renderer.current, setFrame, abort.signal);
      download(blob, `${bundle.document.id}-animatic.mp4`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRendering(false);
    }
  }
  function seek(next: number) {
    if (rendering) return;
    playback.current?.cancel();
    setPlaying(false);
    const f = Math.max(0, Math.min(duration - 1, Math.round(next)));
    setFrame(f);
    void renderer.current?.render(f).catch((e) => setError(e.message));
  }
  return {
    canvas,
    frame,
    ready,
    playing,
    rendering,
    error,
    waveform,
    sampleRate,
    duration,
    toggle,
    exportVideo,
    seek,
    cancelExport: () => controller.current?.abort(),
  };
}
