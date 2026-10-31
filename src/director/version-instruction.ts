import { cutTo, promptsInstruction } from "../../shared/director/prompt-send";
import { REGENERATE_INSTRUCTION_MAX } from "../../shared/director/regenerate";
import type { HouseTemplate } from "../../shared/templates/types";
import type { Bundle } from "./bundle";
import { feedbackOf } from "./feedback-file";
import { resolveBrief } from "./prompt-brief";
import { versionTextInputs } from "./version-inputs";

/** Keep the complete request inside Send's limit; the linked copy holds the full brief. */
export function versionInstruction(
  bundle: Bundle,
  template: HouseTemplate,
  make: string[],
) {
  const brief = resolveBrief(bundle);
  const { subject, title } = versionTextInputs(bundle, template);
  const required = [
    `Make my version of ${template.name} on this linked project. First read revision, asset files, complete brief/prompt.json with bindings, and generationPlans.`,
    `Current Words: ${JSON.stringify({ subject, title })}. Override template defaults; retain longer custom headlines on layers.`,
    `Replace slot IDs: ${make.join(", ") || "none"}. Reuse other media.`,
    "Follow saved description and references. Ask about missing/conflicting direction; never infer original demo prompts.",
    "Keep media, timing, in-points and edits until results are approved. Show paid quotes and total; wait for explicit approval in the studio bubble. No spending approved here. Persist idempotency first; never retry uncertain submissions. Apply with revision checks and preview; keep media on failure.",
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
  ).trimEnd();
}
