/** The car-mecha study: a low car on the floor that rises into a mecha on the bass. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneTransform,
} from "../../src/world-builder/scene-state";
import { compact, heldCamera, mapping } from "./recipe-parts";
import { FRUIT_MORPH_AMOUNT } from "./recipes-fruit";
import { bassSwells, shipBounds } from "./recipes-ship-mecha";

/** Each form's colour, written on every voxel so the guide's RGB shows it. */
export const CAR_COLOURS: Record<string, string> = {
  Car: "#1b2a3a",
  Mecha: "#d9a441",
};
/** The mecha fills this share of the frame height. */
export const CAR_FILL = 0.55;
/** Front three-quarter: this far round from the nose, this far above. */
export const CAR_AZIMUTH = 35,
  CAR_ELEVATION = 12;
const FOV = 46;
/**
 * The smallest p75-to-p95 spread read as swells. The car is captured with
 * `--band-release 30 --band-smooth 5`, which narrows the band: measured
 * 3 Nov 2026 on Dimensions at 40.125 s it spans 0.772 to 0.800, under
 * ship-mecha's 0.05 guard, so the raw band held the mecha all take.
 */
export const CAR_MIN_SWELL = 0.02;

type Part = SceneTransform & { color?: string };

function form(recipe: Recipe, label: string): SceneStateKey {
  const state = recipe.motion!.stateKeys.find((key) => key.label === label);
  if (!state) throw new Error(`The car preset has no ${label}.`);
  return state;
}

/** A form centred on x and z, its lowest voxel on the floor, in its colour. */
function grounded(state: SceneStateKey, size: number) {
  const box = shipBounds(state.objects as Record<string, Part>, size);
  const dx = -(box.min[0] + box.max[0]) / 2,
    dy = -box.min[1],
    dz = -(box.min[2] + box.max[2]) / 2;
  const color = CAR_COLOURS[state.label];
  return Object.fromEntries(
    Object.entries(state.objects).map(([id, part]) => [
      id,
      { ...part, x: part.x + dx, y: part.y + dy, z: part.z + dz, color },
    ]),
  );
}

/**
 * The ship-mecha mechanism on the car-mecha preset: its 128 retained voxels,
 * the car in silence and the mecha at full bass, blended by `morphControl` on
 * the low band's swells above the take's own floor. Both forms stand on the
 * floor, centred on one vertical axis, so the car folds up into the mecha in
 * place. A slow mid twist turns it; the held front three-quarter view is
 * framed on the mecha at CAR_FILL, which leaves the car low in the frame.
 */
export function carMecha(recipe: Recipe) {
  const motion = recipe.motion!;
  const size = motion.instances?.size ?? 1;
  const car = form(recipe, "Car"),
    mecha = form(recipe, "Mecha");
  const placedMecha = grounded(mecha, size);
  const mechaBox = shipBounds(placedMecha, size);
  const height = mechaBox.max[1] - mechaBox.min[1];
  const swells = bassSwells(recipe.bandEnvelopes.low, CAR_MIN_SWELL);
  recipe.bandEnvelopes = { ...recipe.bandEnvelopes, low: swells.low };
  const centreY = height / 2;
  motion.stateKeys = [
    { ...car, id: "car", frame: 0, objects: grounded(car, size) },
    {
      ...mecha,
      id: "mecha",
      frame: recipe.frames - 1,
      objects: placedMecha,
    },
  ].map((key) => ({ ...compact(key), easing: "linear" as const }));
  motion.transitionStyle = "direct";
  motion.morphControl = {
    version: 1,
    enabled: true,
    originStateId: "car",
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
  const frame = height / CAR_FILL;
  const distance = frame / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
  const lift = CAR_ELEVATION * (Math.PI / 180),
    round = CAR_AZIMUTH * (Math.PI / 180);
  const flat = distance * Math.cos(lift);
  recipe.cameraMotion = heldCamera(
    [
      flat * Math.sin(round),
      centreY + distance * Math.sin(lift),
      flat * Math.cos(round),
    ],
    [0, centreY, 0],
    FOV,
  );
  recipe.prompt =
    "A low futuristic sports car in dark gunmetal with cyan light strips sits on a wet dark studio floor under neon reflections, seen from the front three-quarter; on every bass swell its body folds and rises into a gold mecha warrior, then settles back into the car as the bass fades, turning slowly. Hard key light, still camera.";
  return {
    camera: `held front three-quarter, ${CAR_AZIMUTH} degrees round and ${CAR_ELEVATION} above, the mecha ${CAR_FILL * 100}% of the frame height`,
    morph: `continuous: morphControl Car -> Mecha on low, progress = low x ${FRUIT_MORPH_AMOUNT}, clamped at 1`,
    low:
      swells.floor === null
        ? "raw low band (no swell above its floor)"
        : `swells above the take's p75 low ${Math.round(swells.floor * 1000) / 1000} to its p95, held 8 frames, released over 12`,
    mappings: "twistY mid 0.2",
    voxels: Object.keys(car.objects).length,
    floor: "both forms on the floor, centred on one vertical axis",
  };
}
