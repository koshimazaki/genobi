import { deployTemplates, deployValues } from "./deploy-workflows";
import { AppError } from "../../server/errors";
import { readyEntry, registry, type ReadyEntry } from "../registry";
import type { GenerateInput } from "../types";
import {
  akuspaceValues,
  akuspaceWorkflow,
  ltxValues,
  ltxWorkflow,
} from "./akuspace";
import { h3Workflow } from "./h3";
import { kleinValues, kleinWorkflow } from "./klein";
import { swapValues, swapWorkflow } from "./openjutsu";
import { musicValues, musicWorkflow } from "./music";
import { seedvr2Values, seedvr2Workflow } from "./seedvr2";
import type { WorkflowTemplate } from "./workflow";

/**
 * Workflow swapping: the graphs that can stand behind each capability, and
 * which one a `workflow` registry entry runs. An entry's model names its
 * default template (`workflow/{template id}`); a session may swap it for any
 * other template that serves the entry's capability (`server/workflow-settings.ts`).
 * Both adapters fill slots through this table, so a template and its values
 * cannot be paired differently on the two.
 */
export const CAPABILITIES = [
  "deployed-ltx",
  "text-to-video",
  "image",
  "upscale",
  "acoustic-space",
  "layout-to-render",
  "reference-to-video",
  "character-swap",
  "text-to-music",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "deployed-ltx": "Comfy Deploy LTX",
  "text-to-video": "Text to video",
  image: "Image",
  upscale: "Upscale",
  "acoustic-space": "Acoustic space",
  "layout-to-render": "Layout to render",
  "reference-to-video": "References to video",
  "character-swap": "Character swap",
  "text-to-music": "Text to music",
};

export interface TemplateChoice {
  /** The template's id, the same as `template.id`. */
  id: string;
  /** How the picker names it. */
  label: string;
  /** What it can stand behind; the first is what it was made for. */
  capabilities: Capability[];
  template: WorkflowTemplate;
  values: (input: GenerateInput, prompt: string) => Record<string, unknown>;
}

export const workflowTemplates: TemplateChoice[] = [
  ...deployTemplates.map((template): TemplateChoice => ({
    id: template.id,
    label: template.id,
    capabilities: ["deployed-ltx"],
    template,
    values: (input, prompt) => deployValues(template, input, prompt),
  })),
  ...(["rgb", "canny", "depth", "combined"] as const).map(
    (guide): TemplateChoice => {
      const template = h3Workflow(guide);
      return {
        id: template.id,
        label: `FastH3 OmniRef · ${guide.toUpperCase()} guide`,
        capabilities: ["reference-to-video"],
        template,
        values: (_input, prompt) => ({ prompt }),
      };
    },
  ),
  {
    id: akuspaceWorkflow.id,
    label: "LTX-2.5 with the AKUSPACE LoRA",
    capabilities: ["acoustic-space"],
    template: akuspaceWorkflow,
    values: akuspaceValues,
  },
  {
    id: ltxWorkflow.id,
    label: "LTX-2.5 without the LoRA (treatment in the prompt only)",
    capabilities: ["text-to-video", "acoustic-space"],
    template: ltxWorkflow,
    values: ltxValues,
  },
  {
    id: kleinWorkflow.id,
    label: "FLUX 3 Image Klein, Comfy's official text-to-image graph",
    capabilities: ["image"],
    template: kleinWorkflow,
    values: kleinValues,
  },
  {
    id: swapWorkflow.id,
    label: "Openjutsu character swap (MiniMax H3, Akatz Labs' swap LoRA)",
    capabilities: ["character-swap"],
    template: swapWorkflow,
    values: swapValues,
  },
  {
    id: musicWorkflow.id,
    label: "MiniMax Music 3, Comfy's official text-to-music graph",
    capabilities: ["text-to-music"],
    template: musicWorkflow,
    values: (input, prompt) => musicValues(input, prompt),
  },
  {
    id: seedvr2Workflow.id,
    label: "SeedVR2 3B video upscale, Comfy's official open graph",
    capabilities: ["upscale"],
    template: seedvr2Workflow,
    values: (input) => seedvr2Values(input),
  },
];

/** The capability each `workflow` registry entry offers. */
const ENTRY_CAPABILITY: Record<string, Capability> = {
  "minimax-h3": "reference-to-video",
  "minimax-h3-canny": "reference-to-video",
  "minimax-h3-depth": "reference-to-video",
  "minimax-h3-combined": "reference-to-video",
  "ltx-2-5-akuspace": "acoustic-space",
  "ltx-2-5-open": "text-to-video",
  "flux-3-klein": "image",
  "openjutsu-swap": "character-swap",
  "minimax-music-3": "text-to-music",
  "seedvr2-upscale": "upscale",
};

export const templateById = (id: unknown) =>
  workflowTemplates.find((choice) => choice.id === id);

/** The templates that can stand behind a capability, in table order. */
export const templatesFor = (capability: Capability) =>
  workflowTemplates.filter((choice) =>
    choice.capabilities.includes(capability),
  );

/** The ready `workflow` entries, each with its capability and default template. */
export function workflowEntries(entries = registry) {
  return entries.flatMap((entry) => {
    if (entry.status !== "ready" || entry.route !== "workflow") return [];
    const capability = entry.deploymentOnly
      ? "deployed-ltx"
      : ENTRY_CAPABILITY[entry.id];
    const fallback = templateById(entry.model.slice("workflow/".length));
    return capability && fallback
      ? [{ entry, capability, defaultTemplate: fallback.id }]
      : [];
  });
}

/** The workflow entry a registry model id names, such as `workflow/flux-3-klein-t2i`. */
export const workflowEntryOf = (model: string) =>
  workflowEntries().find(({ entry }) => entry.model === model);

const mismatch = (message: string) =>
  new AppError(400, message, "workflow_mismatch");

/**
 * The template a session may run behind an entry, or a refusal: the entry
 * must be a ready `workflow` entry, the template must exist, and it must serve
 * the entry's capability. Without a template, the entry's default.
 */
export function requireTemplateFor(
  entryId: unknown,
  templateId?: unknown,
): { entry: ReadyEntry; capability: Capability; choice: TemplateChoice } {
  const found = workflowEntries().find(
    ({ entry }) => entry.id === entryId && readyEntry(entry.id),
  );
  if (!found) throw mismatch("Choose a model that runs as a workflow.");
  const choice = templateById(templateId ?? found.defaultTemplate);
  if (!choice) throw mismatch("That workflow is not in this build.");
  if (
    (found.entry.deploymentOnly &&
      choice.id !== found.defaultTemplate &&
      !(
        found.entry.id === "ltx-deploy-layout-to-video" &&
        choice.id === "world-builder-l2r-a2v-studio"
      )) ||
    !choice.capabilities.includes(found.capability)
  )
    throw mismatch(
      `That workflow cannot stand behind ${CAPABILITY_LABEL[found.capability]}.`,
    );
  return { entry: found.entry, capability: found.capability, choice };
}

/** Slot names a local model map may fill: the template's `model` slots. */
export const modelSlots = (template: WorkflowTemplate) =>
  Object.entries(template.slots)
    .filter(([, slot]) => slot.kind === "model")
    .map(([name]) => name);

/** The node types a graph uses: what a local ComfyUI must have before a run. */
export const nodeTypes = (template: WorkflowTemplate) =>
  [...new Set(Object.values(template.graph).map((n) => n.class_type))].sort();

/** A template as the studio and agents see it: no graph, no model file names. */
export const publicTemplate = (choice: TemplateChoice) => ({
  id: choice.id,
  label: choice.label,
  capabilities: choice.capabilities,
  file: choice.template.file,
  requiredNodes: choice.template.requiredNodes,
  modelSlots: modelSlots(choice.template),
  ...(choice.template.hosts ? { hosts: choice.template.hosts } : {}),
});

/**
 * What a session runs behind each workflow entry. `selected` is the session's
 * choice; `fixed` says the adapter cannot swap (the hosted Worker).
 */
export function workflowCatalogue(
  selected: (entryId: string) => string | undefined = () => undefined,
  fixed = false,
  /** The settings revision it reflects (`RunLocationState.revision`). */
  revision = 0,
  deploymentRegistered = false,
) {
  // The hosted Worker (`fixed`) lists no local-only entry, nor a capability
  // and template that only such an entry runs.
  const listed = workflowEntries().filter(
    ({ entry }) =>
      !(fixed && entry.localOnly) &&
      (!entry.deploymentOnly || deploymentRegistered),
  );
  const hidden = new Set(
    workflowEntries()
      .filter(
        ({ entry }) =>
          (fixed && entry.localOnly) ||
          (entry.deploymentOnly && !deploymentRegistered),
      )
      .map(({ capability }) => capability)
      .filter((cap) => !listed.some(({ capability }) => capability === cap)),
  );
  return {
    revision,
    fixed,
    capabilities: CAPABILITIES.filter((cap) => !hidden.has(cap)).map(
      (capability) => ({
        id: capability,
        label: CAPABILITY_LABEL[capability],
        templates: templatesFor(capability).map((choice) => choice.id),
      }),
    ),
    templates: workflowTemplates
      .filter((choice) => !choice.capabilities.every((cap) => hidden.has(cap)))
      .map(publicTemplate),
    entries: listed.map(({ entry, capability, defaultTemplate }) => ({
      entry: entry.id,
      capability,
      default: defaultTemplate,
      selected: selected(entry.id) ?? defaultTemplate,
      templates: templatesFor(capability)
        .filter(
          (choice) =>
            !entry.deploymentOnly ||
            choice.id === defaultTemplate ||
            (entry.id === "ltx-deploy-layout-to-video" &&
              choice.id === "world-builder-l2r-a2v-studio"),
        )
        .map((choice) => choice.id),
    })),
  };
}
export type WorkflowCatalogue = ReturnType<typeof workflowCatalogue>;
