import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_LIMITS,
  bound,
  createTakeLibrary,
  libraryEntry,
  memoryBackend,
  type LibraryTake,
  type TakeBackend,
} from "../src/world-builder/take-library";
import {
  builtInPresets,
  findPreset,
  parseSaved,
  presetBody,
  withSaved,
  SAVED_PRESETS,
} from "../src/world-builder/world-presets";
import {
  presetRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import { applyPreset } from "../src/world-builder/useSceneLibrary";
import { connectWorld } from "../src/world-builder/agent-bridge";
import { worldCommand } from "../shared/world-control";
import type { Take } from "../src/world-builder/export-take";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";

const MB = 1024 * 1024;
function take(name: string, bytes = 1000, mode?: "live"): Take {
  const recipe = presetRecipe("Studio");
  return {
    ...(mode && { mode }),
    name,
    video: new Blob([new Uint8Array(bytes)], { type: "video/webm" }),
    first: new Blob(["png"], { type: "image/png" }),
    manifest: new Blob(
      [
        JSON.stringify(
          mode
            ? { mode: "live-session", duration: 3.2, recipe }
            : { frameCount: 121, duration: 121 / 24, recipe },
        ),
      ],
      { type: "application/json" },
    ),
  };
}

describe("take library", () => {
  it("reads length, mode and recipe from the receipt", async () => {
    const fixed = await libraryEntry(take("a"), 1, "id-a");
    expect(fixed).toMatchObject({
      id: "id-a",
      mode: "fixed",
      frames: 121,
      width: 1280,
      height: 704,
    });
    expect(fixed.seconds).toBeCloseTo(121 / 24);
    expect(fixed.recipe?.scene).toBe("stage");
    const live = await libraryEntry(take("b", 10, "live"));
    expect(live).toMatchObject({ mode: "live", frames: null, seconds: 3.2 });
  });

  it("appends newest first and evicts the oldest past 20 takes", async () => {
    const backend = new Map<string, LibraryTake>();
    const lib = createTakeLibrary(memoryBackend(backend));
    for (let i = 0; i < LIBRARY_LIMITS.takes + 3; i++)
      await lib.append(take(`t${i}`), i);
    expect(lib.list()).toHaveLength(20);
    expect(lib.list()[0].name).toBe("t22");
    expect(lib.list().at(-1)!.name).toBe("t3");
    expect(backend.size).toBe(20);
  });

  it("evicts by bytes as well as count", () => {
    const row = (id: string, at: number, bytes: number) =>
      ({ id, createdAt: at, bytes }) as LibraryTake;
    const { keep, evicted } = bound(
      [
        row("old", 1, 300 * MB),
        row("mid", 2, 150 * MB),
        row("new", 3, 200 * MB),
      ],
      LIBRARY_LIMITS,
    );
    expect(keep.map((t) => t.id)).toEqual(["new", "mid"]);
    expect(evicted.map((t) => t.id)).toEqual(["old"]);
  });

  it("persists and restores through the backend, dropping malformed rows", async () => {
    const backend = new Map<string, LibraryTake>();
    const first = createTakeLibrary(memoryBackend(backend));
    await first.append(take("kept"), 5);
    backend.set("junk", { id: "junk" } as LibraryTake);
    const reopened = createTakeLibrary(memoryBackend(backend));
    const list = await reopened.load();
    expect(list.map((t) => t.name)).toEqual(["kept"]);
    expect(list[0].recipe).toEqual(validateRecipe(presetRecipe("Studio")));
    await reopened.remove(list[0].id);
    expect(backend.has(list[0].id)).toBe(false);
  });

  it("works without storage, for the tab only", async () => {
    const broken: TakeBackend = {
      all: () => Promise.reject(new Error("blocked")),
      put: () => Promise.reject(new Error("blocked")),
      delete: () => Promise.reject(new Error("blocked")),
    };
    const lib = createTakeLibrary(broken);
    expect(await lib.load()).toEqual([]);
    await lib.append(take("x"));
    expect(lib.list()).toHaveLength(1);
    expect(lib.persisted()).toBe(false);
  });
});

describe("scene presets", () => {
  it("bundles every move recipe plus Fall · big room, all valid", () => {
    const presets = builtInPresets();
    const names = presets.map((p) => p.name);
    for (const move of [
      "crouch",
      "fall",
      "jog",
      "jump",
      "roll",
      "sit",
      "sprint",
      "sword",
    ])
      expect(names).toContain(`Move · ${move}`);
    for (const p of presets) expect(validateRecipe(p.recipe)).toEqual(p.recipe);
    const big = findPreset("Fall · big room", []).recipe;
    expect(big.avatarMotion).toEqual([
      { clip: "idle", seconds: 2 },
      { clip: "hit", seconds: 0.5 },
      { clip: "fall", seconds: 4 },
    ]);
    expect(big.objects.some((o) => o.id === "room-floor")).toBe(true);
    expect(big.frames).toBe(241);
    expect(Math.abs(big.orbit)).toBeLessThanOrEqual(90);
  });

  it("saves, replaces by name, bounds and strips media", () => {
    const recipe = {
      ...presetRecipe("Studio"),
      envelope: [0.5, 0.2],
      textures: { "screen/all": { name: "private.mp4", type: "video" } },
    };
    let saved = withSaved([], "  Mine\u0007 ", recipe);
    expect(saved[0].name).toBe("Mine");
    expect(saved[0].recipe.textures).toEqual({});
    expect(saved[0].recipe.envelope).toEqual([]);
    saved = withSaved(saved, "Mine", presetRecipe("Monument"));
    expect(saved).toHaveLength(1);
    for (let i = 0; i < SAVED_PRESETS + 2; i++)
      saved = withSaved(saved, `p${i}`, recipe);
    expect(saved).toHaveLength(SAVED_PRESETS);
    expect(() => withSaved([], "Fall · big room", recipe)).toThrow(/built-in/);
    expect(() => withSaved([], "   ", recipe)).toThrow(/Name/);
  });

  it("reads saved presets back and skips what no longer validates", () => {
    const raw = JSON.stringify([
      { name: "ok", recipe: presetRecipe("Studio") },
      { name: "bad", recipe: { frames: 7 } },
      "nonsense",
    ]);
    expect(parseSaved(raw).map((p) => p.name)).toEqual(["ok"]);
    expect(parseSaved("{not json")).toEqual([]);
    expect(() => presetBody({ unknownField: 1 })).toThrow();
  });
});

function fakeScene(mode: "shot" | "edit" | "walk" = "shot") {
  let current: Recipe = validateRecipe({
    ...presetRecipe("Studio"),
    envelope: [0.1, 0.9],
  });
  const s = {
    setPlaying: vi.fn(),
    api: {
      current: {
        getRecipe: () => structuredClone(current),
        configure: async (input: unknown) => (current = validateRecipe(input)),
      } as unknown as SceneAdapter,
    },
  };
  const e = { mode, chooseMode: vi.fn(), select: vi.fn() };
  return { s, e, recipe: () => current };
}

describe("loading a preset", () => {
  it("stops Play, returns Build to Shot and keeps the current sound", async () => {
    const { s, e, recipe } = fakeScene("edit");
    const preset = findPreset("Move · fall", []);
    await applyPreset(s, e, preset.recipe);
    expect(s.setPlaying).toHaveBeenCalledWith(false);
    expect(e.chooseMode).toHaveBeenCalledWith("shot");
    expect(recipe().avatarMotion).toEqual(preset.recipe.avatarMotion);
    expect(recipe().envelope).toEqual([0.1, 0.9]);
  });

  it("refuses from Walk", async () => {
    const { s, e } = fakeScene("walk");
    await expect(
      applyPreset(s, e, findPreset("Move · jog", []).recipe),
    ).rejects.toThrow(/Shot camera/);
  });

  it("refuses an unknown name", () => {
    expect(() => findPreset("Nope", [])).toThrow(/No preset/);
  });
});

describe("agent library commands", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses presets, load-preset and takes", () => {
    expect(worldCommand.parse({ op: "presets" })).toEqual({ op: "presets" });
    expect(
      worldCommand.parse({ op: "load-preset", name: "Fall · big room" }),
    ).toMatchObject({ name: "Fall · big room" });
    expect(() => worldCommand.parse({ op: "load-preset", name: "" })).toThrow();
    expect(() =>
      worldCommand.parse({ op: "load-preset", name: "x".repeat(41) }),
    ).toThrow();
  });

  it("loads a preset through the paired bridge", async () => {
    const { s, e, recipe } = fakeScene();
    const adapter = {
      live: { stop: vi.fn() },
      loadPreset: (name: string) =>
        applyPreset(s, e, findPreset(name, []).recipe),
    } as unknown as SceneAdapter;
    const results: unknown[] = [];
    let served = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = (data: unknown) =>
          new Response(JSON.stringify(data), { status: 200 });
        if (url.endsWith("/connect"))
          return body({ id: "w1", code: "c".repeat(32) });
        if (url.endsWith("/next")) {
          if (served) return body(null);
          served = true;
          return body({
            id: "job",
            command: { op: "load-preset", name: "Fall · big room" },
          });
        }
        if (url.endsWith("/commands/job")) {
          results.push(JSON.parse(String(init?.body)));
          return body({ accepted: true });
        }
        return body({});
      }),
    );
    const link = await connectWorld(adapter, () => {});
    await vi.waitFor(() => expect(results).toHaveLength(1));
    link.disconnect();
    expect(results[0]).toEqual({
      state: "done",
      result: {
        name: "Fall · big room",
        scene: "stage",
        frames: 241,
        seconds: 241 / 24,
        // The loaded recipe itself, as the docs promise.
        recipe: recipe(),
      },
    });
    expect(recipe().frames).toBe(241);
  });
});

describe("Library copy", () => {
  it("says where takes stay, in the studio and in the Comfy node", async () => {
    const { emptyLibraryHint } =
      await import("../src/world-builder/SceneLibrary");
    expect(emptyLibraryHint(false)).toMatch(/stays in this browser/);
    expect(emptyLibraryHint(false)).toMatch(/add or send a take/);
    expect(emptyLibraryHint(true)).toMatch(/with this ComfyUI in this browser/);
    expect(emptyLibraryHint(true)).toMatch(/send a take to the node/);
  });
});
