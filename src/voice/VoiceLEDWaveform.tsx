import { useEffect, useRef, type RefObject } from "react";
import { ease, LED_COUNT, parseColor, ramp, type Rgb } from "./levels";

/** The theme's LED stops, quiet to loud, from `--voice-led-0` … `-3`. */
function themeRamp(element: Element): Rgb[] {
  const style = getComputedStyle(element);
  const stops = [0, 1, 2, 3].flatMap((i) => {
    const rgb = parseColor(style.getPropertyValue(`--voice-led-${i}`));
    return rgb ? [rgb] : [];
  });
  return ramp(stops.length ? stops : [[228, 232, 237]]);
}

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;

/**
 * X Console's VoiceLEDWaveform (after WIE's voice feedback) on a canvas: 48
 * LEDs, the newest beside the mic on the right. Quiet levels stay round dots
 * and speech lifts them into bars, each LED coloured by its loudness with a
 * glow that grows with it. On Record the LEDs arrive one by one from the
 * right; while the local model works that arrival repeats as the loader, all
 * dots, coloured by place. Reduced motion keeps a static meter: no arrival,
 * no easing, no loader loop.
 */
export function VoiceLEDWaveform({
  levels,
  mode,
}: {
  levels: RefObject<Float32Array>;
  mode: "listening" | "working";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const listening = mode === "listening";
    const shown = new Float32Array(LED_COUNT);
    const silent = new Float32Array(LED_COUNT);
    const began = performance.now();
    let last = began,
      frame = 0,
      colors = themeRamp(element);

    function draw(now: number) {
      const { width, height } = element!;
      if (width < 4 || height < 2) return;
      const scale = devicePixelRatio || 1;
      const still = reduce.matches;
      ease(
        shown,
        listening ? levels.current : silent,
        (now - last) / 1000,
        still,
      );
      last = now;
      const elapsed = (now - began) / 1000;
      const fill = still
        ? 1
        : listening
          ? 1 - Math.pow(1 - Math.min(1, elapsed / 1.15), 3)
          : Math.min(1, (elapsed % 1.85) / 1.35);
      const head = fill * (LED_COUNT + 1);
      const pitch = width / LED_COUNT;
      // X Console's 2.4 / 4.5 bar to pitch, kept thin on a wide canvas.
      const bar = Math.min(3 * scale, Math.max(1.5 * scale, pitch * 0.53));
      const leds: { x: number; y: number; h: number; c: Rgb; l: number }[] = [];
      for (let index = 0; index < LED_COUNT; index++) {
        const fromMic = LED_COUNT - 1 - index;
        const arrival = Math.min(1, Math.max(0, head - fromMic));
        if (arrival <= 0) continue;
        const before = shown[Math.max(0, index - 1)];
        const after = shown[Math.min(LED_COUNT - 1, index + 1)];
        const level = Math.min(
          1,
          shown[index] * 0.64 + before * 0.18 + after * 0.18,
        );
        const h = Math.max(
          0.75 * scale,
          Math.max(bar, Math.pow(level, 0.55) * height) *
            (0.35 + arrival * 0.65),
        );
        const tone = listening ? level : index / (LED_COUNT - 1);
        leds.push({
          x: width - pitch / 2 - fromMic * pitch - bar / 2,
          y: (height - h) / 2,
          h,
          c: colors[Math.round(tone * (colors.length - 1))],
          l: level,
        });
      }
      context!.clearRect(0, 0, width, height);
      const radius = Math.min(1.15 * scale, bar * 0.34);
      // The glow first, then the LEDs themselves.
      for (const glow of [true, false]) {
        context!.shadowBlur = glow ? 4 * scale : 0;
        for (const led of leds) {
          const alpha = glow
            ? listening
              ? 0.16 + 0.5 * led.l
              : 0.22
            : listening
              ? 0.7 + 0.3 * led.l
              : 0.78;
          context!.fillStyle = rgba(led.c, alpha);
          if (glow) context!.shadowColor = rgba(led.c, alpha);
          context!.beginPath();
          context!.roundRect(led.x, led.y, bar, led.h, radius);
          context!.fill();
        }
      }
    }

    const size = () => {
      const scale = devicePixelRatio || 1;
      const { width, height } = element.getBoundingClientRect();
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
      draw(performance.now());
    };
    const resize = new ResizeObserver(size);
    resize.observe(element);
    const theme = new MutationObserver(() => {
      colors = themeRamp(element);
      draw(performance.now());
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const loop = (now: number) => {
      draw(now);
      // A still loader needs one frame; a meter redraws as the levels move.
      if (listening || !reduce.matches) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const motion = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    reduce.addEventListener("change", motion);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      reduce.removeEventListener("change", motion);
    };
  }, [levels, mode]);
  return <canvas ref={canvas} className="voice-led" aria-hidden="true" />;
}
