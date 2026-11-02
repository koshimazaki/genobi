import type { Project } from "../../shared/director/types";
import { BLOOM_PROMPT, BLOOM_SHEET } from "../../shared/templates/bloom-teaser";
import type { VersionSlot } from "../../shared/templates/version";
import { versionTemplate } from "../../shared/templates/version";
import { fillPrompt, promptById } from "../voice/prompt-target";

/**
 * Recreate in Camera (#57, swap only): a template slot's way to new media.
 * It never generates and never swaps anything in. It opens Camera and, only
 * when the slot's media carries a recorded prompt, restores that prompt into
 * Camera's own prompt field. With nothing recorded it is "Create in Camera"
 * and leaves Camera as it was. The person runs Camera themselves; the result
 * lands in Assets → Generated, and they drop it onto the slot.
 */
export interface CameraRecipe {
  label: "Recreate in Camera" | "Create in Camera";
  prompt?: string;
  /** A recorded reference image the prompt names; shown, never attached. */
  reference?: string;
}

/**
 * Prompts recorded for a finished mix's bundled media, by template and slot.
 * Only what the repository actually records: Bloom's owner prompt and its
 * character sheet (`shared/templates/bloom-teaser.ts`). Dimensions records
 * cut points, not per-creature prompts, so it has none.
 */
const RECORDED: Record<
  string,
  Record<string, { prompt: string; reference: string }>
> = {
  "bloom-teaser": {
    "bloom-h3-a": { prompt: BLOOM_PROMPT, reference: BLOOM_SHEET },
    "bloom-h3-b": { prompt: BLOOM_PROMPT, reference: BLOOM_SHEET },
  },
};

/** What Recreate can restore for the slot's current media, if anything. */
export function cameraRecipe(
  project: Project,
  slot: VersionSlot,
  ids: readonly string[],
): CameraRecipe {
  const id = ids[0];
  const asset =
    id && Object.hasOwn(project.assets, id) ? project.assets[id] : undefined;
  if (asset?.generationId) {
    const generation = project.generations.find(
      (g) => g.id === asset.generationId,
    );
    const prompt = generation?.prompt.trim();
    if (prompt) return { label: "Recreate in Camera", prompt };
  }
  const template = versionTemplate(project);
  const recorded = template && RECORDED[template.id]?.[slot.id];
  if (recorded && id === slot.defaultAsset && asset?.origin === "fixture")
    return { label: "Recreate in Camera", ...recorded };
  return { label: "Create in Camera" };
}

/**
 * Opens Camera and fills its prompt once the field is on screen (a few
 * frames, since the composer mounts after the switch). Typing-equivalent, so
 * the composer's own state and limits stay in charge; Generate is not pressed.
 */
export function openInCamera(
  select: (preset: "camera") => void,
  recipe: CameraRecipe,
) {
  select("camera");
  const prompt = recipe.prompt;
  if (!prompt || typeof requestAnimationFrame === "undefined") return;
  let frames = 30;
  const tryFill = () => {
    const field = promptById("description");
    if (field) fillPrompt(prompt, field);
    else if (--frames > 0) requestAnimationFrame(tryFill);
  };
  requestAnimationFrame(tryFill);
}
