/**
 * What the open World Builder tells an agent session (issues #18, #23): set
 * while the page is on screen (`useWorldAgent`), cleared when it leaves, and
 * read once by a session start (`studioContext`). Kept in memory for this
 * page only, never stored or logged.
 */
import {
  WORLD_PRESET_MAX,
  worldLine,
  type AgentWorld,
} from "../../shared/agent-context-world";

let world: AgentWorld | undefined;
/** The preset last loaded, and the project open when it was. */
let preset: { name: string; projectId?: string } | undefined;

/** The open page's set (its summary); undefined when World Builder leaves. */
export function noteWorld(next: AgentWorld | undefined) {
  world = next;
}

/**
 * What a session start reads: the open page, with the preset it last loaded
 * while this same project was open.
 */
export const currentWorld = (): AgentWorld | undefined =>
  world && {
    ...world,
    ...(preset && preset.projectId === world.projectId
      ? { preset: worldLine(preset.name, WORLD_PRESET_MAX) }
      : {}),
  };

/** The preset or named take World Builder last loaded; undefined after a recipe. */
export function noteWorldPreset(name: string | undefined) {
  preset = name ? { name, projectId: world?.projectId } : undefined;
}
export const worldPreset = () => preset?.name;

/** World Builder closed or its project changed: the preset is forgotten. */
export function forgetWorldPreset() {
  preset = undefined;
}

/** Tests start from nothing. */
export function resetWorldContext() {
  world = undefined;
  preset = undefined;
}
