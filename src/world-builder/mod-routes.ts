/**
 * Audio mod matrix: each route maps one band of the precomputed envelope to
 * one target's property, shaped by amount, gate, invert and smoothing.
 *
 * Ported from Holodeck's ModMatrix (src/audio/ModMatrix.ts, MIT; notice in
 * Holodeck-LICENSE.txt). Holodeck smooths live, frame by frame, with each
 * route's `lerp`; here the same one-pole smoothing runs over the recipe's
 * per-frame envelope, so a route's value at a frame depends only on the
 * recipe and every capture is frame-exact.
 */

export const MOD_SOURCES = ["low", "mid", "high", "level"] as const;
export type ModSource = (typeof MOD_SOURCES)[number];
export type ModProperty =
  "scale" | "height" | "spin" | "glow" | "light" | "yaw";
export interface ModRoute {
  id: string;
  enabled: boolean;
  source: ModSource;
  /**
   * `primitives`, `prop:<id>`, `world` (every set piece), `world:<id>`,
   * `avatar`, `neuro`, `light:key` or `light:fill`.
   */
  target: string;
  property: ModProperty;
  /** Depth: scale ×(1 + v), height +v m, spin +v rad/s, yaw +v rad, glow v, light +v (key light +3v). */
  amount: number;
  /** Below this level the route is silent (a hard gate, as the single route had). */
  threshold: number;
  invert: boolean;
  /** One-pole smoothing per frame, 0.01 to 1 (1 follows the envelope exactly). */
  lerp: number;
}

export const MAX_ROUTES = 16;
export const ROUTE_RANGES = {
  amount: { min: 0, max: 8, step: 0.1 },
  threshold: { min: 0, max: 1, step: 0.01 },
  lerp: { min: 0.01, max: 1, step: 0.01 },
} as const;
export const PROPERTY_LABELS: Record<ModProperty, string> = {
  scale: "Scale",
  height: "Height",
  spin: "Spin",
  glow: "Glow",
  light: "Intensity",
  yaw: "Turn",
};
/** The Playground set pieces the runtime can move (`playground.ts`). */
export const WORLD_PIECES = [
  "ramp-10",
  "ramp-20",
  "ramp-30",
  "ramp-45",
  "track",
  "jump-left",
  "jump-right",
  "u-ramp",
  "stairs",
  "slope",
  "pillar",
  "box-a",
  "box-b",
  "car-a",
  "car-b",
  "drone",
] as const;
const FIXED_TARGETS: Record<string, string> = {
  primitives: "All primitives",
  world: "All set pieces",
  avatar: "Character",
  neuro: "Neuro shader",
  "light:key": "Key light",
  "light:fill": "Fill light",
};

/** Only the properties the runtime applies to that kind of target. */
export function propertiesForTarget(target: string): ModProperty[] {
  if (target.startsWith("light:")) return ["light"];
  if (target === "neuro") return ["scale", "light"];
  if (target === "avatar") return ["height", "scale", "yaw"];
  if (target === "world" || target.startsWith("world:"))
    return ["scale", "height", "spin"];
  return ["scale", "height", "spin", "glow"];
}

export function validTarget(target: unknown, objectIds: readonly string[]) {
  if (typeof target !== "string") return false;
  if (Object.hasOwn(FIXED_TARGETS, target)) return true;
  if (target.startsWith("prop:")) return objectIds.includes(target.slice(5));
  if (target.startsWith("world:"))
    return (WORLD_PIECES as readonly string[]).includes(target.slice(6));
  return false;
}

/** Every target a route may name in this recipe, with a readable label. */
export function targetOptions(
  objectIds: readonly string[],
  playground: boolean,
) {
  return [
    ...Object.entries(FIXED_TARGETS)
      .filter(([value]) => playground || value !== "world")
      .map(([value, label]) => ({ value, label })),
    ...objectIds.map((id) => ({ value: `prop:${id}`, label: id })),
    ...(playground
      ? WORLD_PIECES.map((id) => ({
          value: `world:${id}`,
          label: `Set · ${id}`,
        }))
      : []),
  ];
}

/** The route target for an editor selection (`prop:<id>` or a set piece id). */
export function targetForSelection(selected: string) {
  if (selected.startsWith("prop:")) return selected;
  return (WORLD_PIECES as readonly string[]).includes(selected)
    ? `world:${selected}`
    : "";
}

export function createRoute(
  partial: Partial<ModRoute> = {},
  existing: readonly ModRoute[] = [],
): ModRoute {
  let n = existing.length + 1;
  while (existing.some((r) => r.id === `route-${n}`)) n++;
  const target = partial.target ?? "primitives";
  return {
    id: partial.id ?? `route-${n}`,
    enabled: partial.enabled ?? true,
    source: partial.source ?? "low",
    target,
    property: partial.property ?? propertiesForTarget(target)[0],
    amount: partial.amount ?? 1,
    threshold: partial.threshold ?? 0.2,
    invert: partial.invert ?? false,
    lerp: partial.lerp ?? 0.25,
  };
}

/** The single-route fields recipes held before `audioRoutes`. */
export const LEGACY_AUDIO_FIELDS = [
  "audioBand",
  "audioObject",
  "audioTarget",
  "audioGain",
  "audioGate",
  "audioInvert",
] as const;
type Legacy = Partial<Record<(typeof LEGACY_AUDIO_FIELDS)[number], unknown>>;

/**
 * The routes that reproduce the old single route exactly. It drove the chosen
 * primitives (or all of them) and, for scale and light, the key light and the
 * Neuro shader whatever object was chosen.
 */
export function legacyRoutes(input: Legacy, objectIds: readonly string[]) {
  const band = input.audioBand ?? "level",
    object = input.audioObject ?? "all",
    target = input.audioTarget ?? "scale",
    amount = input.audioGain ?? 2,
    threshold = input.audioGate ?? 0,
    invert = input.audioInvert ?? false;
  if (
    !MOD_SOURCES.includes(band as ModSource) ||
    typeof invert !== "boolean" ||
    typeof object !== "string" ||
    (object !== "all" && !objectIds.includes(object)) ||
    !["scale", "height", "light"].includes(target as string)
  )
    throw new Error("Invalid audio routing.");
  if (!finite(amount, 0, 8))
    throw new Error("audioGain must be between 0 and 8.");
  if (!finite(threshold, 0, 1))
    throw new Error("audioGate must be between 0 and 1.");
  const drive = object === "all" ? "primitives" : `prop:${object}`;
  const pairs: [string, ModProperty][] =
    target === "height"
      ? [[drive, "height"]]
      : target === "light"
        ? [
            ["light:key", "light"],
            ["neuro", "light"],
          ]
        : [
            [drive, "scale"],
            ["neuro", "scale"],
          ];
  return pairs.map(([t, property], i) => ({
    id: `route-${i + 1}`,
    enabled: true,
    source: band as ModSource,
    target: t,
    property,
    amount: amount as number,
    threshold: threshold as number,
    invert,
    lerp: 1,
  }));
}

/**
 * The single-route fields route 1 stands for, so a partial old-field patch
 * (`{ ...getRecipe(), audioBand: "low" }`) changes only what it names. A
 * target or property the old fields cannot express keeps their default.
 */
export function legacyFromRoutes(routes: unknown): Legacy {
  const first: unknown = Array.isArray(routes) ? routes[0] : undefined;
  if (!plain(first)) return {};
  const seed: Legacy = {};
  if (MOD_SOURCES.includes(first.source as ModSource))
    seed.audioBand = first.source;
  if (typeof first.amount === "number") seed.audioGain = first.amount;
  if (typeof first.threshold === "number") seed.audioGate = first.threshold;
  if (typeof first.invert === "boolean") seed.audioInvert = first.invert;
  const target = first.target,
    property = first.property;
  if (typeof target === "string" && target.startsWith("prop:"))
    seed.audioObject = target.slice(5);
  if (property === "light" && (target === "light:key" || target === "neuro"))
    seed.audioTarget = "light";
  else if (
    (property === "scale" || property === "height") &&
    (target === "primitives" ||
      target === "neuro" ||
      (typeof target === "string" && target.startsWith("prop:")))
  )
    seed.audioTarget = property;
  return seed;
}

const ROUTE_TYPES: Record<keyof ModRoute, string> = {
  id: "string",
  enabled: "boolean",
  source: "string",
  target: "string",
  property: "string",
  amount: "number",
  threshold: "number",
  invert: "boolean",
  lerp: "number",
};
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Validates and fills routes; omitted route fields take `createRoute` defaults. */
export function validateRoutes(input: unknown, objectIds: readonly string[]) {
  if (!Array.isArray(input) || input.length > MAX_ROUTES)
    throw new Error(`Use at most ${MAX_ROUTES} audio routes.`);
  const routes: ModRoute[] = [];
  for (const raw of input) {
    // Every given field has its type (null too is refused, never defaulted).
    if (
      !plain(raw) ||
      Object.entries(raw).some(
        ([k, v]) =>
          !Object.hasOwn(ROUTE_TYPES, k) ||
          typeof v !== ROUTE_TYPES[k as keyof ModRoute],
      )
    )
      throw new Error("Invalid audio route.");
    const route = createRoute(raw as Partial<ModRoute>, routes);
    if (
      typeof route.id !== "string" ||
      !/^[\w-]{1,48}$/.test(route.id) ||
      routes.some((r) => r.id === route.id) ||
      typeof route.enabled !== "boolean" ||
      typeof route.invert !== "boolean" ||
      !MOD_SOURCES.includes(route.source)
    )
      throw new Error("Invalid audio route.");
    if (!validTarget(route.target, objectIds))
      throw new Error(`Unknown audio route target: ${String(route.target)}.`);
    if (!propertiesForTarget(route.target).includes(route.property))
      throw new Error(
        `${route.target} takes ${propertiesForTarget(route.target).join(", ")}.`,
      );
    for (const key of ["amount", "threshold", "lerp"] as const)
      if (!finite(route[key], ROUTE_RANGES[key].min, ROUTE_RANGES[key].max))
        throw new Error(
          `Route ${key} must be between ${ROUTE_RANGES[key].min} and ${ROUTE_RANGES[key].max}.`,
        );
    routes.push(route);
  }
  return routes;
}

/** The audio half of a recipe: what a route reads from. */
export interface RouteSignals {
  frames: number;
  fps: number;
  envelope: number[];
  bandEnvelopes: { low: number[]; mid: number[]; high: number[] };
  audioRoutes: ModRoute[];
}
interface Series {
  data: number[];
  value: Float64Array;
  /** Integrated value / fps before each frame: spin's angle. */
  angle: Float64Array;
}
const cache = new WeakMap<ModRoute, Series>();

function series(r: RouteSignals, route: ModRoute, frame: number): Series {
  const data =
    route.source === "level" ? r.envelope : r.bandEnvelopes[route.source];
  const hit = cache.get(route);
  if (hit && hit.data === data && hit.value.length > frame) return hit;
  const length = Math.max(r.frames, data.length, frame + 1);
  const value = new Float64Array(length),
    angle = new Float64Array(length);
  let y = 0;
  for (let i = 0; i < length; i++) {
    const level = data[i] ?? 0;
    const x =
      level < route.threshold
        ? 0
        : (route.invert ? 1 - level : level) * route.amount;
    // lerp 1 must be x exactly, so migrated routes match the old closed form.
    y = route.lerp === 1 ? x : y + (x - y) * route.lerp;
    value[i] = y;
    if (i + 1 < length) angle[i + 1] = angle[i] + y / r.fps;
  }
  const fresh = { data, value, angle };
  cache.set(route, fresh);
  return fresh;
}

/** One route's driven value at a frame (spin: its accumulated angle). */
export function routeValue(r: RouteSignals, route: ModRoute, frame: number) {
  if (!route.enabled) return 0;
  const f = Math.max(0, Math.floor(frame));
  const s = series(r, route, f);
  return route.property === "spin" ? s.angle[f] : s.value[f];
}

export type Mods = Map<string, Partial<Record<ModProperty, number>>>;
export const NO_MODS: Mods = new Map();

/** Every enabled route's value at a frame, summed per target and property. */
export function modsAt(r: RouteSignals, frame: number): Mods {
  const mods: Mods = new Map();
  for (const route of r.audioRoutes) {
    const v = routeValue(r, route, frame);
    if (!v) continue;
    const entry = mods.get(route.target) ?? {};
    entry[route.property] = (entry[route.property] ?? 0) + v;
    mods.set(route.target, entry);
  }
  return mods;
}

/** The summed value of one property across several targets (a prop and "primitives"). */
export function modOf(mods: Mods, targets: string[], property: ModProperty) {
  let sum = 0;
  for (const t of targets) sum += mods.get(t)?.[property] ?? 0;
  return sum;
}
