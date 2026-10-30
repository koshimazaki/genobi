/**
 * Gen-Mod: generation, modified. Edit frame 0 of existing footage any way the
 * Edit tool can (a character, a face, the background, a prop, boxes with
 * dropped references, or a prompt alone), then carry that frame through the
 * source's motion. The recipe is the JSON the person edits in the Director and
 * an agent writes and revises between takes; nothing here sends anything to a
 * model. See docs/genmod.md.
 */

export const GENMOD_SCHEMA = "genobi.genmod.v1";

/** What the frame 0 edit changes; it sets the defaults and the prompt's wording. */
export const GENMOD_KINDS = [
  "character",
  "face",
  "background",
  "edit",
] as const;
export type GenModKind = (typeof GENMOD_KINDS)[number];

/**
 * How the video pass carries frame 0. `control`: the source's pose, depth or
 * edges guide a full re-render that opens on frame 0 (LTX Union Control, the
 * "Replace Anyone" pattern). `masked`: only a masked region regenerates and
 * every other pixel is the source's (LTX in/outpaint). `audio`: frame 0 and
 * the source's own soundtrack, frozen, drive a new take whose lips follow the
 * audio and whose motion comes from the prompt (LTX image + audio to video);
 * stiller than `control`, for talking shots.
 */
export const GENMOD_ROUTES = ["control", "masked", "audio"] as const;
export type GenModRoute = (typeof GENMOD_ROUTES)[number];
/** The Union Control annotators. */
export const GENMOD_GUIDES = ["pose", "depth", "canny"] as const;
export type GenModGuide = (typeof GENMOD_GUIDES)[number];

/** What the prompt promises to keep from the source take. */
export const GENMOD_KEEP = [
  "camera",
  "framing",
  "performance",
  "light",
  "background",
  "wardrobe",
] as const;
export type GenModKeep = (typeof GENMOD_KEEP)[number];

/** FLUX's region grid, as in the Image and Edit boxes: [top, left, bottom, right], 0–1000. */
export type GenModBox = [number, number, number, number];

export interface GenModRecipe {
  schema: typeof GENMOD_SCHEMA;
  kind: GenModKind;
  /** The source take: a project video asset and a half-open frame range, as `cut` takes. */
  source: { assetId: string; in: number; out: number };
  /**
   * The approved edited frame 0, once there is one. Its own generation record
   * holds how it was made (boxes, references, prompt); the video pass needs
   * only the result.
   */
  firstFrame?: { assetId: string };
  route: GenModRoute;
  /**
   * The control route: which annotator, and an optional SAM3 text prompt for
   * the subject it reads. The shipped graph reads the whole frame: `isolate`
   * is refused by `genmodValues` until SAM3 isolation is wired into it.
   */
  control?: { guide: GenModGuide; isolate?: string };
  /** The masked route: where the change happens and how far the mask grows, in pixels. */
  mask?: { region: GenModBox; dilation: number };
  /** What changed in frame 0, in words: "his head is a chicken's head". */
  change: string;
  /** The action and the scene, as the source shows them; never a camera move. */
  action: string;
  keep: GenModKeep[];
  /** The source's own soundtrack kept as it is, or new sound generated. */
  audio: "keep" | "generate";
}

export const GENMOD_LIMITS = {
  /** The LTX frame grid: 8k+1 frames, as World Builder renders. */
  minFrames: 9,
  maxFrames: 241,
  maxDilation: 64,
  change: 400,
  isolate: 120,
  action: 2000,
} as const;

/**
 * Where each kind starts: pose read off the whole frame, which the shipped
 * control graph supports. Replace Anyone isolates the person first; that
 * waits on SAM3 in the graph.
 */
export const GENMOD_DEFAULTS: Record<
  GenModKind,
  { control: NonNullable<GenModRecipe["control"]>; keep: GenModKeep[] }
> = {
  character: {
    control: { guide: "pose" },
    keep: ["camera", "framing", "performance", "light", "background"],
  },
  face: {
    control: { guide: "pose" },
    keep: GENMOD_KEEP.slice(),
  },
  background: {
    control: { guide: "pose" },
    keep: ["camera", "framing", "performance", "wardrobe"],
  },
  edit: { control: { guide: "pose" }, keep: GENMOD_KEEP.slice() },
};
/** The 17 October Cloud proof ran the masked route at a dilation of 15. */
export const GENMOD_DEFAULT_DILATION = 15;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FIELDS = [
  "schema",
  "kind",
  "source",
  "firstFrame",
  "route",
  "control",
  "mask",
  "change",
  "action",
  "keep",
  "audio",
];
// Same set the sanitizers strip from labels and filenames.
const CONTROL = /[\x00-\x1f\x7f]/;

const record = (value: unknown, name: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
};
const onlyKeys = (
  value: Record<string, unknown>,
  keys: string[],
  name: string,
) => {
  if (Object.keys(value).some((k) => !keys.includes(k)))
    throw new Error(`Unexpected field in ${name}`);
};
const assetId = (value: unknown, name: string) => {
  if (typeof value !== "string" || !ID.test(value))
    throw new Error(`Invalid ${name}`);
  return value;
};
const text = (
  value: unknown,
  name: string,
  limit: number,
  required = false,
) => {
  if (typeof value !== "string" || value.length > limit || CONTROL.test(value))
    throw new Error(`${name} must be text of at most ${limit} characters`);
  if (required && !value.trim()) throw new Error(`Describe the ${name}`);
  return value.trim();
};
const oneOf = <T extends string>(
  value: unknown,
  options: readonly T[],
  name: string,
) => {
  if (!options.includes(value as T))
    throw new Error(`${name} must be one of ${options.join(", ")}`);
  return value as T;
};

/** The LTX frame count a source range yields: the largest 8k+1 inside it. */
export function genmodFrames(range: { in: number; out: number }): number {
  const span = range.out - range.in;
  return span < GENMOD_LIMITS.minFrames
    ? 0
    : Math.min(GENMOD_LIMITS.maxFrames, Math.floor((span - 1) / 8) * 8 + 1);
}

function parseControl(value: unknown): NonNullable<GenModRecipe["control"]> {
  const c = record(value, "control");
  onlyKeys(c, ["guide", "isolate"], "control");
  const guide = oneOf(c.guide, GENMOD_GUIDES, "control.guide");
  if (c.isolate === undefined) return { guide };
  const isolate = text(c.isolate, "control.isolate", GENMOD_LIMITS.isolate);
  return isolate ? { guide, isolate } : { guide };
}

function parseMask(value: unknown): NonNullable<GenModRecipe["mask"]> {
  const m = record(value, "mask");
  onlyKeys(m, ["region", "dilation"], "mask");
  const region = m.region;
  if (
    !Array.isArray(region) ||
    region.length !== 4 ||
    region.some((n) => !Number.isInteger(n) || n < 0 || n > 1000) ||
    region[0] >= region[2] ||
    region[1] >= region[3]
  )
    throw new Error(
      "mask.region must be [top,left,bottom,right] on the 0–1000 grid",
    );
  if (
    !Number.isInteger(m.dilation) ||
    Number(m.dilation) < 0 ||
    Number(m.dilation) > GENMOD_LIMITS.maxDilation
  )
    throw new Error(
      `mask.dilation must be a whole number of pixels, 0–${GENMOD_LIMITS.maxDilation}`,
    );
  return { region: region as GenModBox, dilation: Number(m.dilation) };
}

/**
 * A checked recipe, or an error naming the first problem. Unknown fields are
 * refused, so a typo in the JSON editor cannot silently drop a setting, and a
 * route carries only its own settings.
 */
export function parseGenModRecipe(value: unknown): GenModRecipe {
  const r = record(value, "Recipe");
  onlyKeys(r, FIELDS, "the recipe");
  if (r.schema !== GENMOD_SCHEMA)
    throw new Error(`schema must be ${GENMOD_SCHEMA}`);
  const kind = oneOf(r.kind, GENMOD_KINDS, "kind");
  const source = record(r.source, "source");
  onlyKeys(source, ["assetId", "in", "out"], "source");
  for (const k of ["in", "out"] as const)
    if (!Number.isInteger(source[k]) || Number(source[k]) < 0)
      throw new Error(`source.${k} must be a non-negative frame index`);
  const range = { in: Number(source.in), out: Number(source.out) };
  if (!genmodFrames(range))
    throw new Error(
      `The source range needs at least ${GENMOD_LIMITS.minFrames} frames`,
    );
  const route = oneOf(r.route, GENMOD_ROUTES, "route");
  const settings = { control: "control", masked: "mask", audio: "" }[route];
  for (const field of ["control", "mask"])
    if (r[field] !== undefined && field !== settings)
      throw new Error(
        settings
          ? `The ${route} route takes ${settings} settings only`
          : "The audio route takes no control or mask settings",
      );
  if (route === "audio" && r.audio === "generate")
    throw new Error("The audio route is driven by the source's own soundtrack");
  if (
    !Array.isArray(r.keep) ||
    r.keep.some((k) => !GENMOD_KEEP.includes(k as GenModKeep)) ||
    new Set(r.keep).size !== r.keep.length
  )
    throw new Error(
      `keep lists each of ${GENMOD_KEEP.join(", ")} at most once`,
    );
  let firstFrame: GenModRecipe["firstFrame"];
  if (r.firstFrame !== undefined) {
    const f = record(r.firstFrame, "firstFrame");
    onlyKeys(f, ["assetId"], "firstFrame");
    firstFrame = { assetId: assetId(f.assetId, "firstFrame.assetId") };
  }
  return {
    schema: GENMOD_SCHEMA,
    kind,
    source: { assetId: assetId(source.assetId, "source.assetId"), ...range },
    ...(firstFrame ? { firstFrame } : {}),
    route,
    ...(route === "control"
      ? { control: parseControl(r.control ?? GENMOD_DEFAULTS[kind].control) }
      : route === "masked"
        ? { mask: parseMask(r.mask) }
        : {}),
    change: text(r.change, "change", GENMOD_LIMITS.change, true),
    action: text(r.action ?? "", "action", GENMOD_LIMITS.action),
    keep: GENMOD_KEEP.filter((k) => (r.keep as string[]).includes(k)),
    audio: oneOf(r.audio ?? "keep", ["keep", "generate"] as const, "audio"),
  };
}

/** A new control-route recipe at the kind's defaults. */
export function newGenModRecipe(
  kind: GenModKind,
  source: GenModRecipe["source"],
  change: string,
  action = "",
): GenModRecipe {
  return parseGenModRecipe({
    schema: GENMOD_SCHEMA,
    kind,
    source,
    route: "control",
    control: GENMOD_DEFAULTS[kind].control,
    change,
    action,
    keep: GENMOD_DEFAULTS[kind].keep,
    audio: "keep",
  });
}
