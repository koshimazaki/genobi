import { useEffect, useRef, useState } from "react";
import type { Recipe } from "./recipe";

/** A local draft clock. It never renders or seeks the loaded World session. */
export function useMorphDraftPlayback(recipe: Recipe | null, active: boolean) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = useRef(0);
  useEffect(() => setPlaying(false), [recipe, active]);
  useEffect(() => {
    if (!playing || !active || !recipe) return;
    const startFrame = Math.round(current.current * (recipe.frames - 1));
    const started = performance.now();
    let animation = 0;
    const tick = (now: number) => {
      const frame = Math.min(
        recipe.frames - 1,
        startFrame + Math.floor(((now - started) * recipe.fps) / 1000),
      );
      const next = frame / (recipe.frames - 1);
      current.current = next;
      setPosition(next);
      if (frame === recipe.frames - 1) setPlaying(false);
      else animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [recipe, playing, active]);
  return {
    position,
    playing,
    frame: Math.round(position * ((recipe?.frames ?? 1) - 1)),
    seek(value: number) {
      setPlaying(false);
      current.current = Math.max(0, Math.min(1, value));
      setPosition(current.current);
    },
    toggle() {
      if (!recipe || !active) return;
      if (!playing && current.current >= 1) {
        current.current = 0;
        setPosition(0);
      }
      setPlaying(!playing);
    },
  };
}
