import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOOM_PROMPT,
  BLOOM_SHEET,
  bloomTeaser,
} from "../shared/templates/bloom-teaser";
import { versionSlots } from "../shared/templates/version";
import { dimensionsMix } from "../shared/templates/catalogue";
import { fruitsSwap } from "../shared/templates/fruits-swap";
import { audioReactiveDrop } from "../shared/templates/audio-reactive-drop";
import type { HouseTemplate } from "../shared/templates/types";
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

/** A project holding a mix template's untouched bundled take for `id`. */
function bundled(template: HouseTemplate, id: string) {
  return project(template.id, {
    [id]: {
      kind: "video",
      use: "production",
      file: { ...video, path: template.mix!.media[id].path },
      origin: "uploaded",
    },
  });
}

it("Bloom's record lives on the template, not in the Director", () => {
  expect(bloomTeaser.mix?.recipes?.["bloom-h3-b"]).toMatchObject({
    prompt: BLOOM_PROMPT,
    reference: BLOOM_SHEET,
  });
  const b = cameraRecipe(
    bundled(bloomTeaser, "bloom-h3-b"),
    slot(bloomTeaser, "bloom-h3-b"),
    ["bloom-h3-b"],
  );
  expect(b).toMatchObject({ prompt: BLOOM_PROMPT, reference: BLOOM_SHEET });
});

it("a Dance with Fruits take restores its still prompt, shape guide and still", async () => {
  const id = "fruits-swap-gorilla";
  const p = bundled(fruitsSwap, id);
  const recipe = cameraRecipe(p, slot(fruitsSwap, id), [id]);
  const dir = "/media/director-templates/fruits-swap/stills";
  expect(recipe).toMatchObject({
    label: "Recreate in Camera",
    reference: `${dir}/fruits-swap-gorilla.jpg`,
    guide: `${dir}/fruits-swap-mecha.jpg`,
    preset: "char-gorilla-explode",
    missing: ["model and settings"],
  });
  expect(recipe.prompt).toBe(
    "voxel gorilla standing on the floor dancing human size making dance moves with vox banana floating on one side and vox apple on the other vox fruits advert studio shot, cinematic view, wide angle lens use image 1 for shape guide only, its floating in the air",
  );
  listen();
  const load = vi.fn(
    async (url: string) =>
      new Response(new Blob([url], { type: "image/jpeg" })),
  );
  vi.stubGlobal("fetch", load);
  try {
    await openInCamera(() => {}, recipe, p, new Map());
  } finally {
    vi.unstubAllGlobals();
  }
  // The guide first, then the still.
  expect(load.mock.calls.map(([url]) => url)).toEqual([
    recipe.guide,
    recipe.reference,
  ]);
  const { patch, note } = received[0];
  expect(patch.description).toBe(recipe.prompt);
  expect(patch.imageReferences).toEqual(
    [recipe.guide!, recipe.reference!].map(
      (url) => `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}`,
    ),
  );
  expect(note).toBe(
    "Restored this asset's prompt and references. Made from preset char-gorilla-explode; model and settings not stored. Nothing was generated.",
  );
});

it("the mecha restores its own still prompt and names its shape guide as not stored", () => {
  const id = "fruits-swap-mecha";
  const recipe = cameraRecipe(bundled(fruitsSwap, id), slot(fruitsSwap, id), [
    id,
  ]);
  expect(recipe.prompt).toBe(
    "voxel mecha standing human size making dance moves with vox banana floating on one side and vox apple on the other vox fruits advert studio shot, cinematic view, wide angle lens use image 1 for shape guide only, its floating in the air",
  );
  expect(recipe.guide).toBeUndefined();
  expect(recipeNote(recipe, 1)).toBe(
    "Restored this asset's prompt and references. Made from preset fruit-mecha; shape guide, model and settings not stored. Nothing was generated.",
  );
});

it("a take whose prompt was not written down restores the still only and says so", () => {
  const id = "fruits-swap-gold-ninja";
  const recipe = cameraRecipe(bundled(fruitsSwap, id), slot(fruitsSwap, id), [
    id,
  ]);
  expect(recipe.label).toBe("Recreate in Camera");
  expect(recipe.prompt).toBeUndefined();
  expect(recipe.missing).toEqual(["prompt", "model and settings"]);
  expect(recipeNote(recipe, 2)).toBe(
    "Restored this asset's references. Made from preset char-gold-ninja-watermelon-explode; prompt, model and settings not stored. Nothing was generated.",
  );
});

it("an Acoustic Spaces room restores its first still and the still's own prompt", () => {
  const id = "drop-pyramid-outside";
  const recipe = cameraRecipe(
    bundled(audioReactiveDrop, id),
    slot(audioReactiveDrop, id),
    [id],
  );
  expect(recipe).toMatchObject({
    label: "Recreate in Camera",
    reference:
      "/media/director-templates/audio-reactive-drop/stills/drop-pyramid-outside.jpg",
    preset: "pyramid-outside",
    prompt:
      "cybernetic pyramid, isometric view, architectural concept, realistic cyberpunk, movie capture, on the desert, pyramid its on its own, fuji camera shot",
    missing: ["model and settings"],
  });
  // The towers' still is a frame of an LTX video, and the notice says so.
  const towers = cameraRecipe(
    bundled(audioReactiveDrop, "drop-towers"),
    slot(audioReactiveDrop, "drop-towers"),
    ["drop-towers"],
  );
  expect(towers.prompt).toBeUndefined();
  expect(recipeNote(towers, 1)).toBe(
    "Restored this asset's references. First still taken from an LTX video. Made from preset towers-descent; prompt, model and settings not stored. Nothing was generated.",
  );
  // The interior's still has its own prompt and the World Builder frame it
  // was made from as its guide.
  const inside = cameraRecipe(
    bundled(audioReactiveDrop, "drop-pyramid-inside"),
    slot(audioReactiveDrop, "drop-pyramid-inside"),
    ["drop-pyramid-inside"],
  );
  expect(inside.prompt).toBe("robot inside the pyramid");
  expect(inside.guide).toBe(
    "/media/director-templates/audio-reactive-drop/stills/drop-pyramid-inside-guide.jpg",
  );
  expect(inside.missing).toEqual(["model and settings"]);
  // Rooms nothing records stay honest: the studio is a slice of another take.
  expect(
    cameraRecipe(
      bundled(audioReactiveDrop, "drop-studio"),
      slot(audioReactiveDrop, "drop-studio"),
      ["drop-studio"],
    ).label,
  ).toBe("Create in Camera");
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
    "source video (choose it in Camera; Generate waits until you do)",
  ]);
});

describe("the recorded provider", () => {
  const fluxStill = ready.find((e) => e.id === "flux-3-image")!;
  const video = ready.find((e) => e.id === "flux-3-video")!;
  const withRoute = (entry: ReadyEntry, route?: ReadyEntry["route"]) => {
    const p = madeWith(entry);
    const g = p.generations[0];
    if (route && g.recipe) g.recipe.route = route;
    if (!route && g.recipe) delete (g.recipe as { route?: string }).route;
    return p;
  };

  it.each([
    ["bfl", "bfl"],
    ["router", "comfy"],
  ] as const)(
    "a FLUX 3 still made on %s reopens on that provider",
    async (route, provider) => {
      const p = withRoute(fluxStill, route);
      const recipe = cameraRecipe(p, bloomA, ["mine"]);
      expect(recipe.imageProvider).toBe(provider);
      listen();
      await openInCamera(() => {}, recipe, p, new Map([[still.path, PNG]]));
      expect(received[0].patch.imageProvider).toBe(provider);
    },
  );

  it("a FLUX 3 still without a recorded route names the provider as missing", () => {
    const recipe = cameraRecipe(withRoute(fluxStill), bloomA, ["mine"]);
    expect(recipe.imageProvider).toBeUndefined();
    expect(recipe.missing).toContain("provider (BFL or Comfy) not recorded");
  });

  it("a video run with no recorded choice reopens on Auto, not on the route it took", () => {
    const recipe = cameraRecipe(withRoute(video, "bfl"), bloomA, ["mine"]);
    expect(recipe.videoProvider).toBeUndefined();
    expect(recipe.providerNote).toBeUndefined();
    expect(recipe.missing.join(" ")).not.toContain("provider");
    expect(recipe.imageProvider).toBeUndefined();
  });
});
