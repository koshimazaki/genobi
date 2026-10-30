/**
 * The open project's direction in a session's studio context: its global
 * prompt and the selected clip's prompt and typed directions, so an agent
 * started from the Editor reads what the person wrote for the piece and for
 * the clip in front of them. Validated like the rest of the context; the
 * server keeps it only for the project the session is linked to.
 */
import { DIRECTOR_ID } from "./director/commands";
import {
  CLIP_PROMPT_LIMIT,
  cleanPrompt,
  readDirections,
  type LayerDirections,
} from "./director/directions";
import type { Layer, Project } from "./director/types";

/**
 * The global prompt as a session carries it, inside the 24 kB start body with
 * room for picks and settings; the rest is in genobi_project.
 */
export const DIRECTION_CONTEXT_PROMPT_MAX = 2000;
const KINDS: readonly Layer["kind"][] = [
  "audio",
  "video",
  "image",
  "graphics",
  "filter",
];
const NAME_MAX = 120;

export interface AgentDirection {
  /** The Director project these belong to. */
  projectId: string;
  globalPrompt?: string;
  /** True when `globalPrompt` was cut to `DIRECTION_CONTEXT_PROMPT_MAX`. */
  globalPromptCut?: true;
  /** The clip selected in the Editor, when there is one. */
  clip?: {
    layerId: string;
    name: string;
    kind: Layer["kind"];
    prompt?: string;
    directions?: LayerDirections;
  };
}

const refuse = (what: string): never => {
  throw new Error(`The studio context's ${what} is not valid.`);
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Text kept with its line breaks, bounded; undefined when blank. */
function text(value: unknown, limit: number, what: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > limit) return refuse(what);
  const clean = cleanPrompt(value).trim();
  return clean || undefined;
}

export function parseDirection(value: unknown): AgentDirection {
  if (!isObject(value)) return refuse("direction");
  const { projectId, globalPrompt, globalPromptCut, clip, ...rest } = value;
  if (Object.keys(rest).length) return refuse("direction");
  if (typeof projectId !== "string" || !DIRECTOR_ID.test(projectId))
    return refuse("direction project");
  if (globalPromptCut !== undefined && globalPromptCut !== true)
    return refuse("direction");
  const words = text(
    globalPrompt,
    DIRECTION_CONTEXT_PROMPT_MAX,
    "global prompt",
  );
  const out: AgentDirection = {
    projectId,
    ...(words ? { globalPrompt: words } : {}),
    ...(words && globalPromptCut ? { globalPromptCut } : {}),
  };
  if (clip === undefined) return out;
  if (!isObject(clip)) return refuse("clip");
  const { layerId, name, kind, prompt, directions, ...extra } = clip;
  if (Object.keys(extra).length) return refuse("clip");
  if (typeof layerId !== "string" || !DIRECTOR_ID.test(layerId))
    return refuse("clip id");
  if (!KINDS.includes(kind as Layer["kind"])) return refuse("clip kind");
  if (typeof name !== "string" || name.length > NAME_MAX)
    return refuse("clip name");
  const clipPrompt = text(prompt, CLIP_PROMPT_LIMIT, "clip prompt");
  let typed: LayerDirections | undefined;
  if (directions !== undefined)
    try {
      // Every field set (a context sends no nulls), checked as a command is.
      typed = readDirections(directions) as LayerDirections;
      if (Object.values(typed).includes(null as never)) refuse("directions");
    } catch {
      return refuse("clip directions");
    }
  out.clip = {
    layerId,
    name: cleanPrompt(name).replace(/\s+/g, " ").trim() || layerId,
    kind: kind as Layer["kind"],
    ...(clipPrompt ? { prompt: clipPrompt } : {}),
    ...(typed ? { directions: typed } : {}),
  };
  return out;
}

/** Where to cut `text` to `max` UTF-16 units without halving a surrogate pair. */
export function cutAt(text: string, max: number) {
  if (text.length <= max) return text.length;
  const last = text.charCodeAt(max - 1);
  return last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
}

/**
 * The direction the studio sends: the project's global prompt and the
 * selected clip's own fields. Undefined when there is nothing to tell.
 */
export function projectDirection(
  project: Project | undefined,
  selected: string | undefined,
): AgentDirection | undefined {
  if (!project || !DIRECTOR_ID.test(project.id)) return undefined;
  const layer = project.layers.find((l) => l.id === selected);
  const words = project.globalPrompt?.trim();
  if (!words && !layer) return undefined;
  const cut = !!words && words.length > DIRECTION_CONTEXT_PROMPT_MAX;
  return {
    projectId: project.id,
    ...(words
      ? {
          globalPrompt: words.slice(
            0,
            cutAt(words, DIRECTION_CONTEXT_PROMPT_MAX),
          ),
        }
      : {}),
    ...(cut ? { globalPromptCut: true as const } : {}),
    ...(layer
      ? {
          clip: {
            layerId: layer.id,
            name: layer.name,
            kind: layer.kind,
            ...(layer.prompt ? { prompt: layer.prompt } : {}),
            ...(layer.directions ? { directions: layer.directions } : {}),
          },
        }
      : {}),
  };
}

/** How an agent reads `direction`, for the context block. */
export const DIRECTION_GUIDE =
  "- `direction`, when present, is the open project's `globalPrompt` (the primary direction for the whole piece; `globalPromptCut` means genobi_project has the rest) and `clip`, the clip the person has selected: its own `prompt` and typed `directions` (`shot` and `lens` are creative labels, not model parameters; `camera` is Genobi's camera terms; `action` is how the subject moves). The prompt text and the typed directions are separate: if they disagree, say so and ask rather than choosing one. This prompt's explicit request outranks saved directions. Editing a prompt never spends; changing one does not regenerate anything.";
