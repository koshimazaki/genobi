import { isKleinEdit, kleinEditTemplate, kleinEditValues } from "./klein-edit";
import { kleinBaseEditTemplate, kleinBaseEditValues } from "./klein-base";
import type { GenerateInput } from "../types";
import {
  requireTemplateFor,
  workflowEntryOf,
  workflowTemplates,
} from "./workflows";
import type { DestinationKind } from "./destination";
import {
  unsent,
  VIDEO_OUTPUT,
  type WorkflowOutput,
  type WorkflowTemplate,
} from "./workflow";

/**
 * The registry's `workflow` model ids and the template each runs by default,
 * from the template table (`shared/comfy/workflows.ts`). A session that swapped
 * the template names it; the take records it, so a poll reads the same one.
 */
export const workflows: Record<string, WorkflowTemplate> = Object.fromEntries(
  workflowTemplates.map((choice) => [`workflow/${choice.id}`, choice.template]),
);

function choiceFor(model: string, templateId?: string) {
  const found = workflowEntryOf(model);
  if (!found) throw unsent("This workflow is not in this build.");
  try {
    return requireTemplateFor(found.entry.id, templateId).choice;
  } catch {
    throw unsent("This workflow cannot run behind this model.");
  }
}

/**
 * The template and filled values for one run, or a refusal before anything
 * is sent. A template that names its hosts runs only on one of them: the
 * hosted Worker, which records no location, never sends the swap to Cloud.
 */
export function workflowRun(
  model: string,
  input: GenerateInput,
  prompt: string,
  templateId?: string,
  location?: DestinationKind,
) {
  const choice = choiceFor(model, templateId);
  if (choice.id === "flux-3-klein-base-t2i" && isKleinEdit(input))
    return {
      template: kleinBaseEditTemplate(input.imageReferences!.length),
      values: kleinBaseEditValues(input, prompt),
    };
  if (choice.id === "flux-3-klein-t2i" && isKleinEdit(input))
    return {
      template: kleinEditTemplate(input.imageReferences!.length),
      values: kleinEditValues(input, prompt),
    };
  const hosts = choice.template.hosts as readonly string[] | undefined;
  if (hosts && !hosts.includes(location ?? "cloud"))
    throw unsent(
      "This workflow runs only on its own Comfy deployment, from the local studio.",
    );
  return { template: choice.template, values: choice.values(input, prompt) };
}

/** Which output a finished run of the model (and template, if swapped) is read from. */
export function workflowOutput(
  model: string,
  templateId?: string,
): WorkflowOutput {
  try {
    return choiceFor(model, templateId).template.output ?? VIDEO_OUTPUT;
  } catch {
    return VIDEO_OUTPUT;
  }
}
