/**
 * One animation loop for every meter and scope in the Sound panel. It writes
 * to DOM and canvas refs, never React state. While the track plays it reads a
 * live AnalyserNode on the World Builder's <audio> element; otherwise it
 * shows the recipe's precomputed envelopes at the current frame, so scrubbing
 * still reads. The panel can be popped into a Document PiP window, so each
 * frame is scheduled on the window that holds the panel at that moment.
 *
 * Ported from Holodeck's SignalScopes (src/components/audio/SignalScopes.tsx,
 * MIT; notice in Holodeck-LICENSE.txt).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Recipe } from "./recipe";
import { frameLoop } from "./frame-loop";
import { liveAnalyser, readGraph, type LiveGraph } from "./audio-analyser";
import {
  FALLBACK_HEAT,
  METER_BANDS,
  easeLevels,
  envelopeLevels,
  heat,
  holdPeak,
  liveLevels,
  parseColor,
  silence,
  type HeatPalette,
  type MeterBand,
} from "./signal-meter";

type Els = Record<MeterBand, Set<HTMLElement>>;
const sets = (): Els => ({
  low: new Set(),
  mid: new Set(),
  high: new Set(),
  level: new Set(),
});
/** A React 19 ref callback that keeps an element in a set while mounted. */
const into = (set: Set<HTMLElement>) => (el: HTMLElement | null) => {
  if (!el) return;
  set.add(el);
  return () => void set.delete(el);
};

function palette(canvas: HTMLCanvasElement): HeatPalette {
  const styles = canvas.ownerDocument.defaultView?.getComputedStyle(canvas);
  const out = { ...FALLBACK_HEAT };
  if (!styles) return out;
  for (const name of Object.keys(out) as (keyof HeatPalette)[])
    out[name] =
      parseColor(styles.getPropertyValue(`--spec-heat-${name}`)) ?? out[name];
  return out;
}
const css = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Size a canvas to its box once it has one; false while it is hidden. */
function fit(canvas: HTMLCanvasElement | null, dpr = 1) {
  if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return false;
  const w = Math.round(canvas.clientWidth * dpr),
    h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return true;
}

/** Synthesised magnitude when there is no FFT: low-heavy, scaled by level. */
const synth = (f: number, level: number) =>
  Math.pow(1 - f, 1.3) * (0.3 + level * 0.7) * 1.2;

function drawSpectrogram(
  c: HTMLCanvasElement,
  p: HeatPalette,
  freq: Uint8Array | null,
  level: number,
) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width,
    h = c.height;
  // Scroll left one pixel by self-blit: no per-frame ImageData.
  ctx.drawImage(c, 1, 0, w - 1, h, 0, 0, w - 1, h);
  for (let y = 0; y < h; y++) {
    const f = 1 - y / h;
    const m = freq?.length
      ? freq[Math.min(freq.length - 1, Math.floor(f ** 1.6 * freq.length))] /
        255
      : synth(f, level);
    ctx.fillStyle = css(heat(m, p));
    ctx.fillRect(w - 1, y, 1, 1);
  }
}

function drawSpectrum(
  c: HTMLCanvasElement,
  p: HeatPalette,
  freq: Uint8Array | null,
  level: number,
) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width,
    h = c.height,
    n = 30,
    gap = 2 * (c.ownerDocument.defaultView?.devicePixelRatio || 1),
    bw = (w - gap * (n - 1)) / n,
    usable = freq ? Math.floor(freq.length * 0.6) : 0;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    let mag: number;
    if (freq && usable) {
      const start = Math.floor((i / n) * usable),
        end = Math.max(start + 1, Math.floor(((i + 1) / n) * usable));
      let sum = 0;
      for (let k = start; k < end; k++) sum += freq[k];
      mag = sum / (end - start) / 255;
    } else mag = synth(i / n, level);
    const bh = Math.max(1, Math.min(1, mag) * (h - 3));
    ctx.fillStyle = css(heat(Math.max(0.18, Math.min(1, mag * 1.15)), p));
    ctx.fillRect(i * (bw + gap), h - bh, bw, bh);
  }
}

export interface ScopeInput {
  recipe: Recipe;
  frame: number;
  playing: boolean;
  audioURL: string;
  audioElement: RefObject<HTMLAudioElement | null>;
}

export function useSignalScopes(s: ScopeInput) {
  const latest = useRef(s);
  latest.current = s;
  const graph = useRef<LiveGraph | null>(null);
  const [els] = useState(() => ({
    bars: sets(),
    peaks: sets(),
    reads: sets(),
    spectrogram: new Set<HTMLElement>(),
    spectrum: new Set<HTMLElement>(),
  }));

  // The analyser is made on the first Play with a track, and kept.
  useEffect(() => {
    const audio = s.audioElement.current;
    if (!s.playing || !s.audioURL || !audio) return;
    let alive = true;
    void liveAnalyser(audio).then((g) => {
      if (alive && g) graph.current = g;
    });
    return () => {
      alive = false;
    };
  }, [s.playing, s.audioURL, s.audioElement]);

  useEffect(() => {
    const shown = silence();
    const held = silence();
    let last = performance.now(),
      lastFrame = -1,
      ticks = 0,
      heatPalette: HeatPalette | null = null;
    const first = <T extends HTMLElement>(set: Set<HTMLElement>) =>
      set.values().next().value as T | undefined;
    const tick = (now: number) => {
      const seconds = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { recipe, frame, playing, audioElement } = latest.current;
      const audio = audioElement.current;
      const live = !!audio && playing && readGraph(graph.current, audio);
      const g = graph.current;
      const target = live
        ? liveLevels(g!.freq, g!.time, g!.context.sampleRate)
        : envelopeLevels(recipe, frame);
      // Live reads ease like Holodeck's engine; a scrubbed frame is exact.
      // Holodeck moves 18% of the way each 60 Hz frame (smoothing 0.82).
      if (live) easeLevels(shown, target, 1 - Math.pow(0.82, seconds * 60));
      else Object.assign(shown, target);
      for (const band of METER_BANDS) {
        const v = shown[band];
        held[band] = holdPeak(held[band], v, seconds);
        for (const el of els.bars[band])
          el.style.transform = `scaleY(${v.toFixed(3)})`;
        for (const el of els.peaks[band])
          el.style.bottom = `${(held[band] * 100).toFixed(1)}%`;
        for (const el of els.reads[band]) {
          const text = v.toFixed(2);
          if (el.textContent !== text) el.textContent = text;
        }
      }
      const spectrogram = first<HTMLCanvasElement>(els.spectrogram);
      const spectrum = first<HTMLCanvasElement>(els.spectrum);
      const anchor = spectrogram ?? spectrum ?? first(els.bars.level);
      const view = anchor?.ownerDocument.defaultView ?? window;
      const freq = live ? g!.freq : null;
      // Off Play the spectrogram moves only when the frame does.
      if (fit(spectrogram ?? null) && (live || frame !== lastFrame)) {
        heatPalette ??= palette(spectrogram!);
        drawSpectrogram(spectrogram!, heatPalette, freq, shown.level);
      }
      if (fit(spectrum ?? null, view.devicePixelRatio || 1)) {
        heatPalette ??= palette(spectrum!);
        drawSpectrum(spectrum!, heatPalette, freq, shown.level);
      }
      lastFrame = frame;
      // Re-read the theme now and then: it can change, and PiP copies it.
      if (++ticks % 120 === 0) heatPalette = null;
    };
    // Follow the panel into a PiP window and back when it closes.
    const where = () => {
      const anchor =
        first(els.spectrogram) ?? first(els.spectrum) ?? first(els.bars.level);
      return anchor?.ownerDocument.defaultView ?? window;
    };
    return frameLoop(tick, where, window);
  }, [els]);

  return {
    bar: (band: MeterBand) => into(els.bars[band]),
    peak: (band: MeterBand) => into(els.peaks[band]),
    read: (band: MeterBand) => into(els.reads[band]),
    spectrogram: into(els.spectrogram),
    spectrum: into(els.spectrum),
  };
}
export type SignalScope = ReturnType<typeof useSignalScopes>;
