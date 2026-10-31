import { cutTo, promptsInstruction } from "../../shared/director/prompt-send";
import { REGENERATE_INSTRUCTION_MAX } from "../../shared/director/regenerate";
import type { HouseTemplate } from "../../shared/templates/types";
import type { Bundle } from "./bundle";
import { feedbackOf } from "./feedback-file";
import { resolveBrief } from "./prompt-brief";

/** Keep the complete request inside Send's limit; the linked copy holds the full brief. */
export function versionInstruction(
  bundle: Bundle,
  template: HouseTemplate,
  make: string[],
) {
  const brief = resolveBrief(bundle);
  const required = [
    `Make my version of ${template.name} on this existing linked project. Read its current revision, actual asset files, complete brief/prompt.json with every reference binding, and generationPlans first.`,
    `Generate a replacement for these input slot IDs: ${make.join(", ") || "none"}. Reuse current media for every other slot.`,
    "My saved Make it yours description and character/style references take priority over template defaults. Ask for missing direction; do not infer original prompts from demo footage.",
    "Keep current media, timing, source in-points, graphics and edits until approved results are ready. Show each paid quote and total; wait for explicit approval in the studio bubble. This is not spending approval. Persist idempotency first; never retry an uncertain submission. Apply results with revision checks and preview; keep existing media on failure.",
  ].join("\n");
  if (required.length > REGENERATE_INSTRUCTION_MAX - 120)
    throw new Error(
      "Too many generation choices for one handoff. Select fewer replacements.",
    );
  const direction = promptsInstruction(bundle.project, feedbackOf(bundle)).text;
  const excerpt = `\nSaved brief: ${brief.prompt}\n${direction}`;
  return (
    required +
    cutTo(
      excerpt,
      REGENERATE_INSTRUCTION_MAX - required.length,
      "… Read the full linked project brief and directions.",
    )
  );
}
