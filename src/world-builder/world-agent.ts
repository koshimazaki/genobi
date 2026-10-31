/**
 * World Builder for an agent (issues #18, #23): a compact, bounded line
 * describing the set, and the message "Send to Genobi" hands the running
 * session, or a new one: the scene direction, that line and which tools
 * change the scene. Never the 64 KB recipe; never a capture or a spend.
 */
import { useEffect } from "react";
import { AGENT_PROMPT_MAX } from "../../shared/agent-session";
import {
  WORLD_PRESET_MAX,
  WORLD_SUMMARY_MAX,
  WORLD_TOOLS,
  worldLine,
} from "../../shared/agent-context-world";
import { forgetWorldPreset, noteWorld } from "../agent/world-context";
import { useStudio } from "../studio/useStudio";
import { roomPresets } from "./room-presets";
import type { Recipe } from "./recipe";

/** At most this many object ids are named; the rest are counted. */
export const SUMMARY_OBJECTS = 12;
/** The scene direction as a message carries it; the recipe allows 4000. */
export const MESSAGE_PROMPT_MAX = 2400;

/** The room preset whose floor this set still has, "custom room", or none. */
export function worldRoom(recipe: Recipe) {
  if (recipe.motion?.room)
    return `${recipe.motion.room.id} (single-room acoustic ${recipe.motion.room.visible ? "enclosure" : "proxy"})`;
  const floor = recipe.objects.find((o) => o.id === "room-floor");
  if (!floor) return undefined;
  const same = (a?: number, b?: number) => Math.abs((a ?? 1) - (b ?? 1)) < 1e-6;
  for (const [name, room] of Object.entries(roomPresets)) {
    const own = room.objects?.find((o) => o.id === "room-floor");
    if (
      own &&
      same(own.scale, floor.scale) &&
      same(own.scaleX, floor.scaleX) &&
      same(own.scaleY, floor.scaleY)
    )
      return name;
  }
  return "custom room";
}

function character(recipe: Recipe) {
  if (!recipe.avatar) return "no character";
  const motion = Array.isArray(recipe.avatarMotion)
    ? recipe.avatarMotion.map((step) => step.clip).join(" → ")
    : recipe.avatarMotion;
  return `${recipe.avatarAsset}, ${motion}`;
}

/**
 * One line: preset, room, character and motion, camera shot, frames and
 * object ids, within `WORLD_SUMMARY_MAX`. Ids that would not fit are
 * counted rather than cut.
 */
export function sceneSummary(recipe: Recipe, preset?: string) {
  const name = preset && worldLine(preset, WORLD_PRESET_MAX);
  const head = worldLine(
    [
      name ? `preset ${name}` : "",
      `room ${worldRoom(recipe) ?? `none (${recipe.scene})`}`,
      `character ${character(recipe)}`,
      ...(recipe.motion
        ? [
            `motion ${recipe.motion.stateKeys.map((k) => k.label).join(" → ")}`,
            `${recipe.motion.instances?.count ?? 0} voxels`,
          ]
        : []),
      `camera shot ${recipe.cameraShot}`,
      `${recipe.frames} frames (${(recipe.frames / recipe.fps).toFixed(1)} s) at ${recipe.width}×${recipe.height}`,
    ]
      .filter(Boolean)
      .join(" · "),
    WORLD_SUMMARY_MAX,
  );
  const ids = recipe.objects.map((o) => o.id);
  if (!ids.length) return worldLine(`${head} · no objects`, WORLD_SUMMARY_MAX);
  // Room for the count of the ids left out (" and 24 more").
  const budget = WORLD_SUMMARY_MAX - head.length - " · objects ".length - 13;
  const shown: string[] = [];
  for (const id of ids.slice(0, SUMMARY_OBJECTS)) {
    if ([...shown, id].join(", ").length > budget) break;
    shown.push(id);
  }
  const rest = ids.length - shown.length;
  const list = shown.length
    ? `${shown.join(", ")}${rest ? ` and ${rest} more` : ""}`
    : `${rest} (ids in the recipe)`;
  return worldLine(`${head} · objects ${list}`, WORLD_SUMMARY_MAX);
}

/** Line breaks kept, every other control character out. */
const clean = (text: string) =>
  text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim(); // eslint-disable-line no-control-regex

/**
 * What "Send to Genobi" sends: the scene direction, the current set and the
 * tools that change it, within the session's prompt limit. Empty when there
 * is no direction to send.
 */
export function worldMessage(prompt: string, recipe: Recipe, preset?: string) {
  let words = clean(prompt);
  if (!words) return "";
  if (words.length > MESSAGE_PROMPT_MAX)
    words = `${words.slice(0, MESSAGE_PROMPT_MAX).trimEnd()}…`;
  return [
    `Build this scene in World Builder: ${words}`,
    `Current set (World Builder is open): ${sceneSummary(recipe, preset)}.`,
    `To change it: ${WORLD_TOOLS}`,
  ]
    .join("\n\n")
    .slice(0, AGENT_PROMPT_MAX);
}

/**
 * While World Builder is on screen, a session started from anywhere in the
 * studio is told so (`studioContext`); it is forgotten when the page leaves.
 */
export function useWorldAgent(recipe: Recipe, active: boolean) {
  const projectId = useStudio((state) => state.director.bundle?.project.id);
  useEffect(() => {
    if (!active) return noteWorld(undefined);
    // The preset is its own field, added when a session start reads it.
    noteWorld({
      open: true,
      ...(projectId ? { projectId } : {}),
      summary: sceneSummary(recipe),
    });
    return () => noteWorld(undefined);
  }, [recipe, active, projectId]);
  // Closing World Builder or changing project forgets the last preset.
  useEffect(() => forgetWorldPreset, [projectId]);
}
