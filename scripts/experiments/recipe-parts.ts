/** Shared geometry and camera helpers for the pilot studies. No provider calls. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneMapping,
  SceneMappingProperty,
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import type { SceneCameraMotion } from "../../src/world-builder/scene-camera";

/**
 * A box of these metre sizes, within the engine's bounds: each axis is 0.1-8
 * and `scale` (0.1-32) multiplies all three. Long pieces carry their length in
 * `scale`; an axis that would fall under 0.1 is thickened to the minimum.
 */
export function sized(x: number, y: number, z: number) {
  const scale = Math.max(1, Math.max(x, y, z) / 8);
  const axis = (v: number) =>
    Math.round(Math.max(0.1, v / scale) * 1000) / 1000;
  return {
    scale: Math.round(scale * 1000) / 1000,
    scaleX: axis(x),
    scaleY: axis(y),
    scaleZ: axis(z),
  };
}

export function compact<T>(input: T): T {
  return JSON.parse(
    JSON.stringify(input, (_key, value) =>
      typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
    ),
  ) as T;
}

export function parts(values: SceneTransform[]) {
  return Object.fromEntries(
    values.map((part, i) => [
      `voxel-${String(i).padStart(3, "0")}`,
      compact(part),
    ]),
  );
}

export function mapping(
  id: string,
  source: SceneMapping["source"],
  property: SceneMappingProperty,
  amount: number,
): SceneMapping {
  return { id, source, property, amount, enabled: true };
}

/** Two rows of four towers; `tall` is the 32 m street of the falling study. */
export function towers(count: number, tall = false): SceneTransform[] {
  const floors = count / 8;
  return Array.from({ length: count }, (_, i) => {
    const tower = Math.floor(i / floors),
      level = i % floors;
    const height = tall ? 3.2 : 1.15 + (tower % 4) * 0.18;
    return {
      x: ((tower % 4) - 1.5) * (tall ? 8 : 5),
      y: (level + 0.5) * height,
      z: tower < 4 ? (tall ? -12 : -5) : tall ? 12 : 5,
      scale: 1,
      scaleX: tall ? 5 : 2.8,
      scaleY: height * 0.96,
      scaleZ: tall ? 5 : 2.8,
    };
  });
}

export function diamond(count: number): SceneTransform[] {
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(1 - y * y),
      x = r * Math.cos(angle),
      z = r * Math.sin(angle);
    const norm = Math.abs(x) + Math.abs(y) + Math.abs(z);
    return {
      x: (8 * x) / norm,
      y: 9 + (8 * y) / norm,
      z: (8 * z) / norm,
      scale: 1.25,
    };
  });
}

/** Twelve bays of piers, vault ribs, clerestory walls and floor slabs. */
export function nave(): SceneTransform[] {
  return Array.from({ length: 96 }, (_, i) => {
    const bay = Math.floor(i / 8),
      part = i % 8,
      side = part < 4 ? -1 : 1;
    const kind = part % 4,
      z = -14.6 + bay * 2.65;
    if (kind === 0)
      return {
        x: side * 8,
        y: 8,
        z,
        scale: 2,
        scaleX: 0.55,
        scaleY: 8,
        scaleZ: 0.55,
      };
    if (kind === 1)
      return {
        x: side * 6,
        y: 18.6,
        z,
        scale: 2,
        scaleX: 4,
        scaleY: 0.35,
        scaleZ: 0.7,
        rotationZ: side * -0.58,
      };
    if (kind === 2)
      return {
        x: side * 9.4,
        y: 10,
        z,
        scale: 2,
        scaleX: 0.2,
        scaleY: 7,
        scaleZ: 1.25,
      };
    return {
      x: side * 4,
      y: 0.1,
      z,
      scale: 2,
      scaleX: 4,
      scaleY: 0.1,
      scaleZ: 1.3,
    };
  });
}

/**
 * A hollow stepped pyramid: eight 1.5 m terraces, each a square ring of four
 * walls in four segments (128 pieces), stepping 0.75 m inward per terrace and
 * open at the apex. `k` scales the whole pyramid. Seen from inside it is an enclosure with an oculus.
 */
export function hollowPyramid(k = 1): SceneTransform[] {
  const out: SceneTransform[] = [];
  for (let layer = 0; layer < 8; layer++) {
    const w = (6.4 - 0.75 * layer) * k,
      y = (0.75 + 1.5 * layer) * k,
      segment = w / 2;
    for (let side = 0; side < 4; side++)
      for (let j = 0; j < 4; j++) {
        const along = -w + segment * (j + 0.5),
          alongX = side < 2;
        const across = side % 2 ? w : -w;
        // Segments overlap by the wall thickness so the corners close.
        const long = segment + 0.5 * k,
          thick = 0.5 * k;
        out.push({
          x: alongX ? along : across,
          y,
          z: alongX ? across : along,
          ...sized(alongX ? long : thick, 1.5 * k, alongX ? thick : long),
        });
      }
  }
  return out;
}

/** A clockwork mass: stacked discs with vanes that can visibly turn.
 *  It reuses the preset's exact instance count, so every voxel keeps its id. */
export function clockwork(total: number): SceneTransform[] {
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const core = Math.min(8, Math.max(2, Math.round(total / 8)));
  const layers = 4,
    vanesTotal = total - core,
    base = Math.floor(vanesTotal / layers);
  const out: SceneTransform[] = [];
  for (let i = 0; i < core; i++)
    out.push({
      x: 0,
      y: round(0.4 + i * 0.56),
      z: 0,
      scale: 1,
      scaleX: round(1.15 - i * 0.06),
      scaleY: 0.16,
      scaleZ: round(1.15 - i * 0.06),
    });
  for (let layer = 0; layer < layers; layer++) {
    const count = base + (layer < vanesTotal - base * layers ? 1 : 0),
      radius = 1.12 + layer * 0.3,
      y = round(0.52 + layer * 0.56);
    for (let vane = 0; vane < count; vane++) {
      const raw = (vane / count) * Math.PI * 2 + layer * 0.18;
      // Rotation is bounded to -pi..pi, so wrap a full turn back into range.
      const angle = raw > Math.PI ? raw - Math.PI * 2 : raw;
      out.push({
        x: round(radius * Math.cos(angle)),
        y,
        z: round(radius * Math.sin(angle)),
        scale: 1,
        scaleX: 1.45,
        scaleY: 0.18,
        scaleZ: 0.34,
        // Stay clear of +-pi: compact() rounds to 3 decimals, so 3.1415 becomes 3.142.
        rotation: round(Math.max(-3.141, Math.min(3.141, angle))),
      });
    }
  }
  return out.slice(0, total);
}

/** One slow 360 degree orbit around the mass, a key every 45 degrees. */
export function orbit360(recipe: Recipe): SceneCameraMotion {
  const keys = 9,
    radius = recipe.radius ?? 44,
    elevation = ((recipe.elevation ?? 18) * Math.PI) / 180,
    targetY = recipe.targetY ?? 10;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    version: 1,
    enabled: true,
    keys: Array.from({ length: keys }, (_, i) => {
      const azimuth = ((360 / (keys - 1)) * i * Math.PI) / 180;
      return {
        id: `orbit-${i}`,
        frame: Math.round(((recipe.frames ?? 193) - 1) * (i / (keys - 1))),
        easing: "linear" as const,
        position: [
          round(radius * Math.cos(elevation) * Math.sin(azimuth)),
          round(targetY + radius * Math.sin(elevation)),
          round(radius * Math.cos(elevation) * Math.cos(azimuth)),
        ] as SceneVector,
        target: [0, targetY, 0] as SceneVector,
        fov: recipe.fov ?? 46,
      };
    }),
    audio: { enabled: true, source: "low", amount: 0.12, motion: "push" },
  };
}

/**
 * A camera that does not move: one key, no audio push. The architecture has
 * to carry the music, so the guide's motion is the scene's, not the lens's.
 */
export function heldCamera(
  position: SceneVector,
  target: SceneVector,
  fov: number,
): SceneCameraMotion {
  return {
    version: 1,
    enabled: true,
    keys: [{ id: "held", frame: 0, position, target, fov, easing: "linear" }],
    audio: { enabled: false, source: "low", amount: 0, motion: "push" },
  };
}

/** A fixed camera whose look target pans `degrees` left to right over the take. */
export function panCamera(
  position: SceneVector,
  lookAt: SceneVector,
  degrees: number,
  fov: number,
  last: number,
): SceneCameraMotion {
  const dx = lookAt[0] - position[0],
    dz = lookAt[2] - position[2];
  const round = (n: number) => Math.round(n * 100) / 100;
  const keys = [-0.5, 0, 0.5].map((share, i) => {
    const a = (share * degrees * Math.PI) / 180;
    return {
      id: `pan-${i}`,
      frame: Math.round((last * i) / 2),
      position,
      target: [
        round(position[0] + dx * Math.cos(a) - dz * Math.sin(a)),
        lookAt[1],
        round(position[2] + dx * Math.sin(a) + dz * Math.cos(a)),
      ] as SceneVector,
      fov,
      easing: "linear" as const,
    };
  });
  return {
    version: 1,
    enabled: true,
    keys,
    audio: { enabled: false, source: "low", amount: 0, motion: "push" },
  };
}
