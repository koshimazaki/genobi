/** The ship-mecha study: one hovering spacecraft that becomes a mecha on the bass. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneTransform,
} from "../../src/world-builder/scene-state";
import { partBounds } from "../../src/world-builder/morph-resample";
import { compact, heldCamera, mapping } from "./recipe-parts";
import { FRUIT_MORPH_AMOUNT } from "./recipes-fruit";

/** Each form's colour, written on every voxel so the guide's RGB shows it. */
export const SHIP_COLOURS: Record<string, string> = {
  Spacecraft: "#c9ced6",
  Mecha: "#d9a441",
};
/** The mecha's feet hover this far above the floor. */
export const SHIP_HOVER = 0.4;
/** The taller form (the mecha) fills this share of the frame height. */
export const SHIP_FILL = 0.6;
const ELEVATION = 10,
  FOV = 46;

type Part = SceneTransform & { color?: string };

/** Below this spread between the take's median and loudest bass, keep the band as is. */
const MIN_SWELL = 0.05;

/**
 * The low band as swells above the take's own median: the median and
 * everything under it read 0 (the spacecraft), the loudest frame reads 1.
 * Measured 3 Nov 2026 on Dimensions at 40.125 s: after auto gain the low band
 * never fell below 0.54, so the raw band held the mecha for the whole take.
 * A band without that spread (silence, a constant) is returned unchanged, so
 * zero bass is still the spacecraft and full bass the mecha.
 */
export function bassSwells(low: number[]) {
  const sorted = [...low].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0,
    peak = sorted.at(-1) ?? 0;
  if (peak - median < MIN_SWELL) return { low: [...low], median: null };
  return {
    low: low.map((v) =>
      Math.max(0, Math.min(1, (v - median) / (peak - median))),
    ),
    median,
  };
}

/** A state's world-space box: every voxel's rotated, scaled box. */
export function shipBounds(objects: Record<string, Part>, size: number) {
  const boxes = Object.values(objects).map((p) =>
    partBounds({ ...p, scale: p.scale * size }),
  );
  const lo = (i: 0 | 1 | 2) =>
    Math.min(...boxes.map((b) => b.min.toArray()[i]));
  const hi = (i: 0 | 1 | 2) =>
    Math.max(...boxes.map((b) => b.max.toArray()[i]));
  return {
    min: [lo(0), lo(1), lo(2)] as const,
    max: [hi(0), hi(1), hi(2)] as const,
  };
}

function form(recipe: Recipe, label: string): SceneStateKey {
  const state = recipe.motion!.stateKeys.find((key) => key.label === label);
  if (!state) throw new Error(`The spacecraft preset has no ${label}.`);
  return state;
}

/** A form moved so its box centre sits at (0, centreY, 0), in its colour. */
function placed(state: SceneStateKey, size: number, centreY: number) {
  const box = shipBounds(state.objects, size);
  const d = [0, 1, 2].map((i) => -(box.min[i] + box.max[i]) / 2);
  d[1] += centreY;
  const color = SHIP_COLOURS[state.label];
  return Object.fromEntries(
    Object.entries(state.objects).map(([id, part]) => [
      id,
      { ...part, x: part.x + d[0], y: part.y + d[1], z: part.z + d[2], color },
    ]),
  );
}

/**
 * The fruit-apple-banana mechanism on the spacecraft-mecha preset: its own
 * 128 retained voxels, the spacecraft in silence and the mecha at full bass,
 * blended by `morphControl` on the low band so the clock never moves it. Both
 * forms share one centre, the mecha's feet SHIP_HOVER above the floor, so the
 * spacecraft hovers higher. A slow mid twist turns it; no scale pulse, so the
 * mecha never outgrows the held front view framed on it at SHIP_FILL.
 */
export function shipMecha(recipe: Recipe) {
  const motion = recipe.motion!;
  const size = motion.instances?.size ?? 1;
  const ship = form(recipe, "Spacecraft"),
    mecha = form(recipe, "Mecha");
  const mechaBox = shipBounds(mecha.objects, size);
  const height = mechaBox.max[1] - mechaBox.min[1];
  // Only the morph reads low here (the twist is on mid), so the swell
  // envelope replaces the band in the recipe and in the keyframe pick alike.
  const swells = bassSwells(recipe.bandEnvelopes.low);
  recipe.bandEnvelopes = { ...recipe.bandEnvelopes, low: swells.low };
  const centreY = SHIP_HOVER + height / 2;
  motion.stateKeys = [
    {
      ...ship,
      id: "spacecraft",
      frame: 0,
      objects: placed(ship, size, centreY),
    },
    {
      ...mecha,
      id: "mecha",
      frame: recipe.frames - 1,
      objects: placed(mecha, size, centreY),
    },
  ].map((key) => ({ ...compact(key), easing: "linear" as const }));
  motion.transitionStyle = "direct";
  motion.morphControl = {
    version: 1,
    enabled: true,
    originStateId: "spacecraft",
    progress: {
      mode: "manual",
      position: 0,
      source: "low",
      // Cancel the preset's intensity so the blend reads the band directly.
      amount: Math.min(2, FRUIT_MORPH_AMOUNT / motion.intensity),
    },
    target: {
      position: 0,
      amount: 0,
      mode: "blend",
      routes: [{ stateId: "mecha", source: "low", amount: 1, enabled: false }],
    },
  };
  motion.pivot = [0, centreY, 0];
  motion.mappings = [mapping("twist", "mid", "twistY", 0.2)];
  recipe.avatar = false;
  // Held front view, ELEVATION degrees above, the mecha SHIP_FILL of the frame.
  const frame = height / SHIP_FILL;
  const distance = frame / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
  const lift = ELEVATION * (Math.PI / 180);
  recipe.cameraMotion = heldCamera(
    [0, centreY + distance * Math.sin(lift), distance * Math.cos(lift)],
    [0, centreY, 0],
    FOV,
  );
  recipe.prompt =
    "A sleek silver spacecraft hovers over a dark studio floor, seen from the front; on every bass swell its hull folds and reassembles into a gold mecha warrior, then relaxes back into the spacecraft as the bass fades, turning slowly. Hard studio light, still camera.";
  return {
    camera: `held front view, ${ELEVATION} degrees above, the mecha ${SHIP_FILL * 100}% of the frame height`,
    morph: `continuous: morphControl Spacecraft -> Mecha on low, progress = low x ${FRUIT_MORPH_AMOUNT}, clamped at 1`,
    low:
      swells.median === null
        ? "raw low band (no swell above its median)"
        : `swells above the take's median low ${Math.round(swells.median * 1000) / 1000}, loudest frame 1`,
    mappings: "twistY mid 0.2",
    voxels: Object.keys(ship.objects).length,
    hover: `mecha feet ${SHIP_HOVER} m above the floor, both forms on one centre`,
  };
}
