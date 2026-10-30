import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUses, removeAsset } from "../shared/director/assets";
import { checkReferences } from "../shared/director/types";
import {
  characterPiece,
  animeTeaser,
  dimensionsMix,
} from "../shared/templates/catalogue";
import { bloomTeaser } from "../shared/templates/bloom-teaser";
import { adaptiveReverb } from "../shared/templates/adaptive-reverb";
import { readInputs } from "../shared/templates/plan";
import {
  versionSlots,
  versionTemplate,
  versionPlacement,
  versionCommand,
} from "../shared/templates/version";
import { buildTemplateBundle } from "../src/director/house-template";
import { buildMixBundle } from "../src/director/mix-template";
import {
  applyVersionInputs,
  importVersionFiles,
  slotAssets,
  validateVersionAsset,
  versionPicks,
  versionTextInputs,
} from "../src/director/version-inputs";
import { versionPictureParameters } from "../src/director/version-pictures";
import { validateProject } from "../src/director/validate";
import { bundleZip, importBundle } from "../src/director/bundle";
import { createStudioStore } from "../src/studio/store";
import { base, samples } from "./house-template-fixtures";
import { mixBundle } from "./dimensions-mix-fixtures";

vi.setConfig({ testTimeout: 20_000 });
afterEach(() => vi.unstubAllGlobals());
const build = (template = characterPiece) =>
  buildTemplateBundle(base(), template, {}, samples(template));
const mix = (template: typeof bloomTeaser) =>
  buildMixBundle(
    template,
    base(),
    Object.fromEntries(
      Object.entries(template.mix!.media).map(([id, m]) => [
        id,
        new Uint8Array(
          readFileSync(new URL(`../public${m.url}`, import.meta.url)),
        ),
      ]),
    ),
  );

describe("declaration-derived version inputs", () => {
  it("reads character, anime, Bloom, reverb and finished-mix slots without a template-id switch", () => {
    expect(
      versionSlots(characterPiece).map((s) => [s.id, s.kind, s.min, s.max]),
    ).toEqual([["character", "image", 1, 3]]);
    expect(versionSlots(animeTeaser).map((s) => s.id)).toEqual([
      "track",
      "character",
      "storyboard",
    ]);
    expect(versionSlots(bloomTeaser).map((s) => s.kind)).toEqual([
      "video",
      "video",
      "audio",
      "image",
      "image",
    ]);
    expect(versionSlots(adaptiveReverb).map((s) => s.kind)).toContain("audio");
    expect(
      versionSlots(dimensionsMix).find((s) => s.id === "mix-track")?.layers,
    ).toEqual(["track"]);
    const custom = {
      ...characterPiece,
      references: [
        {
          ...characterPiece.references[0],
          id: "custom",
          label: "My custom stills",
          max: 2,
        },
      ],
    };
    expect(versionSlots(custom)[0]).toMatchObject({
      id: "custom",
      label: "My custom stills",
      max: 2,
    });
  });

  it("keeps current bindings across text edits, multiple replacements and ZIP round trips", async () => {
    const before = await build();
    const picks = versionPicks(before, characterPiece);
    expect(picks.character).toEqual(["character-1"]);
    // Two valid images already in the project, available under Inspirations.
    before.project.assets["my-still"] = {
      ...before.project.assets["character-1"],
    };
    picks.character = ["my-still", "character-1"];
    const inputs = {
      ...readInputs(characterPiece),
      title: "MAYA",
      subject: "an invented painter wearing blue",
    };
    const next = await applyVersionInputs(
      before,
      characterPiece,
      picks,
      inputs,
    );
    expect(versionPicks(next, characterPiece).character).toEqual(
      picks.character,
    );
    expect(
      next.project.generationPlans.every(
        (g) => g.referenceAssetIds.join() === picks.character.join(),
      ),
    ).toBe(true);
    expect(next.project.generationPlans[0].prompt.toLowerCase()).toContain(
      inputs.subject,
    );
    expect(next.project.layers.find((l) => l.id === "title")).toMatchObject({
      parameters: { text: "MAYA" },
    });
    expect(before.project.template?.inputs.title).toBe("ANNA");
    const reopened = await importBundle(
      new File([bundleZip(next)], "my-version.zip"),
    );
    expect(versionPicks(reopened, characterPiece)).toEqual(picks);
  });

  it("refuses wrong kind, empty required refs, too many refs, bad headers, sizes and short tracks", async () => {
    const before = await build();
    const slot = versionSlots(characterPiece)[0];
    await expect(validateVersionAsset(before, slot, "missing")).rejects.toThrow(
      "choose image",
    );
    await expect(
      applyVersionInputs(
        before,
        characterPiece,
        { character: [] },
        readInputs(characterPiece),
      ),
    ).rejects.toThrow("1 to 3");
    await expect(
      applyVersionInputs(
        before,
        characterPiece,
        { character: Array(4).fill("character-1") },
        readInputs(characterPiece),
      ),
    ).rejects.toThrow("1 to 3");
    await expect(
      importVersionFiles(before, slot, [
        new File(["not an image"], "bad.png", { type: "image/png" }),
      ]),
    ).rejects.toThrow("PNG, JPEG or WebP");
    await expect(
      importVersionFiles(before, slot, [
        new File([new Uint8Array(6 * 1024 * 1024)], "huge.png", {
          type: "image/png",
        }),
      ]),
    ).rejects.toThrow("under 5 MB");
    const finished = await mixBundle();
    const track = versionSlots(dimensionsMix).find((s) => s.kind === "audio")!;
    const b = base();
    finished.project.assets.short = b.project.assets.audio;
    finished.files.set(
      b.project.assets.audio.file.path,
      b.files.get(b.project.assets.audio.file.path)!,
    );
    await expect(
      validateVersionAsset(finished, track, "short"),
    ).rejects.toThrow("needs at least");
  });

  it("swaps the mix track without changing overlays, timing, or source in-points; Undo restores it", async () => {
    const before = await mixBundle();
    before.project.assets["my-track"] = {
      ...before.project.assets["mix-track"],
      use: "reference",
    };
    const picks = versionPicks(before, dimensionsMix);
    picks["mix-track"] = ["my-track"];
    const next = await applyVersionInputs(
      before,
      dimensionsMix,
      picks,
      readInputs(dimensionsMix),
    );
    expect(next.project.layers.filter((l) => l.kind !== "audio")).toEqual(
      before.project.layers.filter((l) => l.kind !== "audio"),
    );
    expect(next.project.layers[0]).toMatchObject({
      startFrame: 0,
      durationFrames: before.project.layers[0].durationFrames,
    });
    expect(versionTemplate(next.project)?.id).toBe("dimensions-mix");
    expect(next.project.generationPlans).toEqual([]);
    const store = createStudioStore();
    store.getState().actions.initialize(before);
    store.getState().actions.commit(next, before);
    store.getState().actions.undo();
    expect(store.getState().director.bundle?.project.layers).toEqual(
      before.project.layers,
    );
  });

  it("replaces a recipe picture through a portable asset binding and keeps the original recipe registered", async () => {
    const before = await mix(bloomTeaser);
    const still = new Uint8Array(
      readFileSync(
        new URL(
          "../public" +
            bloomTeaser.mix!.cut.layers.find(
              (l) => l.module === "end-card-still",
            )!.parameters.still,
          import.meta.url,
        ),
      ),
    );
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 540,
      height: 540,
      close() {},
    }));
    const slot = versionSlots(bloomTeaser).find(
      (s) => s.picture?.layer === "end-card",
    )!;
    const imported = await importVersionFiles(before, slot, [
      new File([still], "my-still.jpg", { type: "image/jpeg" }),
    ]);
    const picks = versionPicks(before, bloomTeaser);
    picks[slot.id] = imported.assetIds;
    const next = await applyVersionInputs(
      imported.bundle,
      bloomTeaser,
      picks,
      readInputs(bloomTeaser),
    );
    const layer = next.project.layers.find((l) => l.id === "end-card")!;
    expect(layer).toMatchObject({
      moduleId: "version-end-card-still",
      parameters: { title: "BLOOM", still: `asset:${imported.assetIds[0]}` },
    });
    expect(next.project.modules["end-card-still"]).toEqual(
      before.project.modules["end-card-still"],
    );
    expect(slotAssets(next, slot)).toEqual(imported.assetIds);
    expect(assetUses(next.project, imported.assetIds[0])).toContain(layer.name);
    expect(() => removeAsset(next.project, imported.assetIds[0])).toThrow();
    validateProject(next.project);
    const reopened = await importBundle(
      new File([bundleZip(next)], "bloom-version.zip"),
    );
    expect(slotAssets(reopened, slot)).toEqual(imported.assetIds);
    const missing = structuredClone(next.project);
    delete missing.assets[imported.assetIds[0]];
    expect(() => checkReferences(missing)).toThrow("Missing recipe image");
    if (!("parameters" in layer)) throw new Error("Expected graphic");
    const keep = vi.fn();
    const resolved = versionPictureParameters(
      next,
      layer,
      layer.parameters,
      keep,
    );
    expect(resolved.still).toMatch(/^blob:/);
    expect(keep).toHaveBeenCalledOnce();
    URL.revokeObjectURL(resolved.still as string);
  });

  it("uses replace-plate / add-clip and rejects stale revisions", async () => {
    const before = await build();
    const command = versionPlacement(
      before.project,
      characterPiece,
      "arrive",
      "character-1",
    );
    expect(command).toEqual({
      op: "replace-plate",
      layerId: "shot-arrive",
      assetId: "character-1",
    });
    expect(() =>
      versionCommand(before.project, before.project.revision - 1, command),
    ).toThrow("Project changed");
    const absent = {
      ...before.project,
      layers: before.project.layers.filter((l) => l.id !== "shot-arrive"),
    };
    const add = versionPlacement(
      absent,
      characterPiece,
      "arrive",
      "character-1",
    );
    expect(add).toMatchObject({
      op: "add-clip",
      layerId: "shot-arrive",
      startFrame: 0,
      durationFrames: 120,
      track: "shots",
    });
    expect(
      versionCommand(
        before.project,
        before.project.revision,
        command,
      ).layers.find((l) => l.id === "shot-arrive"),
    ).toMatchObject({ startFrame: 0, durationFrames: 120 });
  });

  it("keeps hand-edited titles when only assets change, including long headlines", async () => {
    for (const words of [
      "MY EDIT",
      "My hand-edited title that is longer than the template title input limit",
    ]) {
      const before = await build();
      before.project.layers = before.project.layers.map((l) =>
        l.id === "title" && l.kind === "graphics"
          ? { ...l, parameters: { ...l.parameters, text: words } }
          : l,
      );
      const inputs = versionTextInputs(before, characterPiece);
      if (words.length <= 40) expect(inputs.title).toBe(words);
      const next = await applyVersionInputs(
        before,
        characterPiece,
        versionPicks(before, characterPiece),
        inputs,
      );
      expect(next.project.layers.find((l) => l.id === "title")).toMatchObject({
        parameters: { text: words },
      });
    }
  });
});
