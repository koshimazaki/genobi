import { versionTemplate } from "../../shared/templates/version";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import type { Bundle } from "./bundle";
import { BRIEF_PATH, readBrief, type PromptBrief } from "./prompt-brief";

/** Declared template direction only, never an inferred original footage prompt. */
export function readVersionBrief(bundle: Bundle): PromptBrief {
  const brief = readBrief(bundle);
  const template = versionTemplate(bundle.project);
  if (bundle.files.has(BRIEF_PATH) || !template) return brief;
  const { style } = template;
  const inputs =
    bundle.project.template?.id === template.id
      ? bundle.project.template.inputs
      : undefined;
  return {
    ...brief,
    text: [
      `Template direction: ${template.name}`,
      `${template.inputs.subject.label}: ${inputs?.subject ?? template.inputs.subject.default}`,
      `${template.inputs.title.label}: ${inputs?.title ?? template.inputs.title.default}`,
      `Look: ${style.look}`,
      `Lighting: ${style.lighting}`,
      `Palette: ${style.palette}`,
    ].join("\n"),
  };
}

/** Update generated Words lines only; leave the person's own description intact. */
export function versionBriefWords(
  brief: PromptBrief,
  template: HouseTemplate,
  previous: TemplateInputs,
  next: TemplateInputs,
): PromptBrief {
  let text = brief.text;
  for (const key of ["subject", "title"] as const) {
    const label = template.inputs[key].label;
    const oldLines = [previous[key], template.inputs[key].default].map(
      (value) => `${label}: ${value}`,
    );
    text = text
      .split("\n")
      .map((line) =>
        oldLines.includes(line) ? `${label}: ${next[key]}` : line,
      )
      .join("\n");
  }
  return text === brief.text ? brief : { ...brief, text };
}
