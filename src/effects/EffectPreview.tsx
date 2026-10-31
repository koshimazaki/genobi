import { useEffect, useRef, useState } from "react";
import type { EffectPreset } from "../../shared/effects";
import type { Parameters } from "../../shared/director/types";
import { effectPreviewRuntime } from "./preview-runtime";
import Icon from "../components/Icon";

export function EffectPreview({
  preset,
  parameters,
  source,
  compact = false,
}: {
  preset: EffectPreset;
  parameters: Parameters;
  source?: HTMLCanvasElement;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Awaited<
    ReturnType<typeof effectPreviewRuntime>
  > | null>(null);
  const [frame, setFrame] = useState(24);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const controls = useRef({ frame, compare });
  controls.current = { frame, compare };
  const signature = JSON.stringify(parameters);
  useEffect(() => {
    let alive = true;
    let instance: Awaited<ReturnType<typeof effectPreviewRuntime>> | undefined;
    setReady(false);
    setError("");
    setNotice("");
    void effectPreviewRuntime(
      canvas.current!,
      preset,
      JSON.parse(signature),
      source,
    )
      .then(async (next) => {
        instance = next;
        if (!alive) return next.dispose();
        runtime.current = next;
        setNotice(next.notice);
        await next.render(
          controls.current.frame / 24,
          controls.current.compare,
        );
        if (alive) setReady(true);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Preview unavailable.");
      });
    return () => {
      alive = false;
      runtime.current = null;
      instance?.dispose();
    };
  }, [preset, signature, source]);
  useEffect(() => {
    if (ready)
      void runtime.current
        ?.render(frame / 24, compare)
        .catch((e) => setError(String(e)));
  }, [frame, compare, ready]);
  useEffect(() => {
    if (!playing || !ready || compact) return;
    let handle = 0;
    const start = performance.now() - (frame / 24) * 1000;
    const loop = (now: number) => {
      setFrame(
        Math.floor(((now - start) / 1000) * 24) %
          Math.round(preset.durationSeconds * 24),
      );
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
    // Frame changes belong to the clock, not a new clock origin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, compact, preset.durationSeconds]);
  return (
    <div className={`effect-preview${compact ? " is-compact" : ""}`}>
      <canvas
        ref={canvas}
        width={512}
        height={288}
        aria-label={`${preset.name} ${compact ? "thumbnail" : "preview"}`}
      />
      {error && (
        <p
          className="effect-preview-error"
          role={compact ? undefined : "alert"}
        >
          Preview unavailable
        </p>
      )}
      {notice && compact && (
        <p className="effect-preview-error">WebGL needed for filter</p>
      )}
      {!compact && (
        <>
          <div className="effect-preview-transport">
            <button
              type="button"
              disabled={!ready || !!error}
              aria-label={
                playing ? "Pause effect preview" : "Play effect preview"
              }
              onClick={() => setPlaying(!playing)}
            >
              <Icon name={playing ? "pause" : "play"} size={14} />
            </button>
            <input
              aria-label="Effect preview frame"
              type="range"
              min={0}
              max={Math.round(preset.durationSeconds * 24) - 1}
              value={frame}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
            />
            <output>{(frame / 24).toFixed(2)} s</output>
            {preset.input !== "none" && (
              <button
                type="button"
                aria-pressed={compare}
                onClick={() => setCompare(!compare)}
              >
                Source
              </button>
            )}
          </div>
          <p className="effect-preview-caption">
            {preset.input === "none"
              ? "Editable title · transparent layer"
              : source
                ? "Preview on the current 3D frame"
                : "Preview on example artwork"}
          </p>
          {notice && (
            <p className="effect-note" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="effect-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
