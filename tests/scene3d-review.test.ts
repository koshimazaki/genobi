/**
 * Regressions from the PR 52 review: a capture's scene is isolated from the
 * preview, a plate pick restarts playback, and a late cancel imports nothing.
 */
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYBLAST_FPS } from "../shared/camera-path-playblast";
import { buildScene, snapshotScene } from "../src/scene3d/build-scene";
import { DEFAULT_RIG } from "../src/scene3d/combo";
import {
  idleClock,
  pauseClock,
  pickClock,
  playClock,
  rescaleClock,
  seekClock,
  tickClock,
} from "../src/scene3d/plate-clock";
import type { PlayblastJob } from "../src/scene3d/playblast";
import { PLATE_BY_ID } from "../src/scene3d/plates";
import { plateCameraPath } from "../src/scene3d/plate-path";
import { renderAndSave } from "../src/scene3d/save-playblast";
import { SCENE_BY_ID } from "../src/scene3d/scenes";

// The encoder needs WebCodecs; this stand-in records the calls and lets a
// test run code inside `finalize`, where a late cancel can land.
const encoder = vi.hoisted(() => ({
  onFinalize: () => {},
  cancelled: 0,
  frames: 0,
}));
vi.mock("mediabunny", () => {
  class Output {
    state = "pending";
    addVideoTrack() {}
    setMetadataTags() {}
    async start() {
      this.state = "started";
    }
    async finalize() {
      encoder.onFinalize();
      this.state = "finalized";
    }
    async cancel() {
      encoder.cancelled++;
      this.state = "canceled";
    }
  }
  return {
    Output,
    BufferTarget: class {
      buffer = new ArrayBuffer(16);
    },
    CanvasSource: class {
      async add() {
        encoder.frames++;
      }
      close() {}
    },
    Mp4OutputFormat: class {},
    Quality: class {},
    getFirstEncodableVideoCodec: async () => "avc",
  };
});
const { renderPlayblast } = await import("../src/scene3d/playblast");

const palette = (hex: string) => () => new THREE.Color(hex);
function materials(root: THREE.Object3D) {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (Array.isArray(m)) m.forEach((x) => out.add(x));
    else if (m) out.add(m);
  });
  return out;
}

describe("capture scene snapshot", () => {
  it("shares no objects or materials with the preview", () => {
    const preview = buildScene(SCENE_BY_ID.set, palette("#ff0000"));
    const snap = snapshotScene(SCENE_BY_ID.set, palette("#ff0000"));
    const shared = [...materials(snap.scene)].filter((m) =>
      materials(preview.root).has(m),
    );
    expect(shared).toEqual([]);
    expect(snap.hero).not.toBe(preview.hero);
  });

  it("keeps its scene and colours when the preview changes mid-render", () => {
    const snap = snapshotScene(SCENE_BY_ID.set, palette("#ff0000"));
    const before = snap.scene.children[0].children.length;
    const hero = snap.hero.children[0] as THREE.Mesh;
    const colour = (hero.material as THREE.MeshStandardMaterial).color.getHex();
    // The visitor switches scene and theme while the clip renders.
    const preview = buildScene(SCENE_BY_ID.set, palette("#ff0000"));
    preview.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m?.color?.set("#00ff00");
      (o as THREE.Mesh).geometry?.dispose();
    });
    buildScene(SCENE_BY_ID["acoustic-room"], palette("#00ff00"));
    expect(snap.scene.children[0].children.length).toBe(before);
    expect((hero.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      colour,
    );
    expect(colour).toBe(0xff0000);
  });

  it("is built from the spec it was given", () => {
    const set = snapshotScene(SCENE_BY_ID.set, palette("#808080"));
    const room = snapshotScene(
      SCENE_BY_ID["acoustic-room"],
      palette("#808080"),
    );
    const planes = (s: THREE.Scene) => {
      let n = 0;
      s.traverse((o) => {
        if ((o as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) n++;
      });
      return n;
    };
    // The set has a ground plane; the room has its own floor plane.
    expect(planes(set.scene)).toBe(1);
    expect(planes(room.scene)).toBe(1);
    expect(set.scene.children[0].children.length).not.toBe(
      room.scene.children[0].children.length,
    );
    set.dispose();
    room.dispose();
  });
});

describe("plate playback clock", () => {
  const seconds = 5;

  it("restarts from zero when a plate is picked during playback", () => {
    // The old plate has been playing for 3 s (t = 0.6).
    let clock = playClock(idleClock, 0, seconds);
    clock = tickClock(clock, 3000, seconds);
    expect(clock.t).toBeCloseTo(0.6, 6);
    clock = pickClock(3000, false);
    expect(clock).toEqual({ t: 0, playing: true, origin: 3000 });
    // The next frame advances the new session, not the old one.
    clock = tickClock(clock, 3500, seconds);
    expect(clock.t).toBeCloseTo(0.1, 6);
    expect(clock.playing).toBe(true);
  });

  it("does not start on a pick under reduced motion", () => {
    const clock = pickClock(1000, true);
    expect(clock.playing).toBe(false);
    expect(tickClock(clock, 9000, seconds)).toBe(clock);
  });

  it("plays once, stops at the end, and replays from zero", () => {
    let clock = playClock(idleClock, 0, seconds);
    clock = tickClock(clock, 6000, seconds);
    expect(clock).toMatchObject({ t: 1, playing: false });
    clock = playClock(clock, 10_000, seconds);
    expect(clock.t).toBe(0);
    expect(tickClock(clock, 11_000, seconds).t).toBeCloseTo(0.2, 6);
  });

  it("pauses, seeks and keeps position when the length changes", () => {
    let clock = tickClock(playClock(idleClock, 0, seconds), 2500, seconds);
    expect(pauseClock(clock).playing).toBe(false);
    expect(seekClock(1.4)).toEqual({ t: 1, playing: false, origin: 0 });
    clock = rescaleClock(clock, 2500, 10);
    expect(tickClock(clock, 2500, 10).t).toBeCloseTo(0.5, 6);
  });
});

describe("playblast cancellation", () => {
  const frames = 9;
  function job(controller: AbortController): PlayblastJob {
    const plate = PLATE_BY_ID["push-in"];
    const scene = SCENE_BY_ID.set;
    return {
      title: "Playblast · Push in",
      capture: {
        canvas: {} as HTMLCanvasElement,
        render: vi.fn(),
        dispose: vi.fn(),
      },
      receipt: {
        format: "genobi.playblast",
        version: 1,
        scene: scene.id,
        plate: plate.id,
        gestures: [],
        ease: DEFAULT_RIG.ease,
        fps: PLAYBLAST_FPS,
        frames,
        width: 1280,
        height: 704,
        cameraPath: plateCameraPath(
          plate,
          scene,
          { ...DEFAULT_RIG, duration: (frames - 1) / PLAYBLAST_FPS },
          [],
          frames,
        ),
      },
      frame: () => ({
        pose: { position: [0, 2, 9], target: [0, 1, 0], fov: 38, roll: 0 },
        object: { spin: 0, lift: 0 },
      }),
      signal: controller.signal,
      onFrame: () => {},
    };
  }
  beforeEach(() => {
    encoder.onFinalize = () => {};
    encoder.cancelled = 0;
    encoder.frames = 0;
  });

  it("renders every frame to an MP4 blob when nothing is cancelled", async () => {
    const blob = await renderPlayblast(job(new AbortController()));
    expect(blob.type).toBe("video/mp4");
    expect(encoder.frames).toBe(frames);
  });

  it("rejects a cancel that lands during finalisation", async () => {
    const controller = new AbortController();
    encoder.onFinalize = () => controller.abort();
    await expect(renderPlayblast(job(controller))).rejects.toThrow();
    expect(encoder.frames).toBe(frames);
    // Finalised output is not cancelled again; nothing is returned.
    expect(encoder.cancelled).toBe(0);
  });

  it("imports nothing when the cancel lands after rendering", async () => {
    const controller = new AbortController();
    const save = vi.fn(async () => {});
    const render = vi.fn(async () => {
      controller.abort();
      return new Blob(["mp4"], { type: "video/mp4" });
    });
    await expect(
      renderAndSave(job(controller), "p.mp4", "Playblast", { render, save }),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves once, as an MP4 file, when it completes", async () => {
    const save = vi.fn(async () => {});
    const render = async () => new Blob(["mp4"], { type: "video/mp4" });
    await renderAndSave(
      job(new AbortController()),
      "p.mp4",
      "Playblast · Push in",
      {
        render,
        save,
      },
    );
    expect(save).toHaveBeenCalledTimes(1);
    const [file, name, signal] = save.mock.calls[0] as unknown as [
      File,
      string,
      AbortSignal,
    ];
    // The import gets the signal, to check it again before committing.
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(file.name).toBe("p.mp4");
    expect(file.type).toBe("video/mp4");
    expect(name).toBe("Playblast · Push in");
  });
});
