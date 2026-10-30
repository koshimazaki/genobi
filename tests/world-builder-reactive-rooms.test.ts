import { describe, expect, it, vi } from "vitest";
import type * as Three from "three";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { menuPreset } from "../src/world-builder/preset-menu";
import {
  REACTIVE_PROPS,
  REACTIVE_ROUTES,
  roomPresets,
} from "../src/world-builder/room-presets";
import { ORBIT_RANGE, orbitPosition } from "../src/world-builder/prop-orbit";
import { routeValue } from "../src/world-builder/mod-routes";
import { loopNotes } from "../src/world-builder/loop";
import { createWorld } from "../src/world-builder/runtime";

// createWorld without WebGL or assets: a stand-in renderer that keeps the
// scene it is asked to draw, and inert playground, character and media.
const drawn = vi.hoisted(() => ({ scene: null as unknown }));
vi.mock("three", async (original) => {
  const T = await original<typeof Three>();
  class WebGLRenderer {
    shadowMap = { enabled: false, type: 0 };
    outputColorSpace = "";
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown) {
      drawn.scene = scene;
    }
    dispose() {}
  }
  return { ...T, WebGLRenderer };
});
vi.mock("../src/world-builder/playground", async () => {
  const T = await vi.importActual<typeof Three>("three");
  return {
    loadPlayground: async () => ({
      group: new T.Group(),
      avatar: new T.Group(),
      editable: new Map(),
      base: new Map(),
      configure() {},
      pose() {},
      duration: () => 1,
      dispose() {},
    }),
  };
});
vi.mock("../src/world-builder/interaction", () => ({
  createInteraction: () => ({ mode: "shot", refresh() {}, dispose() {} }),
}));
vi.mock("../src/world-builder/character", async () => {
  const T = await vi.importActual<typeof Three>("three");
  return {
    createBuilderCharacter: () => ({
      root: new T.Group(),
      prepare: async () => {},
      sample() {},
      walk() {},
      freeze() {},
      thaw() {},
      appearance() {},
      assertReady() {},
      dispose() {},
    }),
  };
});
vi.mock("../src/world-builder/depth-pass", () => ({
  createDepthPass: () => ({ render() {}, dispose() {} }),
}));
vi.mock("../src/world-builder/scene-media", () => ({
  createSceneMedia: () => ({
    texture: () => undefined,
    has: () => false,
    seek: async () => {},
    retain() {},
    clear() {},
    load: async () => {},
    assertReady() {},
    dispose() {},
  }),
}));

const rooms = Object.keys(roomPresets);

describe("Room presets for reactive testing", () => {
  it("adds a low-band sphere and an inverted, spinning mid-band cube to every room", () => {
    expect(rooms).toEqual(["Small room", "Acoustic room", "Club", "Cathedral"]);
    for (const name of rooms) {
      const r = presetRecipe(name);
      // The room's own set stays.
      expect(r.objects.map((o) => o.id)).toEqual([
        "room-floor",
        "room-north",
        "room-east",
        "room-west",
        "pulse-sphere",
        "spin-cube",
      ]);
      const [sphere, cube] = r.objects.slice(-2);
      // Either side of the character, both circling it slowly.
      expect(Math.sign(sphere.x)).toBe(-Math.sign(cube.x));
      expect(sphere.orbit).toBeGreaterThan(0);
      expect(cube.orbit).toBe(sphere.orbit);
      expect(r.audioRoutes).toEqual(REACTIVE_ROUTES);
    }
    const by = (id: string) => REACTIVE_ROUTES.find((x) => x.id === id)!;
    expect(by("sphere-rise")).toMatchObject({
      source: "low",
      target: "prop:pulse-sphere",
      property: "height",
    });
    expect(by("sphere-grow")).toMatchObject({
      source: "low",
      property: "scale",
    });
    expect(by("cube-shrink")).toMatchObject({
      source: "mid",
      target: "prop:spin-cube",
      property: "scale",
      invert: true,
    });
    expect(by("cube-spin")).toMatchObject({ source: "mid", property: "spin" });
    expect(REACTIVE_PROPS).toHaveLength(2);
  });

  it("drives the sphere up with the lows and the cube down with the mids", () => {
    const r = validateRecipe({
      ...presetRecipe("Club"),
      frames: 9,
      bandEnvelopes: {
        low: [0, 0, 0, 0, 1, 1, 1, 1, 1],
        mid: [0, 0, 0, 0, 1, 1, 1, 1, 1],
        high: [],
      },
    });
    const by = (id: string) => r.audioRoutes.find((x) => x.id === id)!;
    expect(routeValue(r, by("sphere-rise"), 8)).toBeGreaterThan(
      routeValue(r, by("sphere-rise"), 0),
    );
    // Inverted: loud mids shrink the cube towards its own size.
    expect(routeValue(r, by("cube-shrink"), 8)).toBeLessThan(
      routeValue(r, by("cube-shrink"), 0),
    );
    expect(routeValue(r, by("cube-spin"), 8)).toBeGreaterThan(0);
  });

  it("gives the Small room the creature when attached, the mannequin when not", () => {
    expect(presetRecipe("Small room")).toMatchObject({
      avatar: true,
      avatarAsset: "creature",
    });
    expect(menuPreset("Small room", false)).toMatchObject({
      avatarAsset: "mannequin",
      creatureReference: null,
    });
    const attached = menuPreset("Small room", true);
    expect(attached.avatarAsset).toBe("creature");
    expect(attached.creatureReference?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Every preset the menu loads is a valid recipe.
    for (const name of rooms) {
      expect(() => validateRecipe(menuPreset(name, false))).not.toThrow();
      expect(menuPreset(name, false).avatarAsset).toBe("mannequin");
    }
  });
});

describe("Prop orbit", () => {
  const prop = (patch: Record<string, unknown>) => ({
    ...presetRecipe("Studio"),
    objects: [
      {
        id: "o",
        shape: "box",
        x: 1,
        y: 1,
        z: 0,
        scale: 1,
        spin: 0,
        color: "#ffffff",
        prompt: "",
        ...patch,
      },
    ],
  });
  it("accepts orbits within ±1 rad/s and a centre inside the stage", () => {
    expect(() =>
      validateRecipe(prop({ orbit: ORBIT_RANGE.max })),
    ).not.toThrow();
    expect(() =>
      validateRecipe(prop({ orbit: ORBIT_RANGE.min, orbitX: -40, orbitZ: 40 })),
    ).not.toThrow();
    for (const bad of [
      { orbit: 1.01 },
      { orbit: -1.5 },
      { orbit: Number.NaN },
      { orbit: "0.3" },
      { orbitX: 41 },
      { orbitZ: -40.5 },
    ])
      expect(() => validateRecipe(prop(bad))).toThrow(/Invalid primitive/);
  });

  it("circles the centre on the frame grid, and rounds to whole turns in a loop", () => {
    const p = { x: 1, z: 0, orbit: Math.PI / 2 };
    const [x, z] = orbitPosition(p, 1);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-1, 9);
    expect(orbitPosition({ x: 3, z: 2 }, 5)).toEqual([3, 2]);
    const [cx, cz] = orbitPosition(
      { x: 2, z: 0, orbit: Math.PI, orbitX: 1, orbitZ: 0 },
      1,
    );
    expect(cx).toBeCloseTo(0, 9);
    expect(cz).toBeCloseTo(0, 9);
    // 0.3 rad/s over a 4 s loop is 0.19 turns: it rounds up to one whole turn.
    const [lx, lz] = orbitPosition({ x: 1, z: 0, orbit: 0.3 }, 4, 4);
    expect(lx).toBeCloseTo(1, 9);
    expect(lz).toBeCloseTo(0, 9);
    const notes = loopNotes({ ...presetRecipe("Club"), loop: true });
    expect(notes.join(" ")).toMatch(
      /Orbits round to whole turns: pulse-sphere/,
    );
  });
});

describe("Orbit in the runtime", () => {
  it("draws the same orbit positions for a frame however it is reached", async () => {
    const world = createWorld(
      { width: 0, height: 0 } as HTMLCanvasElement,
      () => {},
    );
    world.configure({
      ...presetRecipe("Club"),
      avatar: false,
      bandEnvelopes: {
        low: Array.from({ length: 97 }, (_, i) => (i % 7) / 7),
        mid: Array.from({ length: 97 }, (_, i) => (i % 5) / 5),
        high: [],
      },
    });
    const positions = () => {
      const out: Record<string, number[]> = {};
      (drawn.scene as Three.Scene).traverse((o) => {
        const id = o.userData.editId as string | undefined;
        if (id === "prop:pulse-sphere" || id === "prop:spin-cube")
          out[id] = [
            ...o.position.toArray(),
            ...o.scale.toArray(),
            o.rotation.y,
          ];
      });
      return out;
    };
    await world.renderFrame(48);
    const first = positions();
    await world.renderFrame(90);
    const other = positions();
    await world.renderFrame(48);
    expect(Object.keys(first)).toHaveLength(2);
    expect(other).not.toEqual(first);
    expect(positions()).toEqual(first);
    // Frame 48 is two seconds in: from π, 0.6 rad on, counter-clockwise from above.
    const [x, , z] = first["prop:pulse-sphere"];
    expect(Math.atan2(-z, x)).toBeCloseTo(0.6 - Math.PI, 9);
    world.dispose();
  });
});
