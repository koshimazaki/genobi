import { expect, it } from "vitest";
import { BLOOM_PROMPT, BLOOM_SHEET } from "../shared/templates/bloom-teaser";
import { versionSlots } from "../shared/templates/version";
import { dimensionsMix } from "../shared/templates/catalogue";
import type { Project } from "../shared/director/types";
import { cameraRecipe } from "../src/director/recreate-in-camera";

const slot = (template: Parameters<typeof versionSlots>[0], id: string) =>
  versionSlots(template).find((s) => s.id === id)!;

function project(
  templateId: string,
  assets: Project["assets"],
  generations: Project["generations"] = [],
) {
  return {
    id: templateId,
    template: { id: templateId, inputs: {} },
    assets,
    generations,
  } as unknown as Project;
}

const file = { path: "media/a.mp4", sha256: "a".repeat(64) };

it("restores Bloom's recorded owner prompt for its untouched bundled take", async () => {
  const { bloomTeaser } = await import("../shared/templates/bloom-teaser");
  const p = project("bloom-teaser", {
    "bloom-h3-a": { kind: "video", use: "production", file, origin: "fixture" },
  });
  expect(
    cameraRecipe(p, slot(bloomTeaser, "bloom-h3-a"), ["bloom-h3-a"]),
  ).toEqual({
    label: "Recreate in Camera",
    prompt: BLOOM_PROMPT,
    reference: BLOOM_SHEET,
  });
});

it("restores a generated asset's own recorded prompt", async () => {
  const { bloomTeaser } = await import("../shared/templates/bloom-teaser");
  const p = project(
    "bloom-teaser",
    {
      mine: {
        kind: "video",
        use: "production",
        file,
        origin: "generated",
        generationId: "g1",
      },
    },
    [
      {
        id: "g1",
        inputAssetIds: [],
        referenceAssetIds: [],
        outputAssetIds: ["mine"],
        prompt: "a fox in neon rain",
        tool: "camera",
      },
    ],
  );
  expect(cameraRecipe(p, slot(bloomTeaser, "bloom-h3-a"), ["mine"])).toEqual({
    label: "Recreate in Camera",
    prompt: "a fox in neon rain",
  });
});

it("never invents a prompt: Dimensions and swapped-in uploads open Camera as it is", async () => {
  const { bloomTeaser } = await import("../shared/templates/bloom-teaser");
  const id = Object.keys(dimensionsMix.mix!.media)[0];
  const dims = project(dimensionsMix.id, {
    [id]: { kind: "video", use: "production", file, origin: "fixture" },
  });
  expect(cameraRecipe(dims, slot(dimensionsMix, id), [id])).toEqual({
    label: "Create in Camera",
  });
  const swapped = project("bloom-teaser", {
    upload: { kind: "video", use: "production", file, origin: "uploaded" },
  });
  expect(
    cameraRecipe(swapped, slot(bloomTeaser, "bloom-h3-a"), ["upload"]),
  ).toEqual({ label: "Create in Camera" });
});
