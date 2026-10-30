/**
 * World Builder in a session's studio context (issues #18, #23): that the
 * page is open, the preset it last loaded and a one-line summary of the set,
 * so an agent asked to "build this scene" knows where the scene is and which
 * tools reach it. Bounded and plain text only: names and ids, never a
 * recipe, a path or a key. Portable: no Node or DOM APIs.
 */
import { DIRECTOR_ID } from "./director/commands";

/** The summary line, as a context and a "Send to Genobi" message carry it. */
export const WORLD_SUMMARY_MAX = 600;
/** As `world-presets.ts` bounds a preset's name. */
export const WORLD_PRESET_MAX = 40;

export interface AgentWorld {
  /** World Builder is on screen in the studio. */
  open: true;
  /**
   * The Director project open beside it: the only one whose recipe hand-off
   * reaches this World Builder. Absent with no project open.
   */
  projectId?: string;
  /** The preset or named take it last loaded; edits may have followed. */
  preset?: string;
  /** Room, character and motion, camera shot, frames and object ids. */
  summary?: string;
}

/** The tools that reach the open World Builder, in one line. */
export const WORLD_TOOLS =
  "genobi_world_recipe (action send with a full recipe or a named take, on the linked project's copyId) replaces the set in the open World Builder within a few seconds; genobi_world (paired with the World tab's one-use code) moves the character and camera and loads presets. Neither spends or captures: capture stays the person's step.";

/** How an agent reads `world`, for the context block. */
export const WORLD_GUIDE = `- \`world\`, when present, means World Builder is open in the studio: \`preset\` is the preset or named take it last loaded (edits may have followed) and \`summary\` the current set. To change the scene: ${WORLD_TOOLS}`;

/** One line: control characters out, spaces collapsed, bounded. */
export function worldLine(value: string, limit: number) {
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

/** Validates `world`; throws an Error whose message is safe to show. */
export function parseWorld(value: unknown): AgentWorld {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return refuse("world");
  const { open, projectId, preset, summary, ...rest } = value as Record<
    string,
    unknown
  >;
  if (open !== true || Object.keys(rest).length) return refuse("world");
  if (
    projectId !== undefined &&
    (typeof projectId !== "string" || !DIRECTOR_ID.test(projectId))
  )
    return refuse("world project");
  const text = (v: unknown, limit: number, what: string) => {
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.length > limit * 2) return refuse(what);
    return worldLine(v, limit) || undefined;
  };
  const name = text(preset, WORLD_PRESET_MAX, "world preset");
  const line = text(summary, WORLD_SUMMARY_MAX, "world summary");
  return {
    open: true,
    ...(projectId ? { projectId: projectId as string } : {}),
    ...(name ? { preset: name } : {}),
    ...(line ? { summary: line } : {}),
  };
}
