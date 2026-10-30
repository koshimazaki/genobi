import { afterEach, describe, expect, it, vi } from "vitest";
import { houseTemplates } from "../shared/templates/catalogue";
import { buildTemplateBundle } from "../src/director/house-template";
import { runDirectorCommand } from "../src/director/remix-commands";
import { mediaSlots } from "../src/director/remix-slots";
import { addTrack } from "../shared/director/assets";
import { missingTrack } from "../shared/director/track-slot";
import { laneId } from "../shared/director/tracks";
import { base, samples } from "./house-template-fixtures";

afterEach(() => vi.unstubAllGlobals());

const template = (id: string) => houseTemplates.find((t) => t.id === id)!;
/** The anime teaser as the gallery opens it with no song dropped. */
const teaser = () =>
  buildTemplateBundle(
    base(),
    template("anime-teaser"),
    {},
    samples(template("anime-teaser")),
  );
function bundleOf(result: Awaited<ReturnType<typeof runDirectorCommand>>) {
  if (!("bundle" in result) || !result.bundle) throw new Error("No bundle");
  return result.bundle;
}
/** No media element here: one that has read an audio file's metadata. */
function audioElement(duration: number) {
  vi.stubGlobal("document", {
    createElement: () => ({
      preload: "",
      src: "",
      readyState: 1,
      duration,
      removeAttribute() {},
      load() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}
const wav = () =>
  new File([new Uint8Array([82, 73, 70, 70, 9, 8, 7])], "song.wav", {
    type: "audio/wav",
  });

describe("a template's track before it has a lane", () => {
  it("offers the Track slot when the template declares one", async () => {
    const { project } = await teaser();
    expect(project.layers.some((l) => l.kind === "audio")).toBe(false);
    expect(mediaSlots(project)).toEqual([
      expect.objectContaining({
        id: "track",
        layerIds: ["track"],
        locked: false,
        hint: expect.stringMatching(/adds the soundtrack/),
      }),
    ]);
  });

  it("offers no Track slot on a template without an audio track", async () => {
    const sheet = template("sheet-to-shot");
    const { project } = await buildTemplateBundle(
      base(),
      sheet,
      {},
      samples(sheet),
    );
    expect(missingTrack(project)).toBeUndefined();
    expect(mediaSlots(project)).toEqual([]);
  });

  it("a dropped file adds the lane at the bottom and plays on it", async () => {
    audioElement(3);
    const before = await teaser();
    const result = await runDirectorCommand(
      before,
      { op: "replace", revision: before.project.revision, layerIds: ["track"] },
      wav(),
    );
    const p = bundleOf(result).project;
    const layer = p.layers[0];
    expect(layer).toMatchObject({
      id: "track",
      name: "Track",
      kind: "audio",
      startFrame: 0,
      durationFrames: 90,
      sourceStartFrame: 0,
      gain: 1,
      locked: false,
    });
    if (layer.kind !== "audio") throw new Error("Not audio");
    expect(p.assets[layer.assetId]).toMatchObject({
      kind: "audio",
      use: "production",
    });
    expect(laneId(p.layers[1])).toBe("shots");
    expect(p.revision).toBe(before.project.revision + 1);
    expect(mediaSlots(p).at(-1)?.hint).toMatch(/replaces the soundtrack/);
  });

  it("Choose from project adds the lane with a project audio asset", async () => {
    const before = await teaser();
    const audio = base().project.assets.audio;
    before.project.assets.song = { ...audio, use: "reference" };
    before.files.set(audio.file.path, base().files.get(audio.file.path)!);
    const p = bundleOf(
      await runDirectorCommand(before, {
        op: "use-asset",
        revision: before.project.revision,
        assetId: "song",
        layerIds: ["track"],
      }),
    ).project;
    const layer = p.layers.find((l) => l.id === "track");
    expect(layer).toMatchObject({ kind: "audio", durationFrames: 180 });
    if (layer?.kind !== "audio") throw new Error("Not audio");
    expect(p.assets[layer.assetId].use).toBe("production");
  });

  it("adds a lane only for audio and only once", async () => {
    const { project } = await teaser();
    const lane = { id: "track", name: "Track" };
    const picture = Object.keys(project.assets).find(
      (id) => project.assets[id].kind === "image",
    )!;
    expect(() => addTrack(project, picture, lane, [], "a")).toThrow(/WAV/);
    project.assets.song = { ...base().project.assets.audio };
    const added = addTrack(project, "song", lane, ["shots"], "a");
    expect(() => addTrack(added, "song", lane, [], "a")).toThrow(/taken/);
  });
});
