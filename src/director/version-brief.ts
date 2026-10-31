import { versionTemplate } from "../../shared/templates/version";
import type { Bundle } from "./bundle";
import { BRIEF_PATH, readBrief, type PromptBrief } from "./prompt-brief";

/** Declared template direction only, never an inferred original footage prompt. */
export function readVersionBrief(bundle: Bundle): PromptBrief {
  const brief = readBrief(bundle);
  const template = versionTemplate(bundle.project);
  if (bundle.files.has(BRIEF_PATH) || !template) return brief;
  const { style } = template;
  return {
    ...brief,
    text: [
      `Template direction: ${template.name}`,
      `${template.inputs.subject.label}: ${template.inputs.subject.default}`,
      `Look: ${style.look}`,
      `Lighting: ${style.lighting}`,
      `Palette: ${style.palette}`,
    ].join("\n"),
  };
}
