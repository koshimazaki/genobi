import { useEffect, useRef } from "react";
import { drawGenerationPixels } from "../effects/generation-pixels";

export default function GenerationIndicator() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      previous = 0,
      seconds = 0,
      visible = true;
    // CSS colour transitions continue after a theme attribute changes.
    // Resolve the current colour on each painted frame instead of caching its start.
    const paint = () =>
      drawGenerationPixels(ctx, seconds, getComputedStyle(canvas).color);
    const tick = (now: number) => {
      if (now - previous >= 1000 / 30) {
        seconds += previous ? Math.min(now - previous, 100) / 1000 : 0;
        previous = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      paint();
      if (!motion.matches && !document.hidden && visible)
        frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      paint();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    const themes = new MutationObserver(paint);
    themes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      themes.disconnect();
      motion.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return (
    <canvas ref={ref} className="generation-indicator" aria-hidden="true" />
  );
}
