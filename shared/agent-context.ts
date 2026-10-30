import { parseUsage, type UsagePreference } from "./licensing/types";
import {
  parseSelection,
  type SelectionPreference,
} from "./licensing/selection";
/**
 * The studio context a project-prompt session starts with (issue #23, "Picks
 * and context"): the person's recent picks, newest first, and the composer's
 * current settings, so an agent can turn "my last two picks" and "these
 * settings" into real ids instead of guessing. Small, validated and free of
 * secrets: ids, kinds, short names and setting values only, never a key, a
 * URL or a local path. Portable: no Node or DOM APIs.
 */
import { DIRECTOR_ID } from "./director/commands";
import { cameraSections } from "./camera";
import { lightGroups } from "./light";
import { ltxSlots, type SlotId } from "./ltx-prompt";
import type { Generator } from "./types";
import { KLEIN_RESOLUTIONS } from "./image";
import { readAcoustic, type AcousticSetting } from "./acoustic";
import {
  DIRECTION_GUIDE,
  parseDirection,
  type AgentDirection,
} from "./agent-context-direction";
import {
  parseWorld,
  WORLD_GUIDE,
  type AgentWorld,
} from "./agent-context-world";

/** Picks sent with a session, newest first. */
export const PICKS_MAX = 8;
export const PICK_NAME_MAX = 80;
export const GAP_TEXT_MAX = 300;

/**
 * A take is a run in the person's gallery (its job id, which `genobi_job` and
 * `genobi_take` read); an asset is a media asset of the open Director project
 * (its asset id, which `genobi_project` lists).
 */
export type PickKind = "take" | "asset";
export type PickMedia = "video" | "image" | "audio";

export interface AgentPick {
  kind: PickKind;
  id: string;
  media: PickMedia;
  /** What the studio shows for it: a take's description, an asset's file name. */
  name: string;
  /** For an asset, the Director project it belongs to. */
  projectId?: string;
}

/** The composer's settings, in the field names `genobi_quote` takes. */
export interface AgentSettings {
  generator: Generator;
  model: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  draft?: boolean;
  cameraEnabled?: boolean;
  /** One camera term per section, or null for none. */
  camera?: Record<string, string | null>;
  /** LTX's Light picker: one term per group, or null for none. */
  light?: Record<string, string | null>;
  /** LTX's four gaps, only those with text. */
  gaps?: Partial<Record<SlotId, string>>;
  imageResolution?: string;
  imageAspectRatio?: string;
  imageGrounding?: boolean;
  imageSafetyTolerance?: number;
  /** Video and upscale requests carry these, as `composerInput` sends them. */
  upscaleFactor?: number;
  upscaleCreativity?: 0 | 1;
  /** An upscale: the clip it reads, and its prompt when there is one. */
  sourceId?: string;
  upscalePrompt?: string;
  /** The Acoustic Space entry's treatment (`shared/acoustic.ts`). */
  acoustic?: AcousticSetting;
  /** Where workflow models run: this machine's ComfyUI or Comfy Cloud. */
  runLocation?: "local" | "cloud";
}

export interface AgentContext {
  selection?: SelectionPreference;
  usage?: UsagePreference;
  /** Newest first, at most `PICKS_MAX`. */
  picks: AgentPick[];
  settings?: AgentSettings;
  /** The open project's global prompt and the selected clip's direction. */
  direction?: AgentDirection;
  /** World Builder is open: its last preset and a summary of the set. */
  world?: AgentWorld;
  /**
   * Set by the server, never read from a request: what it left out and why,
   * such as picks from a project the session is not linked to.
   */
  note?: string;
}

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** As `validateInput` checks an upscale's source id. */
const SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const UPSCALE_PROMPT_MAX = 1200;
const MODEL = /^[a-z0-9][a-z0-9.-]{0,40}$/;
const RATIO = /^(auto|\d{1,2}:\d{1,2})$/;
const SIZE = /^[a-z0-9]{1,8}$/;
const GENERATORS: readonly Generator[] = [
  "video",
  "upscale",
  "image",
  "edit",
  "audio",
];
const KINDS: readonly PickKind[] = ["take", "asset"];
const MEDIA: readonly PickMedia[] = ["video", "image", "audio"];

/** One line of text: control characters out, spaces collapsed, bounded. */
export function plainText(value: string, limit: number) {
  return Array.from(value, (c) => (c < " " || c === "\x7f" ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
    .trim();
}

const refuse = (what: string): never => {
  throw new Error(`The studio context's ${what} is not valid.`);
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function parsePick(value: unknown): AgentPick {
  if (!isObject(value)) return refuse("pick");
  const { kind, id, media, name, projectId } = value;
  if (!KINDS.includes(kind as PickKind)) return refuse("pick kind");
  const idPattern = kind === "take" ? JOB_ID : DIRECTOR_ID;
  if (typeof id !== "string" || !idPattern.test(id)) return refuse("pick id");
  if (!MEDIA.includes(media as PickMedia)) return refuse("pick media");
  if (typeof name !== "string") return refuse("pick name");
  if (
    projectId !== undefined &&
    (kind !== "asset" ||
      typeof projectId !== "string" ||
      !DIRECTOR_ID.test(projectId))
  )
    return refuse("pick project");
  return {
    kind: kind as PickKind,
    id,
    media: media as PickMedia,
    name: plainText(name, PICK_NAME_MAX) || "Untitled",
    ...(projectId ? { projectId: projectId as string } : {}),
  };
}

/** One term per section from a fixed list, or null; anything else refused. */
function parseTerms(
  value: unknown,
  sections: readonly { id: string; terms: readonly { id: string }[] }[],
  what: string,
) {
  if (!isObject(value)) return refuse(what);
  const out: Record<string, string | null> = {};
  for (const [key, term] of Object.entries(value)) {
    const section = sections.find((s) => s.id === key);
    if (!section) return refuse(what);
    if (term !== null && !section.terms.some((t) => t.id === term))
      return refuse(what);
    out[key] = term as string | null;
  }
  return out;
}

function parseSettings(value: unknown): AgentSettings {
  if (!isObject(value)) return refuse("settings");
  const v = value;
  if (!GENERATORS.includes(v.generator as Generator))
    return refuse("generator");
  if (typeof v.model !== "string" || !MODEL.test(v.model))
    return refuse("model");
  const settings: AgentSettings = {
    generator: v.generator as Generator,
    model: v.model,
  };
  if (v.duration !== undefined) {
    if (
      typeof v.duration !== "number" ||
      !Number.isFinite(v.duration) ||
      v.duration <= 0 ||
      v.duration > 600
    )
      return refuse("duration");
    settings.duration = v.duration;
  }
  for (const key of ["aspectRatio", "imageAspectRatio"] as const)
    if (v[key] !== undefined) {
      if (typeof v[key] !== "string" || !RATIO.test(v[key] as string))
        return refuse(key);
      settings[key] = v[key] as string;
    }
  if (v.resolution !== undefined) {
    if (typeof v.resolution !== "string" || !SIZE.test(v.resolution))
      return refuse("resolution");
    settings.resolution = v.resolution;
  }
  // Every image tier the studio offers, Klein's 1.5k included.
  if (v.imageResolution !== undefined) {
    if (!(KLEIN_RESOLUTIONS as readonly unknown[]).includes(v.imageResolution))
      return refuse("imageResolution");
    settings.imageResolution = v.imageResolution as string;
  }
  for (const key of ["draft", "cameraEnabled"] as const)
    if (v[key] !== undefined) {
      if (typeof v[key] !== "boolean") return refuse(key);
      settings[key] = v[key] as boolean;
    }
  if (v.camera !== undefined)
    settings.camera = parseTerms(v.camera, cameraSections, "camera");
  if (v.light !== undefined)
    settings.light = parseTerms(v.light, lightGroups, "light");
  if (v.gaps !== undefined) {
    if (!isObject(v.gaps)) return refuse("gaps");
    const gaps: Partial<Record<SlotId, string>> = {};
    for (const [key, text] of Object.entries(v.gaps)) {
      if (!ltxSlots.some((slot) => slot.id === key) || typeof text !== "string")
        return refuse("gaps");
      const clean = plainText(text, GAP_TEXT_MAX);
      if (clean) gaps[key as SlotId] = clean;
    }
    if (Object.keys(gaps).length) settings.gaps = gaps;
  }
  for (const key of ["imageGrounding"] as const)
    if (v[key] !== undefined) {
      if (typeof v[key] !== "boolean") return refuse(key);
      settings[key] = v[key] as boolean;
    }
  if (v.imageSafetyTolerance !== undefined) {
    const t = v.imageSafetyTolerance;
    if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > 4)
      return refuse("imageSafetyTolerance");
    settings.imageSafetyTolerance = t;
  }
  if (v.upscaleFactor !== undefined) {
    const f = v.upscaleFactor;
    if (typeof f !== "number" || !Number.isFinite(f) || f < 1.5 || f > 3)
      return refuse("upscaleFactor");
    settings.upscaleFactor = f;
  }
  if (v.upscaleCreativity !== undefined) {
    if (v.upscaleCreativity !== 0 && v.upscaleCreativity !== 1)
      return refuse("upscaleCreativity");
    settings.upscaleCreativity = v.upscaleCreativity;
  }
  if (v.sourceId !== undefined) {
    if (typeof v.sourceId !== "string" || !SOURCE_ID.test(v.sourceId))
      return refuse("sourceId");
    settings.sourceId = v.sourceId;
  }
  if (v.upscalePrompt !== undefined) {
    if (typeof v.upscalePrompt !== "string") return refuse("upscalePrompt");
    const text = plainText(v.upscalePrompt, UPSCALE_PROMPT_MAX);
    if (text) settings.upscalePrompt = text;
  }
  if (v.acoustic !== undefined) {
    // The same reader the server's request validation uses: known spaces,
    // levels and presets, custom wording within ACOUSTIC_TEXT_LIMIT.
    const acoustic = readAcoustic(v.acoustic);
    if (!acoustic) return refuse("acoustic");
    settings.acoustic = acoustic;
  }
  if (v.runLocation !== undefined) {
    if (v.runLocation !== "local" && v.runLocation !== "cloud")
      return refuse("run location");
    settings.runLocation = v.runLocation;
  }
  return settings;
}

/**
 * Validates a context from a request body; throws an Error whose message is
 * safe to show. Picks beyond `PICKS_MAX` are dropped (the oldest), and a pick
 * repeated later in the list is dropped in favour of its newer place.
 */
export function parseAgentContext(value: unknown): AgentContext {
  if (!isObject(value)) return refuse("shape");
  const { picks, settings } = value;
  if (!Array.isArray(picks) || picks.length > PICKS_MAX * 4)
    return refuse("picks");
  return {
    picks: newestPicks(picks.map(parsePick)),
    ...(value.usage === undefined ? {} : { usage: parseUsage(value.usage) }),
    ...(value.selection === undefined
      ? {}
      : { selection: parseSelection(value.selection) }),
    ...(settings === undefined ? {} : { settings: parseSettings(settings) }),
    ...(value.direction === undefined
      ? {}
      : { direction: parseDirection(value.direction) }),
    ...(value.world === undefined ? {} : { world: parseWorld(value.world) }),
  };
}

/**
 * Newest first, each pick once (a take by job id, an asset by project and
 * asset id), at most `PICKS_MAX`.
 */
export function newestPicks(picks: readonly AgentPick[]) {
  const seen = new Set<string>();
  const out: AgentPick[] = [];
  for (const pick of picks) {
    // An asset id is unique only within its project; a take's job id is global.
    const key =
      pick.kind === "asset"
        ? `asset:${pick.projectId ?? ""}:${pick.id}`
        : `take:${pick.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pick);
    if (out.length === PICKS_MAX) break;
  }
  return out;
}

/** Adds a pick at the front: the newest, once, within the cap. */
export const addPick = (picks: readonly AgentPick[], pick: AgentPick) =>
  newestPicks([pick, ...picks]);

/**
 * The block an agent's brief carries: a short reading guide and the context
 * as one JSON line (control characters and newlines are escaped by JSON, so
 * nothing in a name can end the block).
 */
export function contextBlock(context: AgentContext) {
  return [
    "## The studio's context",
    "",
    "The person's recent picks, newest first, and the composer's current settings, as their studio sent them with this prompt. Read them before you act:",
    "",
    '- "My last pick" is `picks[0]`, "my last two picks" are `picks[0]` and `picks[1]`, and so on. A `take` id is a gallery run (`genobi_job`, `genobi_take`); an `asset` id is a media asset of the Director project named by `projectId` (`genobi_project`).',
    '- "These settings" or "the same settings" are `settings`: pass those values to `genobi_quote` unless the person changes one.',
    "- If the prompt asks for more picks than there are, or for settings that are missing, say so and ask; never invent an id.",
    "- `usage`, when present, records intended reuse and licence preference. Load genobi-licensing before selecting components; explicit instructions in this prompt can update it. Missing rights stay unknown.",
    "- `selection` records creative model family, open-weight preference, local/cloud execution and preferred agent host independently. Pass it to genobi_models with status ready before selecting a generation tool; confirm the destination is available. Never silently fall back outside those choices when no model matches. The explicit current prompt may override preferences. Ask only about missing choices that materially change the task; any means no preference, not permission to spend or waive terms. Open weights are not an open-source or commercial-use licence. Hermes is a host and can use local or hosted models; the agent preference does not switch this running session. Explain a required handoff. Check model/API/input rights separately through genobi-licensing.",
    DIRECTION_GUIDE,
    WORLD_GUIDE,
    "- `note`, when present, says what the studio left out (such as picks from another project); tell the person if the request needs it.",
    "- Model/licence choices use global defaults overlaid with the open project's preferences. Read genobi_project when linked. Today's explicit prompt takes precedence for this session; remember project choices only when asked, using genobi_director_command set-preferences. Never copy session-only intent into global defaults or another project.",
    "",
    "```json genobi-context",
    JSON.stringify(context),
    "```",
  ].join("\n");
}
