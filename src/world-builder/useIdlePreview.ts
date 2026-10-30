import { useEffect, useRef } from "react";
import type { Mode } from "./interaction";
import type { BuilderSession } from "./useBuilderSession";

/**
 * Keep the character moving while Play is stopped in Shot and Build, so the
 * mannequin plays the recipe's motion (idle by default) and a recording can
 * start straight away. One redraw per take frame at the recipe's fps, looping
 * over the take; Walk keeps its own loop. It stops for Play, a capture and
 * any other busy work, and captures still render the fixed frame grid.
 */
export function useIdlePreview(s: BuilderSession, mode: Mode, active: boolean) {
  const on =
    active &&
    s.ready &&
    !s.playing &&
    !s.busy &&
    !s.capturing &&
    (mode === "shot" || mode === "edit");
  const { runtime } = s;
  const recipe = useRef(s.recipe);
  recipe.current = s.recipe;
  useEffect(() => {
    if (!on) return;
    let handle = 0,
      shown = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const r = recipe.current;
      const frame = Math.floor(((now - start) / 1000) * r.fps) % r.frames;
      if (frame !== shown) {
        shown = frame;
        runtime.current?.previewPose(frame);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [on, runtime]);
}
