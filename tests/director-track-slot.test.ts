import { afterEach, describe, expect, it, vi } from "vitest";
import { assetFixture, imageFile } from "./director-asset-fixture";
import { runDirectorCommand } from "../src/director/remix-commands";
import { digest } from "../src/director/bundle";
import { placeTrack } from "../shared/director/assets";
import { mediaSlots, trackLayer } from "../src/director/remix-slots";
import type { Layer, Project } from "../shared/director/types";

afterEach(() => vi.unstubAllGlobals());

function bundleOf(result: Awaited<ReturnType<typeof runDirectorCommand>>) {
  if (!("bundle" in result) || !result.bundle) throw new Error("No bundle");
  return result.bundle;
}

/** The example project, with a second audio asset of the given length. */
function withTrack(seconds: number, use: "production" | "reference") {
  const bundle = assetFixture();
  bundle.project.assets.song = {
    ...bundle.project.assets.audio,
    use,
    origin: "uploaded",
    file: { path: "media/song.wav", sha256: "a".repeat(64) },
    durationSeconds: seconds,
  };
  return bundle.project;
}
const score = (p: Project) =>
  p.layers.find((l) => l.id === "score") as Extract<Layer, { kind: "audio" }>;

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
  new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3])], "my song.wav", {
    type: "audio/wav",
  });

describe("the Track slot's replace rule", () => {
  it("keeps the start and cuts a shorter track to its own length", () => {
    const before = withTrack(2, "production");
    before.layers = before.layers.map((l) =>
      l.id === "score" ? { ...l, startFrame: 30, durationFrames: 150 } : l,
    );
    const p = placeTrack(before, "song", "score", "alias");
    expect(score(p)).toMatchObject({
      assetId: "song",
      startFrame: 30,
      durationFrames: 60,
      sourceStartFrame: 0,
    });
    expect(p.revision).toBe(before.revision + 1);
  });

  it("fills a longer track to the composition's end", () => {
    const before = withTrack(30, "production");
    before.layers = before.layers.map((l) =>
      l.id === "score" ? { ...l, durationFrames: 45 } : l,
    );
    expect(score(placeTrack(before, "song", "score", "alias"))).toMatchObject({
      startFrame: 0,
      durationFrames: 180,
    });
  });

  it("stops at the next clip on the same lane", () => {
    const before = withTrack(30, "production");
    const first = score(before);
    before.layers = before.layers.flatMap((l) =>
      l.id === "score"
        ? [
            { ...first, track: "music", durationFrames: 60 },
            {
              ...first,
              id: "score-2",
              track: "music",
              startFrame: 120,
              durationFrames: 60,
            },
          ]
        : [l],
    );
    expect(score(placeTrack(before, "song", "score", "alias"))).toMatchObject({
      durationFrames: 120,
    });
  });

  it("promotes a reference to a production alias", () => {
    const p = placeTrack(withTrack(6, "reference"), "song", "score", "alias");
    expect(p.assets.song.use).toBe("reference");
    expect(p.assets.alias).toMatchObject({ kind: "audio", use: "production" });
    expect(score(p).assetId).toBe("alias");
  });

  it("refuses a picture, a locked track and a picture layer", () => {
    const p = withTrack(6, "production");
    expect(() => placeTrack(p, "video", "score", "a")).toThrow(/WAV, MP3/);
    expect(() => placeTrack(p, "song", "plate", "a")).toThrow(/audio layer/);
    p.layers = p.layers.map((l) =>
      l.id === "score" ? { ...l, locked: true } : l,
    );
    expect(() => placeTrack(p, "song", "score", "a")).toThrow(/Unlock/);
  });
});

describe("replace and use-asset on an audio layer", () => {
  it("imports a dropped WAV as production audio and points the track at it", async () => {
    audioElement(3);
    const before = assetFixture();
    const result = await runDirectorCommand(
      before,
      { op: "replace", revision: before.project.revision, layerIds: ["score"] },
      wav(),
    );
    const p = bundleOf(result).project;
    const layer = score(p);
    expect(layer.assetId).not.toBe("audio");
    expect(p.assets[layer.assetId]).toMatchObject({
      kind: "audio",
      use: "production",
      durationSeconds: 3,
    });
    expect(p.assets[layer.assetId].file.path).toMatch(/\.wav$/);
    expect(layer).toMatchObject({ startFrame: 0, durationFrames: 90 });
    expect(p.revision).toBe(before.project.revision + 1);
  });

  it("refuses a picture for the track and a track among pictures", async () => {
    const before = assetFixture();
    const revision = before.project.revision;
    await expect(
      runDirectorCommand(
        before,
        { op: "replace", revision, layerIds: ["score"] },
        imageFile(),
      ),
    ).rejects.toThrow(/WAV, MP3 or FLAC/);
    await expect(
      runDirectorCommand(
        before,
        { op: "replace", revision, layerIds: ["score", "plate"] },
        wav(),
      ),
    ).rejects.toThrow(/one audio layer/);
  });

  it("uses a project audio asset with the same rule", async () => {
    const bundle = assetFixture();
    bundle.project = withTrack(2, "reference");
    const bytes = new Uint8Array([1, 2, 3]);
    bundle.files.set("media/song.wav", bytes);
    bundle.project.assets.song.file.sha256 = await digest(bytes);
    const result = await runDirectorCommand(bundle, {
      op: "use-asset",
      revision: bundle.project.revision,
      assetId: "song",
      layerIds: ["score"],
    });
    const p = bundleOf(result).project;
    expect(p.assets[score(p).assetId].use).toBe("production");
    expect(score(p).durationFrames).toBe(60);
  });
});

describe("the slots Make it yours offers", () => {
  it("adds a Track slot for the project's audio layer", () => {
    const { project } = assetFixture();
    expect(mediaSlots(project)).toEqual([
      expect.objectContaining({
        id: "track",
        layerIds: ["score"],
        locked: false,
        accept: expect.stringContaining("audio/flac"),
      }),
    ]);
  });

  it("prefers a house template's track layer and shows a lock", () => {
    const { project } = assetFixture();
    project.layers.push({
      ...score(project),
      id: "track",
      name: "Track",
      locked: true,
    });
    expect(trackLayer(project)?.id).toBe("track");
    expect(mediaSlots(project)[0]).toMatchObject({
      layerIds: ["track"],
      locked: true,
      hint: expect.stringMatching(/unlock/),
    });
  });

  it("offers no Track slot without an audio layer", () => {
    const { project } = assetFixture();
    project.layers = project.layers.filter((l) => l.kind !== "audio");
    expect(mediaSlots(project)).toEqual([]);
  });
});
