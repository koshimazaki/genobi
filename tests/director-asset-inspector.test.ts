import { describe, expect, it } from "vitest";
import type { Asset, Layer } from "../shared/director/types";
import {
  clipsOf,
  durationLabel,
  linkedAsset,
  linkedClip,
  pointLabel,
  posterSeconds,
  rangeLabel,
  sourceRange,
} from "../src/director/clip-source";
import { cachedPoster, posterKey, requestPoster } from "../src/director/poster";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";

const video: Asset = {
  kind: "video",
  use: "production",
  origin: "uploaded",
  file: { path: "media/clip.mp4", sha256: "a".repeat(64) },
  durationSeconds: 2.04,
};
const clip = (patch: Partial<Layer> = {}) =>
  ({
    id: "shot",
    name: "shot",
    kind: "video",
    assetId: "clip",
    sourceStartFrame: 6,
    startFrame: 31,
    durationFrames: 30,
    locked: false,
    fit: "contain",
    opacity: 1,
    position: { x: 0, y: 0 },
    scale: 1,
    rotationDegrees: 0,
    ...patch,
  }) as Layer;

describe("a clip's place in its source", () => {
  it("reads the in and out frames the renderer draws, with handles", () => {
    const r = sourceRange(clip(), video, 24)!;
    expect(r).toEqual({
      inFrame: 6,
      outFrame: 35,
      inSeconds: 0.25,
      outSeconds: 35 / 24,
      // floor(2.04 × 24) = 48 whole source frames.
      sourceFrames: 48,
      head: 6,
      tail: 12,
    });
    expect(rangeLabel(r)).toBe("0.25–1.46 s");
    expect(pointLabel(r.inFrame, 24)).toBe("f 6 · 0.250 s");
    expect(pointLabel(r.outFrame, 24)).toBe("f 35 · 1.458 s");
  });

  it("keeps an exact final frame and never reports a negative tail", () => {
    // A 2 s file at 24 fps has 48 frames; the browser may round the duration down.
    const exact = { ...video, durationSeconds: 2 - 5e-7 };
    expect(sourceRange(clip({ sourceStartFrame: 18 }), exact, 24)!.tail).toBe(
      0,
    );
    expect(sourceRange(clip({ sourceStartFrame: 40 }), exact, 24)!.tail).toBe(
      0,
    );
    const unknown = { ...video, durationSeconds: undefined };
    const r = sourceRange(clip(), unknown, 24)!;
    expect(r.sourceFrames).toBeUndefined();
    expect(r.tail).toBeUndefined();
  });

  it("has no source range for images and graphics", () => {
    const image = { ...clip(), kind: "image" } as Layer;
    delete (image as { sourceStartFrame?: number }).sourceStartFrame;
    expect(sourceRange(image, video, 24)).toBeUndefined();
  });

  it("labels durations under and over a minute", () => {
    expect(durationLabel(6)).toBe("6.00 s");
    expect(durationLabel(62.5)).toBe("1:02.50");
    expect(durationLabel(Number.NaN)).toBe("");
  });
});

describe("cards and clips select each other", () => {
  const { project } = assetFixture();

  it("finds an asset's clips in timeline order and the clip a card shows", () => {
    expect(clipsOf(project, "video").map((l) => l.id)).toEqual(["plate"]);
    expect(linkedAsset(project, "plate")).toBe("video");
    expect(linkedAsset(project, "title")).toBe("");
    expect(linkedAsset(project, "absent")).toBe("");
    expect(linkedClip(project, "video", "title")?.id).toBe("plate");
    expect(linkedClip(project, "moodboard", "plate")).toBeUndefined();
    const fps = project.composition.fps;
    const later = structuredClone(project);
    const plate = later.layers.find((l) => l.id === "plate")!;
    if ("sourceStartFrame" in plate) plate.sourceStartFrame = fps;
    expect(posterSeconds(later, "video", "plate")).toBe(1);
    expect(posterSeconds(later, "moodboard", "plate")).toBe(0);
  });

  it("selecting a clip selects its asset; an explicit asset choice stands", () => {
    const store = createStudioStore();
    store.getState().actions.initialize(assetFixture());
    const { workspace } = store.getState().actions;
    workspace({ selected: "plate" });
    expect(store.getState().workspace.assetSelection).toBe("video");
    workspace({ selected: "title" });
    expect(store.getState().workspace.assetSelection).toBe("");
    workspace({ selected: "photo-1", assetSelection: "image-2" });
    expect(store.getState().workspace.assetSelection).toBe("image-2");
    workspace({ drawerOpen: true });
    expect(store.getState().workspace.assetSelection).toBe("image-2");
  });
});

describe("the asset selection follows a replaced source", () => {
  it("moves with the selected clip on commit and undo", () => {
    const store = createStudioStore();
    const bundle = assetFixture();
    store.getState().actions.initialize(bundle);
    const { actions } = store.getState();
    actions.workspace({ selected: "plate" });
    const next = structuredClone(bundle.project);
    next.assets["video-2"] = structuredClone(next.assets.video);
    const plate = next.layers.find((l) => l.id === "plate")!;
    if ("assetId" in plate) plate.assetId = "video-2";
    actions.commit({ ...bundle, project: next });
    expect(store.getState().workspace.assetSelection).toBe("video-2");
    actions.undo();
    expect(store.getState().workspace.assetSelection).toBe("video");
    // A deliberate other choice is not overridden by an edit.
    actions.workspace({ assetSelection: "image-1" });
    actions.commit({ ...bundle, project: next });
    expect(store.getState().workspace.assetSelection).toBe("image-1");
  });
});

describe("poster cache", () => {
  it("draws once per file hash and source time, and skips a card that left", async () => {
    let draws = 0;
    const blob = new Blob(["x"]);
    const draw = async () => {
      draws++;
      return blob;
    };
    const key = posterKey(video, 0.25);
    expect(key).toBe(`${"a".repeat(64)}@0.2500`);
    expect(posterKey({ ...video, kind: "image" }, 3)).toBe("a".repeat(64));
    const gone = new AbortController();
    gone.abort();
    expect(await requestPoster("left", draw, gone.signal)).toBeUndefined();
    expect(cachedPoster("left")).toBeUndefined();
    const live = new AbortController().signal;
    const [a, b] = await Promise.all([
      requestPoster(key, draw, live),
      requestPoster(key, draw, live),
    ]);
    expect(a).toBe(blob);
    expect(b).toBe(blob);
    expect(draws).toBe(1);
  });

  it("remembers a failed draw instead of retrying it on every render", async () => {
    let draws = 0;
    const fail = async (): Promise<Blob | null> => {
      draws++;
      throw new Error("decoder unavailable");
    };
    const live = new AbortController().signal;
    expect(await requestPoster("broken", fail, live)).toBeNull();
    expect(await requestPoster("broken", fail, live)).toBeNull();
    expect(draws).toBe(1);
  });

  it("keeps at most 96 posters, evicting the least recently used", async () => {
    const live = new AbortController().signal;
    const one = async () => new Blob(["p"]);
    await requestPoster("keep", one, live);
    for (let i = 0; i < 95; i++) await requestPoster(`fill-${i}`, one, live);
    expect(cachedPoster("keep")).toBeDefined(); // touched: now most recent
    for (let i = 95; i < 120; i++) await requestPoster(`fill-${i}`, one, live);
    // 25 more evict the 25 oldest fills; the touched poster survives.
    expect(cachedPoster("fill-0")).toBeUndefined();
    expect(cachedPoster("fill-24")).toBeUndefined();
    expect(cachedPoster("fill-25")).toBeDefined();
    expect(cachedPoster("keep")).toBeDefined();
    expect(cachedPoster("fill-119")).toBeDefined();
  });
});
