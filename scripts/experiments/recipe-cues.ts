/** Cue picking and baking for the pilot studies. Candidates, not instrument labels. */
import type { Recipe } from "../../src/world-builder/recipe";
import type { SceneStateKey } from "../../src/world-builder/scene-state";
import { compact } from "./recipe-parts";

export interface Cue {
  frame: number;
  source: "low" | "high" | "authored";
  method: "positive-band-change" | "authored-frame" | "band-peak";
  transitionFrames: number;
  /** For band-peak cues: the scaled band value at the cue frame. */
  peak?: number;
}

/** These are candidate band onsets, not kick/snare or instrument labels. */
export function selectCues(recipe: Recipe): Cue[] {
  const last = recipe.frames - 1;
  return (
    [
      ["low", 0.22, 0.4],
      ["high", 0.62, 0.78],
    ] as const
  ).map(([source, from, to]) => {
    const data = recipe.bandEnvelopes[source];
    let frame = Math.round(((from + to) / 2) * last),
      score = 0;
    for (let i = Math.ceil(from * last); i <= Math.floor(to * last); i++) {
      const previous = ((data[i - 1] ?? 0) + (data[i - 2] ?? 0)) / 2;
      const delta = (data[i] ?? 0) - previous;
      if (delta > score) {
        score = delta;
        frame = i;
      }
    }
    return {
      frame,
      source: score > 0 ? source : "authored",
      method: score > 0 ? "positive-band-change" : "authored-frame",
      transitionFrames: 6,
    };
  });
}

/**
 * The strongest local maxima of one band, at least `minGap` frames apart,
 * returned in time order. A cue starts its morph on the peak frame, so the
 * shape changes as the hit lands. Frames whose morph would not finish before
 * the last frame are skipped.
 */
export function peakCues(
  band: number[],
  count: number,
  minGap: number,
  transitionFrames = 6,
): Cue[] {
  const last = band.length - 1;
  const candidates: number[] = [];
  for (let i = 1; i + transitionFrames < last; i++) {
    const v = band[i];
    if (v > 0 && v >= (band[i - 1] ?? 0) && v > (band[i + 1] ?? 0))
      candidates.push(i);
  }
  candidates.sort((a, b) => band[b] - band[a] || a - b);
  const chosen: number[] = [];
  for (const frame of candidates) {
    if (chosen.length >= count) break;
    if (chosen.every((other) => Math.abs(other - frame) >= minGap))
      chosen.push(frame);
  }
  return chosen
    .sort((a, b) => a - b)
    .map((frame) => ({
      frame,
      source: "low" as const,
      method: "band-peak" as const,
      transitionFrames,
      peak: Math.round(band[frame] * 1000) / 1000,
    }));
}

/**
 * Hold a state, morph on each cue, hold the next. `sequence` names the state
 * index shown before the first cue and after each cue in turn, so [2, 0, 2, 0]
 * reads apple, banana, apple, banana. Keys come in the same start / hold /
 * arrive rhythm as `bakeCues`, so the arrival of cue i is key (i + 1) * 2.
 */
export function bakeSequence(
  states: SceneStateKey[],
  sequence: number[],
  cues: Cue[],
  frames: number,
) {
  if (
    sequence.length !== cues.length + 1 ||
    sequence.some((index) => !states[index]) ||
    cues.some(
      (cue, i) =>
        !Number.isInteger(cue.frame) ||
        !Number.isInteger(cue.transitionFrames) ||
        cue.transitionFrames < 1 ||
        cue.frame < 1 ||
        cue.frame + cue.transitionFrames >= frames ||
        (i > 0 &&
          cue.frame <= cues[i - 1].frame + cues[i - 1].transitionFrames),
    )
  )
    throw new Error(
      "Ordered cues with non-overlapping morph windows and one state per segment are required.",
    );
  const key = (index: number, frame: number, name: string) => ({
    ...compact(structuredClone(states[index])),
    id: name,
    frame,
    easing: "easeInOut" as const,
  });
  return [
    key(sequence[0], 0, "start"),
    ...cues.flatMap((cue, i) => [
      key(sequence[i], cue.frame, `hold-${i + 1}`),
      key(sequence[i + 1], cue.frame + cue.transitionFrames, `arrive-${i + 1}`),
    ]),
  ];
}

/** A cue starts a short morph; its arrival is recorded separately. */
export function bakeCues(states: SceneStateKey[], cues: Cue[], frames: number) {
  if (cues.length !== 2)
    throw new Error(
      "Two ordered cues with non-overlapping morph windows are required.",
    );
  try {
    return bakeSequence(states, [0, 1, 2], cues, frames).map((key, i) => ({
      ...key,
      id: ["start", "hold-a", "arrive-b", "hold-b", "arrive-c"][i],
    }));
  } catch {
    throw new Error(
      "Two ordered cues with non-overlapping morph windows are required.",
    );
  }
}
