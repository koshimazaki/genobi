import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The project-copy probe, so the unmemoised miss can be shown.
const probe = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../src/director/project-copy", () => ({ copyAvailable: probe }));
import { createScroll } from "../shared/scrolls/commands";
import { addFile, type ScrollBundle } from "../src/scrolls/bundle";
import {
  HOSTED_NOTE,
  directorUse,
  landInProject,
  scrollMedia,
} from "../src/scrolls/to-project";
import {
  addToProjectAssets,
  onAssetAdded,
  type AddedAsset,
} from "../src/studio/project-assets";
import {
  canUndoSend,
  directorMessage,
  sendToDirector,
  undoSend,
} from "../src/studio/send-to-director";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";

// Send to Director and Add to assets: an item reaches the project's assets
// through the one path without opening the Director, a repeat says so, Undo
// reverts that add only, and a Scrolls result lands under Project as it
// arrives (with the hosted site's caveat when there is no project copy).
beforeEach(() =>
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 640, height: 640, close() {} }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

function project() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  return store;
}
const png = readFileSync("public/scrolls/creature.png");
async function scroll(role: "character" | "panel" = "character") {
  const bundle: ScrollBundle = {
    document: createScroll("character", 2, "send"),
    files: new Map(),
  };
  return addFile(
    bundle,
    new File([png], "Creature sheet.png", { type: "image/png" }),
    role,
  );
}
const assets = (store: ReturnType<typeof project>) =>
  store.getState().director.bundle!.project.assets;

describe("Send to Director", () => {
  it("adds once, says it is already there the second time, and keeps one asset", async () => {
    const store = project();
    const bundle = await scroll();
    const id = bundle.document.assets[0].id;
    const add = () =>
      addToProjectAssets(scrollMedia(bundle, id, "reference"), store);
    const first = await sendToDirector(add, store);
    expect(first.message).toBe(
      "Added to the Director's assets · Inspirations.",
    );
    expect(assets(store)[first.asset.assetId]).toMatchObject({
      kind: "image",
      use: "reference",
    });
    const count = Object.keys(assets(store)).length;
    const again = await sendToDirector(add, store);
    expect(again.message).toBe(
      "Already in the Director's assets · Inspirations.",
    );
    expect(again.after).toBeUndefined();
    expect(Object.keys(assets(store))).toHaveLength(count);
  });

  it("undoes its own add, and nothing once the project has changed since", async () => {
    const store = project();
    const bundle = await scroll();
    const id = bundle.document.assets[0].id;
    const before = Object.keys(assets(store));
    const sent = await sendToDirector(
      () => addToProjectAssets(scrollMedia(bundle, id, "production"), store),
      store,
    );
    expect(undoSend(sent, store)).toBe(true);
    expect(Object.keys(assets(store))).toEqual(before);

    const again = await sendToDirector(
      () => addToProjectAssets(scrollMedia(bundle, id, "production"), store),
      store,
    );
    // Another edit after the send: Undo must not revert that one instead.
    await addToProjectAssets(scrollMedia(bundle, id, "reference"), store);
    const after = store.getState().director.bundle;
    expect(canUndoSend(again, store)).toBe(false);
    expect(undoSend(again, store)).toBe(false);
    expect(store.getState().director.bundle).toBe(after);
  });

  it("words the tab for each use", () => {
    expect(
      directorMessage({
        assetId: "a",
        added: true,
        use: "production",
        filename: "x.png",
      }),
    ).toBe("Added to the Director's assets · Project.");
  });
});

describe("Scrolls outputs into project assets", () => {
  it("files sheets and references under Inspirations, panels and audio under Project", () => {
    expect(directorUse("character")).toBe("reference");
    expect(directorUse("style")).toBe("reference");
    expect(directorUse("panel")).toBe("production");
    expect(directorUse("audio")).toBe("production");
  });

  it("refuses an asset the scroll no longer holds", async () => {
    const bundle = await scroll();
    expect(() => scrollMedia(bundle, "gone", "production")).toThrow(
      /no longer in the scroll/,
    );
    const id = bundle.document.assets[0].id;
    expect(() =>
      scrollMedia({ ...bundle, files: new Map() }, id, "production"),
    ).toThrow(/missing its media/);
  });

  it("lands a generated result under Project as it arrives", async () => {
    const store = project();
    const bundle = await scroll("panel");
    const id = bundle.document.assets[0].id;
    const said = await landInProject(
      bundle,
      id,
      (media) => addToProjectAssets(media, store),
      async () => true,
    );
    expect(said).toBe("Creature sheet.png added to project assets · Project.");
    const landed = Object.values(assets(store)).filter(
      (a) =>
        a.file.path.endsWith("Creature_sheet.png") && a.use === "production",
    );
    expect(landed).toHaveLength(1);
  });

  it("says the hosted caveat when there is no project copy", async () => {
    const store = project();
    const bundle = await scroll();
    const said = await landInProject(
      bundle,
      bundle.document.assets[0].id,
      (media) => addToProjectAssets(media, store),
      async () => false,
    );
    expect(said).toMatch(/added to project assets · Project\./);
    expect(said).toContain(HOSTED_NOTE);
  });

  it("says a refusal without throwing, leaving the project as it was", async () => {
    const store = createStudioStore(); // no project open yet
    const bundle = await scroll();
    const said = await landInProject(
      bundle,
      bundle.document.assets[0].id,
      (media) => addToProjectAssets(media, store),
      async () => true,
    );
    expect(said).toMatch(/^Not added to project assets: .*still opening/);
    expect(store.getState().director.bundle).toBeUndefined();
  });
});

describe("the rail and the copy probe", () => {
  it("tells the rail to keep its tab for a send from inside it", async () => {
    const store = project();
    const bundle = await scroll();
    const told: AddedAsset[] = [];
    const stop = onAssetAdded((asset) => told.push(asset));
    await addToProjectAssets(
      {
        ...scrollMedia(bundle, bundle.document.assets[0].id, "production"),
        keepTab: true,
      },
      store,
    );
    await addToProjectAssets(
      scrollMedia(bundle, bundle.document.assets[0].id, "reference"),
      store,
    );
    stop();
    expect(told.map((a) => a.keepTab)).toEqual([true, undefined]);
  });

  it("asks again after a miss, so a restarting local server is not taken for hosted", async () => {
    const store = project();
    const bundle = await scroll();
    const id = bundle.document.assets[0].id;
    const add = (media: Parameters<typeof addToProjectAssets>[0]) =>
      addToProjectAssets(media, store);
    probe.mockResolvedValueOnce(false).mockResolvedValue(true);
    expect(await landInProject(bundle, id, add)).toContain(HOSTED_NOTE);
    expect(await landInProject(bundle, id, add)).not.toContain(HOSTED_NOTE);
    expect(await landInProject(bundle, id, add)).not.toContain(HOSTED_NOTE);
    // Found once, remembered: two probes for three results.
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
