/**
 * The Capture panel's pure parts: the aspect presets, the duration bank on
 * the take's 8k + 1 frame grid and the status badge. The layout follows
 * Holodeck's World Capture panel (MIT, see Holodeck-LICENSE.txt); what each
 * control does is the World Builder's own recipe and session.
 */
import { parameterSchema } from "./recipe";
import { framesForSeconds, takeSeconds } from "./take-duration";

/** The four frame presets: dimensions divisible by 64 for model guidance. */
export const CAPTURE_ASPECTS = [
  { key: "16:9", width: 1280, height: 704, rw: 16, rh: 9 },
  { key: "1:1", width: 1024, height: 1024, rw: 1, rh: 1 },
  { key: "9:16", width: 704, height: 1280, rw: 9, rh: 16 },
  { key: "4:5", width: 768, height: 960, rw: 4, rh: 5 },
] as const;
export type AspectKey = (typeof CAPTURE_ASPECTS)[number]["key"] | "custom";

/** The preset these dimensions match, or `custom`. */
export function aspectFor(width: number, height: number): AspectKey {
  return (
    CAPTURE_ASPECTS.find((a) => a.width === width && a.height === height)
      ?.key ?? "custom"
  );
}

/** A custom side snapped to the nearest multiple of 64, within the recipe's range. */
export function snapSide(value: number, side: "width" | "height") {
  const { min, max, step } = parameterSchema[side];
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

/**
 * Quick take lengths in seconds. Each maps to the nearest 8k + 1 frame count
 * at 24 fps: 1 s is 25 frames (1.04 s), 10 s is 241 (10.04 s).
 */
export const DURATION_BANK = [1, 2, 3, 4, 5, 8, 10] as const;

/** The bank entry that lands on `frames`, or null when none does. */
export function bankChoice(frames: number) {
  return DURATION_BANK.find((s) => framesForSeconds(s) === frames) ?? null;
}

/** A take length as seconds to the hundredth, as the take length shows it. */
export const lengthLabel = (frames: number) =>
  `${takeSeconds(frames).toFixed(2)} s · ${frames} f`;

export type CaptureTone = "armed" | "rec" | "ready";
export type CaptureBadge = { tone: CaptureTone; label: string; pulse: boolean };

/**
 * The panel's state: REC while a take renders (or Record live runs), READY
 * once a take or live clip is held, ARMED otherwise.
 */
export function captureBadge({
  capturing,
  progress,
  frames,
  take,
  liveRecording,
}: {
  capturing: boolean;
  progress: number;
  frames: number;
  take: { mode?: string } | null;
  liveRecording: boolean;
}): CaptureBadge {
  if (capturing)
    return { tone: "rec", label: `REC ${progress}/${frames}`, pulse: true };
  if (liveRecording) return { tone: "rec", label: "REC LIVE", pulse: true };
  if (take)
    return {
      tone: "ready",
      label: take.mode === "live" ? "READY · LIVE CLIP" : "READY · TAKE",
      pulse: false,
    };
  return { tone: "armed", label: "ARMED", pulse: false };
}
