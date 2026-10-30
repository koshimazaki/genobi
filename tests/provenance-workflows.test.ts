import { describe, expect, it } from "vitest";
import {
  ProvenanceError,
  buildProvenance,
  readProvenance,
} from "../shared/provenance-card";
import type { Take } from "../shared/take";
import { hermes, take } from "./provenance-fixtures";

// A card credits each workflow take with the template and run location its
// take recorded, not the entry's default or one location for the whole card.
const recorded = (
  t: Take,
  workflow?: string,
  location?: "local" | "cloud",
): Take => ({
  ...t,
  recipe: {
    ...t.recipe,
    ...(workflow ? { workflow } : {}),
    ...(location ? { location } : {}),
  },
});
const base = {
  title: "Acoustic study",
  agent: { ...hermes, provider: "local" as const, model: "qwen3-vl-8b" },
  workflows: "cloud" as const,
  hardware: "RTX 5090, 32 GB",
};

describe("provenance from recorded workflows", () => {
  it("credits a no-LoRA Acoustic Space run to the graph it ran", () => {
    const card = buildProvenance({
      ...base,
      takes: [
        {
          take: recorded(
            take("av-1", "ltx-2-5-akuspace", "workflow"),
            "ltx-2-5-t2v",
            "cloud",
          ),
        },
      ],
    });
    expect(card.generations[0]).toMatchObject({
      entry: "ltx-2-5-akuspace",
      workflow: "ltx-2-5-t2v",
      runsOn: "comfy-cloud",
    });
    expect(card.workflowFiles).toEqual(["workflows/ltx-2-5-t2v.json"]);
    // The card reads back as it was built.
    expect(readProvenance(JSON.parse(JSON.stringify(card)))).toEqual(card);
  });

  it("places each take where it ran: a mixed Local and Cloud card", () => {
    const card = buildProvenance({
      ...base,
      takes: [
        {
          take: recorded(
            take("av-2", "ltx-2-5-akuspace", "workflow"),
            "ltx-2-5-akuspace-t2v",
            "local",
          ),
        },
        {
          take: recorded(
            take("k-2", "flux-3-klein", "workflow", { mediaType: "image" }),
            "flux-3-klein-t2i",
            "cloud",
          ),
        },
        { take: take("hero-2", "ltx-2-5-fast", "router") },
      ],
    });
    expect(card.generations.map((g) => [g.runsOn, g.workflow])).toEqual([
      ["local-comfyui", "ltx-2-5-akuspace-t2v"],
      ["comfy-cloud", "flux-3-klein-t2i"],
      ["comfy-router", null],
    ]);
    expect(card.run.generations).toBe("mixed");
    expect(card.workflowFiles).toEqual([
      "workflows/ltx-2-5-akuspace-t2v.json",
      "workflows/flux-3-klein-t2i.json",
    ]);
  });

  it("falls back to the entry's default and the card's location for an older take", () => {
    const card = buildProvenance({
      ...base,
      workflows: "local",
      takes: [{ take: take("av-3", "ltx-2-5-akuspace", "workflow") }],
    });
    expect(card.generations[0]).toMatchObject({
      workflow: "ltx-2-5-akuspace-t2v",
      runsOn: "local-comfyui",
    });
  });

  it("refuses a template outside the entry's capability, or on another route", () => {
    const card = buildProvenance({
      ...base,
      takes: [{ take: take("av-4", "ltx-2-5-akuspace", "workflow") }],
    });
    const forged = JSON.parse(JSON.stringify(card));
    forged.generations[0].workflow = "flux-3-klein-t2i";
    forged.workflowFiles = ["workflows/flux-3-klein-t2i.json"];
    expect(() => readProvenance(forged)).toThrow(ProvenanceError);
    expect(() => readProvenance(forged)).toThrow(/cannot run behind/);
    expect(() =>
      buildProvenance({
        ...base,
        takes: [
          {
            take: recorded(
              take("k-3", "flux-3-klein", "workflow", { mediaType: "image" }),
              "ltx-2-5-t2v",
            ),
          },
        ],
      }),
    ).toThrow(/cannot run behind/);
    const router = buildProvenance({
      ...base,
      takes: [{ take: take("hero-3", "ltx-2-5-fast", "router") }],
    });
    const named = JSON.parse(JSON.stringify(router));
    named.generations[0].workflow = "ltx-2-5-t2v";
    expect(() => readProvenance(named)).toThrow(/runs none/);
  });
});
