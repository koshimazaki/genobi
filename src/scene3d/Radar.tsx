import { useEffect, useRef } from "react";
import {
  drawRadar,
  readPalette,
  sizeCanvas,
  type RadarInput,
  type RadarPalette,
} from "./radar-drawing";

/** Holodeck's two radar panes, drawn whenever the input changes. */
export function Radar({ input, label }: { input: RadarInput; label: string }) {
  const top = useRef<HTMLCanvasElement>(null);
  const side = useRef<HTMLCanvasElement>(null);
  const palette = useRef<RadarPalette | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const draw = () => {
    for (const [canvas, view] of [
      [top.current, "top"],
      [side.current, "side"],
    ] as const) {
      if (!canvas) continue;
      palette.current ??= readPalette(canvas);
      sizeCanvas(canvas);
      drawRadar(canvas, view, latest.current, palette.current);
    }
  };
  useEffect(() => {
    const resize = new ResizeObserver(draw);
    if (top.current) resize.observe(top.current);
    if (side.current) resize.observe(side.current);
    const theme = new MutationObserver(() => {
      palette.current = null;
      draw();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    // Labels use the studio's mono face; redraw once it has loaded so the
    // first frame's fallback font does not swap later.
    let live = true;
    void document.fonts?.ready.then(() => live && draw());
    document.fonts?.addEventListener("loadingdone", draw);
    return () => {
      live = false;
      resize.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", draw);
    };
  }, []);
  useEffect(draw, [input]);
  return (
    <div className="s3d-radar">
      <figure>
        <figcaption>
          Top path <span>{label}</span>
        </figcaption>
        <canvas ref={top} role="img" aria-label="Top view of the camera path" />
      </figure>
      <figure>
        <figcaption>
          Side altitude <span>{Math.round(input.t * 100)}%</span>
        </figcaption>
        <canvas
          ref={side}
          role="img"
          aria-label="Side view of the camera height"
        />
      </figure>
    </div>
  );
}
