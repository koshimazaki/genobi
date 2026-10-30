import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  isDimensionsMix,
  legacyEndCards,
  upgradeEndCard,
} from "../shared/templates/mix-end-card-upgrade";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { dimensionsMix } from "../shared/templates/dimensions-mix";
import type { Bundle } from "../src/director/bundle";
import { pushCopy } from "../src/director/project-copy";
import { CopySync } from "../src/director/project-copy-sync";
import { upgradeBundle } from "../src/director/upgrade-bundle";
import { validateProject } from "../src/director/validate";
import { createStudioStore } from "../src/studio/store";
import { legacyMixBundle, mixBundle } from "./dimensions-mix-fixtures";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";
import { studio } from "./copy-sync-harness";

// Projects saved before the end card was editable (#221) open with the
// editable card over their baked one; nothing of theirs is dropped
// (docs/dimensions-mix.md#projects-saved-before-the-editable-card).
const card = dimensionsMix.mix!.cut.layers.find((l) => l.id === "end-card")!;
const recipe = TRUSTED_RECIPES["end-card"];
const example = async () => base();

/** The owner's copy: an agent hid the capture, the overlays were removed. */
const hidden = (bundle: Bundle): Bundle => ({
  ...bundle,
  project: {
    ...bundle.project,
    revision: 79,
    layers: bundle.project.layers.map((l) =>
      l.id === "shot-13" && l.kind === "video" ? { ...l, opacity: 0 } : l,
    ),
  },
});

describe("a Dimensions mix saved with the baked end card", () => {
  it("is found by its mix-end video layer, and a fresh mix is not", async () => {
    const old = await legacyMixBundle();
    expect(legacyEndCards(old.project).map((l) => l.id)).toEqual(["shot-13"]);
    expect(legacyEndCards((await mixBundle()).project)).toEqual([]);
  });

  it("is recognised by its lineage: the mix's id and bundled clips", async () => {
    const old = await legacyMixBundle();
    expect(isDimensionsMix(old.project)).toBe(true);
    expect(isDimensionsMix({ ...old.project, id: "dimensions-mix-v2" })).toBe(
      true,
    );
    // The lineage hashes are the bundled files' own.
    for (const m of Object.values(dimensionsMix.mix!.media))
      expect(
        old.project.assets[
          Object.keys(old.project.assets).find(
            (id) => old.project.assets[id].file.path === m.path,
          )!
        ].file.sha256,
      ).toBe(
        createHash("sha256")
          .update(readFileSync(new URL(`../public${m.url}`, import.meta.url)))
          .digest("hex"),
      );
  });

  it("leaves an unrelated project with a mix-end video untouched", async () => {
    const old = await legacyMixBundle();
    const other = { ...old.project, id: "my-music-video", name: "Mine" };
    expect(legacyEndCards(other)).toEqual([]);
    expect(upgradeEndCard(other, recipe)).toBeUndefined();
    expect(await upgradeBundle({ ...old, project: other }, example)).toBe(
      undefined,
    );
    // Its own id, but not the mix's clips: not a Dimensions mix either.
    const lookalike = {
      ...old.project,
      assets: Object.fromEntries(
        Object.entries(old.project.assets).filter(([id]) => id !== "mix-01"),
      ),
      layers: old.project.layers.filter(
        (l) => !("assetId" in l) || l.assetId !== "mix-01",
      ),
    };
    expect(legacyEndCards(lookalike)).toEqual([]);
  });

  it("gets the editable card over the same frames, the video kept under it", async () => {
    const old = await legacyMixBundle();
    const up = upgradeEndCard(old.project, recipe)!;
    expect(up.covers).toEqual(["shot-13"]);
    const { layers } = up.project;
    const at = layers.findIndex((l) => l.id === up.layerId);
    expect(layers[at - 1].id).toBe("shot-13");
    expect(layers[at]).toMatchObject({
      id: "end-card",
      kind: "graphics",
      moduleId: "end-card",
      startFrame: 453,
      durationFrames: 102,
      opacity: 1,
      parameters: {
        ...card.parameters,
        credit2: "KOSHIMAZAKI MIX",
        subtitle: "SUPERNATURAL CREATURES",
      },
    });
    // Every old layer is still there, unchanged.
    expect(layers.filter((l) => l.id !== "end-card")).toEqual(
      old.project.layers,
    );
    expect(up.project.modules["end-card"]).toEqual(recipe);
    expect(() => validateProject(up.project)).not.toThrow();
    // Done once: the card is now there.
    expect(upgradeEndCard(up.project, recipe)).toBeUndefined();
  });

  it("takes the title slam's words for the subtitle, and keeps ids unique", async () => {
    const old = await legacyMixBundle();
    const project = {
      ...old.project,
      layers: old.project.layers.map((l) =>
        l.id === "title" && l.kind === "graphics"
          ? { ...l, parameters: { ...l.parameters, text: "NIGHT / SHIFT" } }
          : l.id === "hud"
            ? { ...l, id: "end-card" }
            : l,
      ),
    };
    const up = upgradeEndCard(project, recipe)!;
    expect(up.layerId).toBe("end-card-2");
    const layer = up.project.layers.find((l) => l.id === "end-card-2")!;
    expect(layer).toMatchObject({ parameters: { subtitle: "NIGHT SHIFT" } });
  });

  it("runs once: a card the person deleted is not brought back", async () => {
    const up = upgradeEndCard((await legacyMixBundle()).project, recipe)!;
    const deleted = {
      ...up.project,
      layers: up.project.layers.filter((l) => l.id !== up.layerId),
    };
    expect(legacyEndCards(deleted)).toEqual([]);
    expect(upgradeEndCard(deleted, recipe)).toBeUndefined();
  });

  it("opens as a valid bundle with the registry's recipe file", async () => {
    const old = hidden(await legacyMixBundle());
    const up = (await upgradeBundle(old, example))!;
    expect(up.note).toContain("13 End card · produced by Genobi 2026");
    expect(up.bundle.files.get(recipe.file.path)).toBeDefined();
    expect(up.bundle.files.has("media/mix-end.mp4")).toBe(true);
    const shot = up.bundle.project.layers.find((l) => l.id === "shot-13")!;
    expect(shot).toMatchObject({ opacity: 0, assetId: "mix-end" });
    expect(await upgradeBundle(await mixBundle(), example)).toBeUndefined();
  });
});

describe("opening the owner's saved copy", () => {
  it("opens the copy, upgrades it as an undoable edit and saves it", async () => {
    const harness = await setup();
    const fetcher = ((input: string, init: RequestInit = {}) =>
      fetch(`${harness.base}${input}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          cookie: harness.cookie,
        },
      })) as typeof fetch;
    // The copy an earlier page left, from before #221.
    const saved = hidden(await legacyMixBundle());
    await pushCopy(saved, null, new Set(), fetcher);
    const store = createStudioStore();
    const notices: string[] = [];
    const sync = new CopySync({
      store,
      fetcher,
      debounce: 10,
      notice: (text) => notices.push(text),
      live: () => {},
      upgrade: (b) => upgradeBundle(b, example),
    });
    // The gallery opens the current template; the page asks for the copy.
    store.getState().actions.initialize(await mixBundle());
    await sync.push();
    const open = store.getState().director;
    expect(open.bundle!.project.revision).toBe(80);
    expect(
      open.bundle!.project.layers.filter((l) =>
        ["shot-13", "end-card"].includes(l.id),
      ),
    ).toMatchObject([
      { id: "shot-13", opacity: 0 },
      { id: "end-card", startFrame: 453, durationFrames: 102, opacity: 1 },
    ]);
    // Undo returns to the copy as it was saved.
    expect(open.history.at(-1)!.project.revision).toBe(79);
    // The notice row shows the last line: what opened, and what changed.
    expect(notices.at(-1)).toMatch(
      /^Opened this project's saved copy \(revision 79\)\. The end card is now the editable End card layer/,
    );
    expect(await sync.flush()).toBe(true);
    const copy = (await (
      await fetcher(`/api/projects/${saved.project.id}`)
    ).json()) as { project: Bundle["project"] };
    expect(copy.project.revision).toBe(80);
    expect(copy.project.layers.some((l) => l.id === "end-card")).toBe(true);
  });
});

describe("an agent writing to the copy before the upgrade is saved", () => {
  it("keeps the agent's revision and asks the person nothing", async () => {
    const harness = await studio();
    const saved = hidden(await legacyMixBundle());
    await pushCopy(saved, null, new Set(), harness.fetcher);
    const store = createStudioStore();
    const notices: string[] = [];
    const asked: unknown[] = [];
    const sync = new CopySync({
      store,
      fetcher: harness.fetcher,
      debounce: 60_000,
      notice: (text) => notices.push(text),
      live: () => {},
      conflict: (question) => asked.push(question),
      upgrade: (b) => upgradeBundle(b, example),
    });
    store.getState().actions.initialize(await mixBundle());
    await sync.push();
    expect(store.getState().director.bundle!.project.revision).toBe(80);
    // The agent's command lands first, on the saved revision.
    const agent = await harness.agent(saved.project.id, 79, {
      op: "set-parameters",
      layerId: "hud",
      parameters: { text: "AGENT EDIT" },
    });
    expect(agent.revision).toBe(80);
    sync.stop();
    await sync.push();
    expect(await sync.flush()).toBe(true);
    const open = store.getState().director.bundle!.project;
    // The agent's edit, upgraded again on top, saved as the next revision.
    expect(open.layers.find((l) => l.id === "hud")).toMatchObject({
      parameters: { text: "AGENT EDIT" },
    });
    expect(open.layers.some((l) => l.id === "end-card")).toBe(true);
    expect(asked).toEqual([]);
    expect(notices.join(" ")).not.toContain("your version");
  });
});
