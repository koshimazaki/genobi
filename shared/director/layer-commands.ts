// The two layer commands that change how a clip looks rather than when it
// plays: `set-placement` (position, scale, opacity, rotation and the linear
// motion to an end placement, as `visualAt` draws it) and `set-parameters` (a
// recipe's controls, its text included, checked against the parameter schema
// the recipe declares). Parsing checks shape and bounds; applying checks the
// layer, its kind and its recipe.
import type {
  GraphicsModule,
  Layer,
  Parameters,
  Project,
  Visual,
} from "./types";

export class CommandError extends Error {}
export const refuse = (message: string): never => {
  throw new CommandError(message);
};
export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** Control characters become spaces, as every sanitiser here does. */
export const clean = (text: string) =>
  text.replace(/[\x00-\x1f\x7f]/g, " ").trim();

/** Pixels from the composition's centre, either way: far past any frame. */
export const POSITION_LIMIT = 10_000;
/** The inspector's own scale range, and the schema's for `motion.scaleTo`. */
export const SCALE_LIMIT = 10;
/** A recipe parameter: its name, a text's length, how many one command sets. */
const PARAMETER_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
export const PARAMETER_TEXT_LIMIT = 200;
const PARAMETERS_PER_COMMAND = 32;

export interface Placement {
  position?: { x?: number; y?: number };
  scale?: number;
  opacity?: number;
  rotationDegrees?: number;
  /** The end placement; null stops the clip animating. */
  motion?: {
    scaleTo?: number;
    xTo?: number;
    yTo?: number;
    opacityTo?: number;
  } | null;
}
export const PLACEMENT_FIELDS = [
  "position",
  "scale",
  "opacity",
  "rotationDegrees",
  "motion",
] as const;

type Range = [min: number, max: number, open?: boolean];
const RANGES: Record<string, Range> = {
  x: [-POSITION_LIMIT, POSITION_LIMIT],
  y: [-POSITION_LIMIT, POSITION_LIMIT],
  xTo: [-POSITION_LIMIT, POSITION_LIMIT],
  yTo: [-POSITION_LIMIT, POSITION_LIMIT],
  scale: [0, SCALE_LIMIT, true],
  scaleTo: [0, SCALE_LIMIT, true],
  opacity: [0, 1],
  opacityTo: [0, 1],
  rotationDegrees: [-360, 360],
};
function number(key: string, value: unknown) {
  const [min, max, open] = RANGES[key];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value > max ||
    (open ? value <= min : value < min)
  )
    refuse(
      `${key} must be a number ${open ? "above" : "from"} ${min} to ${max}`,
    );
  return value as number;
}
/** An object of named numbers, each optional, at least one given. */
function numbers(name: string, value: unknown, keys: string[]) {
  if (!isObject(value)) return refuse(`${name} must be an object`);
  const other = Object.keys(value).find((k) => !keys.includes(k));
  if (other) refuse(`${name} has no ${other.slice(0, 40)}; use ${keys}`);
  const out: Record<string, number> = {};
  for (const k of keys)
    if (value[k] !== undefined) out[k] = number(k, value[k]);
  if (!Object.keys(out).length) refuse(`${name} needs one of ${keys}`);
  return out;
}

/** The placement fields of a `set-placement`, at least one, each bounded. */
export function readPlacement(value: Record<string, unknown>): Placement {
  const out: Placement = {};
  if (value.position !== undefined)
    out.position = numbers("position", value.position, ["x", "y"]);
  for (const k of ["scale", "opacity", "rotationDegrees"] as const)
    if (value[k] !== undefined) out[k] = number(k, value[k]);
  if (value.motion === null) out.motion = null;
  else if (value.motion !== undefined)
    out.motion = numbers("motion", value.motion, [
      "scaleTo",
      "xTo",
      "yTo",
      "opacityTo",
    ]);
  if (!Object.keys(out).length)
    refuse(`set-placement needs one of ${PLACEMENT_FIELDS.join(", ")}`);
  return out;
}

/** A recipe's parameters by name: text, numbers or switches, shape only. */
export function readParameters(value: unknown): Parameters {
  if (!isObject(value)) return refuse("parameters must be an object");
  const keys = Object.keys(value);
  if (!keys.length || keys.length > PARAMETERS_PER_COMMAND)
    refuse(`parameters needs 1 to ${PARAMETERS_PER_COMMAND} names`);
  const out: Parameters = {};
  for (const k of keys) {
    if (!PARAMETER_KEY.test(k))
      refuse(`${k.slice(0, 40)} is not a parameter name`);
    const v = value[k];
    if (typeof v === "string") {
      if (v.length > PARAMETER_TEXT_LIMIT)
        refuse(`${k} must be at most ${PARAMETER_TEXT_LIMIT} characters`);
      out[k] = clean(v);
    } else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else refuse(`${k} must be text, a number or true/false`);
  }
  return out;
}

/** What a recipe's parameter schema says of one parameter. */
interface ParameterRule {
  type?: string;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  maxLength?: number;
  pattern?: string;
}
function checkParameter(key: string, value: unknown, rule: ParameterRule) {
  const t = rule.type;
  if (t === "string") {
    if (typeof value !== "string") return refuse(`${key} must be text`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength)
      refuse(`${key} must be at most ${rule.maxLength} characters`);
    if (
      rule.pattern !== undefined &&
      !new RegExp(rule.pattern, "u").test(value)
    )
      refuse(`${key} does not match ${rule.pattern}`);
  } else if (t === "number" || t === "integer") {
    if (
      typeof value !== "number" ||
      (t === "integer" && !Number.isInteger(value))
    )
      return refuse(
        `${key} must be ${t === "integer" ? "a whole number" : "a number"}`,
      );
    if (
      (rule.minimum !== undefined && value < rule.minimum) ||
      (rule.maximum !== undefined && value > rule.maximum)
    )
      refuse(
        `${key} must be from ${rule.minimum ?? "-∞"} to ${rule.maximum ?? "∞"}`,
      );
  } else if (t === "boolean") {
    if (typeof value !== "boolean") refuse(`${key} must be true or false`);
  } else refuse(`${key} has a type this command cannot set`);
  if (rule.enum && !rule.enum.includes(value))
    refuse(`${key} must be one of ${rule.enum.join(", ")}`);
}

/**
 * Each name one the recipe declares, with its type, range, length and
 * pattern: the rule `set-parameters` and `add-graphic` share.
 */
export function checkParameters(
  moduleId: string,
  module: GraphicsModule,
  parameters: Parameters,
) {
  const rules = (module.parameterSchema.properties ?? {}) as Record<
    string,
    ParameterRule
  >;
  for (const [key, value] of Object.entries(parameters)) {
    if (!Object.hasOwn(rules, key))
      refuse(
        `${moduleId} has no parameter ${key}; it takes ${Object.keys(rules).join(", ")}`,
      );
    checkParameter(key, value, rules[key]);
  }
}

export function layerOf(project: Project, id: string) {
  return (
    project.layers.find((l) => l.id === id) ??
    refuse(`No layer ${id} in this project`)
  );
}
export function unlocked(project: Project, id: string) {
  const layer = layerOf(project, id);
  if (layer.locked) refuse(`Unlock ${layer.name} first`);
  return layer;
}
export function patch(
  project: Project,
  id: string,
  changes: Partial<Layer>,
): Project {
  return {
    ...project,
    layers: project.layers.map((l) =>
      l.id === id ? ({ ...l, ...changes } as Layer) : l,
    ),
  };
}

/**
 * A picture or overlay layer at a new placement. Fields left out keep their
 * value; a motion left partial keeps its current end, else holds the start.
 */
export function setPlacement(
  project: Project,
  layerId: string,
  placement: Placement,
): Project {
  const layer = unlocked(project, layerId);
  if (!("opacity" in layer))
    return refuse(`${layer.name} is ${layer.kind}; it has no placement`);
  const start: Visual = {
    opacity: placement.opacity ?? layer.opacity,
    position: { ...layer.position, ...placement.position },
    scale: placement.scale ?? layer.scale,
    rotationDegrees: placement.rotationDegrees ?? layer.rotationDegrees,
  };
  const end = placement.motion === undefined ? layer.motion : placement.motion;
  const motion = end && {
    scaleTo: end.scaleTo ?? layer.motion?.scaleTo ?? start.scale,
    xTo: end.xTo ?? layer.motion?.xTo ?? start.position.x,
    yTo: end.yTo ?? layer.motion?.yTo ?? start.position.y,
    opacityTo: end.opacityTo ?? layer.motion?.opacityTo ?? start.opacity,
  };
  const { motion: _motion, ...rest } = layer;
  const next = { ...rest, ...start, ...(motion ? { motion } : {}) } as Layer;
  return {
    ...project,
    layers: project.layers.map((l) => (l.id === layerId ? next : l)),
  };
}

/**
 * A recipe layer with some of its parameters changed. Each name must be one
 * the recipe declares, with its type, range, length and pattern; the others
 * keep their values. The browser's `text` command uses this too.
 */
export function setParameters(
  project: Project,
  layerId: string,
  parameters: Parameters,
): Project {
  const layer = unlocked(project, layerId);
  if (!("parameters" in layer))
    return refuse(
      `${layer.name} is ${layer.kind}; it has no recipe parameters`,
    );
  const module = project.modules[layer.moduleId];
  if (!module) return refuse(`No recipe ${layer.moduleId} in this project`);
  checkParameters(layer.moduleId, module, parameters);
  return patch(project, layerId, {
    parameters: { ...layer.parameters, ...parameters },
  });
}
