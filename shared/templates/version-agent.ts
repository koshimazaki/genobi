/**
 * Make my version, with the agent (owner's decision, 4 November 2026: "giving
 * assets invokes it ... and text should be with what"). The person drops one
 * reference into a mix template's Make my version and says what it replaces;
 * the reference steers the look and is not swapped into the video. That pair
 * becomes the first turn of an agent session that loads the template's
 * skill from the Genobi plugin. Portable: no framework, Node or DOM APIs.
 */
import { AGENT_PROMPT_MAX } from "../agent-session";
import type { HouseTemplate } from "./types";

/**
 * The mix templates whose skill ships in the Genobi plugin as
 * `plugins/genobi/skills/<template-id>/SKILL.md`. A const, because the
 * studio cannot read the plugin's folder and the template catalogue does not
 * carry a skill field; add an id here in the same change as its skill.
 */
export const VERSION_AGENT_TEMPLATES: readonly string[] = [
  "fruits-swap",
  "audio-reactive-drop",
  "adaptive-reverb",
  "bloom-teaser",
];

/** True for a mix template whose skill the agent can load. */
export const hasVersionAgent = (template: Pick<HouseTemplate, "id" | "mix">) =>
  !!template.mix && VERSION_AGENT_TEMPLATES.includes(template.id);

/** The "With what?" field's limit, well inside the agent prompt's. */
export const WITH_WHAT_MAX = 600;
const FILE_NAME_MAX = 120;

// As parseAgentMessage strips them; a line break becomes a space so the
// person's sentence stays one quoted line.
const clean = (text: string) =>
  text.replace(/[\r\n]+/g, " ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

export interface VersionAgentAsset {
  /** The project asset id, as `asset-<uuid>`. */
  id: string;
  /** The file name as stored in the project. */
  name: string;
  kind: "image" | "audio" | "video";
}

const KIND_WORD = { image: "an image", audio: "a track", video: "a clip" };

/**
 * The first turn of the session: the template, the skill to load, the
 * person's reference by asset id and file name when they dropped one (the
 * line is left out otherwise), their sentence quoted verbatim (control
 * characters stripped, within `AGENT_PROMPT_MAX`), and the rule that every
 * paid step is quoted and approved first. Throws a sentence safe to show.
 */
export function versionAgentPrompt(
  template: Pick<HouseTemplate, "id" | "name">,
  asset: VersionAgentAsset | undefined,
  withWhat: string,
) {
  if (asset && !/^[A-Za-z0-9_-]{1,80}$/.test(asset.id))
    throw new Error("That asset id is not valid.");
  const words = clean(withWhat).trim();
  if (!words) throw new Error("Say what you want to make.");
  if (words.length > WITH_WHAT_MAX)
    throw new Error(`Keep it under ${WITH_WHAT_MAX} characters.`);
  const name =
    asset && (clean(asset.name).trim().slice(0, FILE_NAME_MAX) || "media");
  const prompt = [
    `Make my version of the ${template.name} template (${template.id}), open in Director.`,
    `Load the skill \`${template.id}\` from the Genobi plugin and follow it.`,
    ...(asset
      ? [
          `The person dropped ${KIND_WORD[asset.kind]} as a reference, not a file to swap into the video: the person's reference asset ${asset.id}, file "${name}". It steers the look; their sentence says what it replaces.`,
        ]
      : []),
    `In their words: "${words}"`,
    asset
      ? "Link the open project and look at the reference and the cut. Where the template renders with LTX-2.5 Layout-to-Render, write the prompt for the first still from the reference, build the moving asset in Three.js, then render; tell the person your plan first."
      : "Link the open project and look at the cut. Where the template renders with LTX-2.5 Layout-to-Render, write the prompt for the first still from their words, build the moving asset in Three.js, then render; tell the person your plan first.",
    "Quote every paid step and wait for the person's approval before you run it; start no paid job without it.",
  ].join("\n");
  if (prompt.length > AGENT_PROMPT_MAX)
    throw new Error(`Keep it under ${WITH_WHAT_MAX} characters.`);
  return prompt;
}
