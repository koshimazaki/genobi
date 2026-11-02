import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOOM_PROMPT,
  BLOOM_SHEET,
  bloomTeaser,
} from "../shared/templates/bloom-teaser";
import { versionSlots } from "../shared/templates/version";
import { dimensionsMix } from "../shared/templates/catalogue";
import { registry, type ReadyEntry } from "../shared/registry";
import type { Project } from "../shared/director/types";
import {
  cameraRecipe,
  openInCamera,
  recipeNote,
} from "../src/director/recreate-in-camera";
import {
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";

const slot = (template: Parameters<typeof versionSlots>[0], id: string) =>
  versionSlots(template).find((s) => s.id === id)!;
const bloomA = slot(bloomTeaser, "bloom-h3-a");

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

const video = { path: "media/a.mp4", sha256: "a".repeat(64) };
const still = { path: "media/ref/sheet.png", sha256: "b".repeat(64) };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** A project whose slot media was made by `entry`, reading one still. */
function madeWith(entry: ReadyEntry | undefined) {
  return project(
    "bloom-teaser",
    {
      mine: {
        kind: entry?.generator === "image" ? "image" : "video",
        use: "production",
        file: video,
        origin: "generated",
        generationId: "g1",
      },
      sheet: {
        kind: "image",
        use: "reference",
        file: still,
        origin: "uploaded",
      },
    },
    [
      {
        id: "g1",
        inputAssetIds: [],
        referenceAssetIds: ["sheet"],
        outputAssetIds: ["mine"],
        prompt: "a fox in neon rain",
        tool: "camera",
        ...(entry
          ? {
              recipe: {
                id: entry.id,
                version: entry.recipeVersion,
                route: entry.route,
              },
            }
          : {}),
      },
    ],
  );
}

let received: CameraRecipePatch[] = [];
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  received = [];
});
const listen = () => {
  stop = onCameraRecipe((recipe) => received.push(recipe));
};

it("restores Bloom's recorded owner prompt and sheet, and says the model is not recorded", () => {
  const p = project("bloom-teaser", {
    // As mixProject builds it: the template's own path, origin uploaded.
    "bloom-h3-a": {
      kind: "video",
      use: "production",
      file: { ...video, path: "media/bloom-h3-a.mp4" },
      origin: "uploaded",
    },
  });
  const recipe = cameraRecipe(p, bloomA, ["bloom-h3-a"]);
  expect(recipe).toMatchObject({
    label: "Recreate in Camera",
    prompt: BLOOM_PROMPT,
    reference: BLOOM_SHEET,
    missing: ["model and settings"],
  });
  expect(recipe.entry).toBeUndefined();
});

it("never invents a prompt: Dimensions and swapped-in uploads open Camera as it is", async () => {
  const id = Object.keys(dimensionsMix.mix!.media)[0];
  const dims = project(dimensionsMix.id, {
    [id]: { kind: "video", use: "production", file: video, origin: "fixture" },
  });
  const recipe = cameraRecipe(dims, slot(dimensionsMix, id), [id]);
  expect(recipe.label).toBe("Create in Camera");
  const swapped = project("bloom-teaser", {
    upload: {
      kind: "video",
      use: "production",
      file: video,
      origin: "uploaded",
    },
  });
  expect(cameraRecipe(swapped, bloomA, ["upload"]).label).toBe(
    "Create in Camera",
  );
  listen();
  const select = vi.fn();
  await openInCamera(select, recipe, dims, new Map());
  expect(select).toHaveBeenCalledWith("camera");
  expect(received).toEqual([
    {
      patch: {},
      note: "Settings not stored for this asset: Camera opened as it was. Nothing was generated.",
    },
  ]);
});

it("a generated asset without a recipe restores its prompt and names the missing model", () => {
  const recipe = cameraRecipe(madeWith(undefined), bloomA, ["mine"]);
  expect(recipe).toMatchObject({
    label: "Recreate in Camera",
    prompt: "a fox in neon rain",
    imageIds: ["sheet"],
    missing: ["model and settings"],
  });
  expect(recipeNote(recipe, 1)).toContain("Not stored: model and settings");
});

const ready = registry.filter((e): e is ReadyEntry => e.status === "ready");
describe.each(ready.map((e) => [e.id, e] as const))(
  "a project asset made with %s",
  (_id, entry) => {
    it("selects that Camera model and loads its prompt and references", async () => {
      const p = madeWith(entry);
      const recipe = cameraRecipe(p, bloomA, ["mine"]);
      expect(recipe.entry?.id).toBe(entry.id);
      listen();
      await openInCamera(() => {}, recipe, p, new Map([[still.path, PNG]]));
      expect(received).toHaveLength(1);
      const { patch, note } = received[0];
      expect(patch.generator).toBe(entry.generator);
      expect(patch.model).toBe(entry.videoModel);
      expect(
        entry.generator === "upscale" ? patch.upscalePrompt : patch.description,
      ).toBe("a fox in neon rain");
      expect(patch.imageReferences).toEqual([
        `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
      ]);
      expect(note).toContain("Nothing was generated");
    });
  },
);

it("clears Camera's earlier references when the asset recorded none", async () => {
  const p = madeWith(ready.find((e) => e.id === "flux-3-i2v"));
  p.generations[0].referenceAssetIds = [];
  const recipe = cameraRecipe(p, bloomA, ["mine"]);
  expect(recipe.imageIds).toEqual([]);
  listen();
  await openInCamera(() => {}, recipe, p, new Map());
  const { patch, note } = received[0];
  // Replaced, not merged: a stale reference can never reach a paid Generate.
  expect(patch.imageReferences).toEqual([]);
  expect(patch.imageRegions).toEqual([]);
  expect(note).toContain("No references recorded");
  expect(note).toContain("Restored this asset's prompt and model.");
  // The composer's update merges, so the empty array is what clears them.
  const before = { imageReferences: ["data:image/png;base64,c3RhbGU="] };
  expect({ ...before, ...patch }.imageReferences).toEqual([]);
});

it("names a source video the run read even when no model was recorded", () => {
  const p = madeWith(undefined);
  p.assets.clip = {
    kind: "video",
    use: "production",
    file: { path: "media/clip.mp4", sha256: "c".repeat(64) },
    origin: "uploaded",
  };
  p.generations[0].inputAssetIds = ["clip"];
  expect(cameraRecipe(p, bloomA, ["mine"]).missing).toEqual([
    "model and settings",
    "source video (choose it in Camera)",
  ]);
});
