import { describe, expect, it } from "vitest";
import { registry } from "../shared/registry";
import { workflowOutput, workflowRun } from "../shared/comfy/runs";
import { danglingLinks, fillSlots, isLink } from "../shared/comfy/slots";
import { isUnsent } from "../shared/comfy/workflow";
import {
  CAPABILITIES,
  modelSlots,
  nodeTypes,
  requireTemplateFor,
  templatesFor,
  workflowCatalogue,
  workflowEntries,
  workflowTemplates,
} from "../shared/comfy/workflows";
import type { GenerateInput } from "../shared/types";

const acoustic = {
  generator: "video",
  model: "ltx-2.5-akuspace",
  duration: 6,
  resolution: "hd",
  aspectRatio: "16:9",
} as GenerateInput;

describe("the workflow template table", () => {
  it("holds well-formed templates, each serving known capabilities", () => {
    const ids = workflowTemplates.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const choice of workflowTemplates) {
      expect(choice.id).toBe(choice.template.id);
      expect(choice.capabilities.length).toBeGreaterThan(0);
      for (const capability of choice.capabilities)
        expect(CAPABILITIES).toContain(capability);
      expect(danglingLinks(choice.template.graph)).toEqual([]);
      for (const [name, slot] of Object.entries(choice.template.slots)) {
        const dot = slot.path.indexOf(".");
        const value =
          choice.template.graph[slot.path.slice(0, dot)]?.inputs[
            slot.path.slice(dot + 1)
          ];
        expect(value, `${choice.id}.${name}`).toBeDefined();
        expect(isLink(value), `${choice.id}.${name}`).toBe(false);
      }
      for (const model of choice.template.requiredModels)
        expect(JSON.stringify(choice.template.graph)).toContain(model);
      for (const node of choice.template.requiredNodes)
        expect(nodeTypes(choice.template)).toContain(node);
    }
  });

  it("gives every ready workflow entry a capability its default serves", () => {
    const workflowIds = registry
      .filter((e) => e.status === "ready" && e.route === "workflow")
      .map((e) => e.id);
    const entries = workflowEntries();
    expect(entries.map((e) => e.entry.id)).toEqual(workflowIds);
    for (const { entry, capability, defaultTemplate } of entries) {
      expect(requireTemplateFor(entry.id).choice.id).toBe(defaultTemplate);
      expect(templatesFor(capability).map((c) => c.id)).toContain(
        defaultTemplate,
      );
    }
  });

  it("swaps only to a template that serves the entry's capability", () => {
    expect(
      requireTemplateFor("ltx-2-5-akuspace", "ltx-2-5-t2v").choice.id,
    ).toBe("ltx-2-5-t2v");
    for (const [entry, template] of [
      ["ltx-2-5-akuspace", "flux-3-klein-t2i"],
      ["flux-3-klein", "ltx-2-5-akuspace-t2v"],
      ["ltx-2-5-fast", "ltx-2-5-t2v"],
      ["flux-3-klein-api", "flux-3-klein-t2i"],
      ["flux-3-klein", "missing"],
    ])
      expect(() => requireTemplateFor(entry, template), template).toThrow(
        expect.objectContaining({ code: "workflow_mismatch" }),
      );
  });

  it("fills the swapped template with its own values, and reads its output", () => {
    const swapped = workflowRun(
      "workflow/ltx-2-5-akuspace-t2v",
      acoustic,
      "A drummer.",
      "ltx-2-5-t2v",
    );
    expect(swapped.template.id).toBe("ltx-2-5-t2v");
    expect(swapped.values).not.toHaveProperty("lora_strength");
    const graph = fillSlots(
      swapped.template.graph,
      swapped.template.slots,
      swapped.values,
    );
    expect(graph["398:376"].inputs.value).toBe("A drummer.");
    expect(Object.values(graph).map((n) => n.class_type)).not.toContain(
      "LoraLoaderModelOnly",
    );
    expect(
      workflowRun("workflow/ltx-2-5-akuspace-t2v", acoustic, "A drummer.")
        .template.id,
    ).toBe("ltx-2-5-akuspace-t2v");
    expect(
      workflowOutput("workflow/flux-3-klein-t2i", "flux-3-klein-t2i"),
    ).toEqual({
      nodeId: "9",
      media: "image",
    });
    // A template that cannot stand behind the model is refused unsent.
    let error: unknown;
    try {
      workflowRun("workflow/flux-3-klein-t2i", acoustic, "", "ltx-2-5-t2v");
    } catch (caught) {
      error = caught;
    }
    expect(isUnsent(error)).toBe(true);
  });

  it("names every loader as a model slot, so a local map can fill it", () => {
    for (const choice of workflowTemplates) {
      const loaders = Object.entries(choice.template.graph).flatMap(
        ([id, node]) =>
          Object.entries(node.inputs)
            .filter(
              ([, value]) =>
                typeof value === "string" &&
                /\.(safetensors|gguf)$/.test(value),
            )
            .map(([input]) => `${id}.${input}`),
      );
      const slots = modelSlots(choice.template).map(
        (name) => choice.template.slots[name].path,
      );
      expect(slots.sort(), choice.id).toEqual(loaders.sort());
    }
  });

  it("shows no graph or model file names in the catalogue", () => {
    const catalogue = workflowCatalogue();
    expect(JSON.stringify(catalogue)).not.toMatch(/safetensors|class_type/);
    expect(
      catalogue.capabilities.find((c) => c.id === "layout-to-render")
        ?.templates,
    ).toEqual([]);
  });
});
