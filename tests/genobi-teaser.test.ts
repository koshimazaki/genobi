import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { LAYER_LIMIT } from "../shared/director/types";
import { findMixTemplate, mixTemplates } from "../shared/templates/catalogue";
import { genobiTeaser } from "../shared/templates/genobi-teaser";
import {
  beatSpan,
  checkMix,
  viewParameter,
  mixFrames,
  mixProject,
  type MixSpec,
} from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";
import * as zoomRecipe from "../docs/director-bundle/example/graphics/teaser-zoom.mjs";
import * as cursorRecipe from "../docs/director-bundle/example/graphics/teaser-cursor.mjs";

// The recipes' pure helpers, beside the createLayer every recipe exports.
type Point = { t?: number; x: number; y: number };
const { windowAt } = zoomRecipe as unknown as {
  windowAt: (
    p: Record<string, number>,
    t: number,
  ) => { zoom: number; x: number; y: number };
};
const { parsePath, parseClicks, pointAt } = cursorRecipe as unknown as {
  parsePath: (path: string) => Required<Point>[];
  parseClicks: (clicks: string) => number[];
  pointAt: (keys: Required<Point>[], t: number) => Point | null;
};

const TEASER_RECIPES = [
  "gen-title",
  "gen-image",
  "gen-status",
  "ui-zoom",
  "ui-cursor",
  "ui-focus",
  "signal-wipe",
  "paper-shader",
  "space-hud",
];
const mix = genobiTeaser.mix!;
const cut = mix.cut;
const root = new URL("../", import.meta.url);
const graphics = new URL("docs/director-bundle/example/", root);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const media = () =>
  Object.fromEntries(
    Object.entries(mix.media).map(([id, m]) => [
      id,
      { ...m, sha256: "0".repeat(64) },
    ]),
  );
const validate = (moduleId: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[moduleId].file.sha256}`](parameters);
const seconds = (beats: number) => (beats * 60) / cut.bpm;

describe("the teaser recipes in the trusted registry", () => {
  it.each(TEASER_RECIPES)("%s is registered with its file's hash", (id) => {
    const m = TRUSTED_RECIPES[id];
    expect(m).toBeDefined();
    expect(m.engine).toBe(m.mode === "filter" ? "threejs" : "animejs");
    expect(sha(readFileSync(new URL(m.file.path, graphics)))).toBe(
      m.file.sha256,
    );
    expect([...(m.parameterSchema.required as string[])].sort()).toEqual(
      Object.keys(m.parameterSchema.properties!).sort(),
    );
  });

  it("accepts every layer in the cut and refuses unsafe values", () => {
    for (const layer of cut.layers)
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    const image = cut.layers.find((l) => l.module === "gen-image")!;
    // A still is a same-origin /media/ path, never another origin or a script.
    for (const still of [
      "https://example.com/a.jpg",
      "/media/../x.jpg",
      "javascript:alert(1)",
      "/media/a.svg",
    ])
      expect(validate("gen-image", { ...image.parameters, still })).toBe(false);
    const title = cut.layers.find((l) => l.module === "gen-title")!;
    expect(
      validate("gen-title", { ...title.parameters, font: "x; color: red" }),
    ).toBe(false);
    expect(
      validate("gen-title", { ...title.parameters, text: "A\u0000" }),
    ).toBe(false);
    const cursor = cut.layers.find((l) => l.module === "ui-cursor")!;
    expect(
      validate("ui-cursor", { ...cursor.parameters, path: "0:1,1<x>" }),
    ).toBe(false);
  });
});

describe("the teaser cut", () => {
  it("is a valid mix on a 135 BPM grid that fits the renderer's limits", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut.bpm).toBe(135);
    expect(cut.fps).toBe(24);
    const frames = mixFrames(cut);
    expect(frames / cut.fps).toBeLessThanOrEqual(120);
    expect(frames / cut.fps).toBeLessThanOrEqual(
      mix.media[cut.track.asset].durationSeconds,
    );
    const project = mixProject(cut, "Genobi teaser", media(), TRUSTED_RECIPES);
    expect(project.layers.length).toBeLessThanOrEqual(LAYER_LIMIT);
    expect(project.composition.durationFrames).toBe(frames);
    expect(project.layers[0].name).toBe("Track · Trailer-Genobi");
  });

  it("cuts on the beat: shots on whole beats, the music's bars on beats 4n", () => {
    for (const shot of cut.shots)
      expect(Number.isInteger(shot.startBeat)).toBe(true);
    // The section changes land on bar lines of the track (cut beat 4 is its
    // first downbeat): every section title starts on one.
    for (const l of cut.layers.filter((l) => l.module === "kinetic"))
      expect(l.startBeat % 2, l.id).toBe(0);
    for (const l of cut.layers)
      expect(l.startBeat + l.beats, l.id).toBeLessThanOrEqual(cut.beats);
  });

  it("refuses a gap at the start with no card holding it", () => {
    const bare: MixSpec = {
      ...cut,
      layers: cut.layers.filter((l) => l.lane !== "cards"),
    };
    expect(() => checkMix(bare, media())).toThrow(/before the first shot/);
  });

  it("keeps every pointer and focus box inside the frame and its layer", () => {
    for (const l of cut.layers.filter((l) => l.module === "ui-cursor")) {
      const keys = parsePath(String(l.parameters.path));
      expect(keys.length, l.id).toBeGreaterThan(0);
      for (const k of keys) {
        expect(k.x).toBeGreaterThanOrEqual(0);
        expect(k.x).toBeLessThanOrEqual(1);
        expect(k.t).toBeLessThanOrEqual(seconds(l.beats) + 1e-6);
      }
      for (const c of parseClicks(String(l.parameters.clicks)))
        expect(c).toBeLessThanOrEqual(seconds(l.beats));
    }
    for (const l of cut.layers.filter((l) => l.module === "ui-focus")) {
      const p = l.parameters as Record<string, number>;
      expect(p.x + p.w, l.id).toBeLessThanOrEqual(1);
      expect(p.y + p.h, l.id).toBeLessThanOrEqual(1);
    }
  });

  it("builds the same project from the same cut", () => {
    const a = mixProject(cut, "Genobi teaser", media(), TRUSTED_RECIPES);
    const b = mixProject(cut, "Genobi teaser", media(), TRUSTED_RECIPES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const first = a.layers.find((l) => l.id === "shot-01")!;
    expect(first.startFrame).toBe(beatSpan(cut, 20, 8).startFrame);
  });

  it("is a mix template the Director and gallery can find", () => {
    expect(mixTemplates).toContain(genobiTeaser);
    expect(findMixTemplate("genobi-teaser")).toBe(genobiTeaser);
    expect(genobiTeaser.run).toBe("mix");
  });
});

describe("the teaser's camera moves and cards", () => {
  it("renders 1920 × 1080 and plays each moved slice as its own two layers", () => {
    expect([cut.width, cut.height]).toEqual([1920, 1080]);
    const project = mixProject(cut, "Genobi teaser", media(), TRUSTED_RECIPES);
    for (const [i, shot] of cut.shots.entries()) {
      if (!shot.move) continue;
      const id = `shot-${String(i + 1).padStart(2, "0")}`;
      const [push, hold] = [id, `${id}-hold`].map((x) =>
        project.layers.find((l) => l.id === x)!,
      );
      expect(push && hold, id).toBeTruthy();
      const span = beatSpan(cut, shot.startBeat, shot.beats);
      expect(push.startFrame).toBe(span.startFrame);
      expect(push.durationFrames + hold.durationFrames).toBe(
        span.durationFrames,
      );
    }
  });

  it("keeps every pointer and focus box on its slice's move", () => {
    for (const l of cut.layers.filter((l) =>
      ["ui-cursor", "ui-focus"].includes(l.module),
    )) {
      const shot = cut.shots.find(
        (s) =>
          s.startBeat <= l.startBeat && l.startBeat < s.startBeat + s.beats,
      )!;
      expect(l.parameters.view, l.id).toBe(
        viewParameter(cut, shot, l.startBeat),
      );
    }
  });

  it("holds the frame with cards wherever no slice plays", () => {
    const cards = cut.layers.filter((l) => l.card);
    expect(cards.map((l) => l.id).sort()).toEqual(
      [
        "end-card",
        "paper-dither",
        "reveal-1",
        "reveal-3",
        "space",
        "taste",
        "title",
      ].sort(),
    );
    const bare: MixSpec = {
      ...cut,
      layers: cut.layers.filter((l) => l.id !== "paper-dither"),
    };
    expect(() => checkMix(bare, media())).toThrow(/gap/);
  });

  it("puts the owner's callouts on their beats", () => {
    const at = (id: string) => {
      const l = cut.layers.find((x) => x.id === id)!;
      return { s: seconds(l.startBeat), held: seconds(l.beats) };
    };
    // 0:27 camera controls, 0:36 Three.js: the nearest beat at or just
    // before, readable for at least 1.3 s after its 0.8 s build. The ComfyUI
    // shot carries no text (the owner: the canvas speaks for itself).
    expect(cut.layers.some((l) => /comfy/i.test(l.id))).toBe(false);
    for (const [id, time] of [
      ["callout-camera", 27],
      ["callout-threejs", 36],
    ] as const) {
      const c = at(id);
      expect(c.s, id).toBeLessThanOrEqual(time + 0.25);
      expect(time - c.s, id).toBeLessThan(0.45);
      expect(c.held - 0.9, id).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe("the teaser's memory seed", () => {
  const seed = JSON.parse(
    readFileSync(new URL("docs/genobi-teaser-memory.json", root), "utf8"),
  ) as {
    decisions: { id: string; kind: string; topic: string; value: string }[];
    taste: { id: string; value: string; evidence: string[] }[];
  };
  it("fits genobi decision and taste: ids, kinds, lengths and evidence", () => {
    const ids = new Set(seed.decisions.map((d) => d.id));
    expect(ids.size).toBe(seed.decisions.length);
    for (const d of seed.decisions) {
      expect(d.id).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
      expect(["note", "preference"]).toContain(d.kind);
      expect(d.topic.length).toBeLessThanOrEqual(80);
      expect(d.value.length, d.id).toBeLessThanOrEqual(500);
    }
    for (const t of seed.taste) {
      expect(t.value.length).toBeLessThanOrEqual(500);
      for (const e of t.evidence) expect(ids.has(e), e).toBe(true);
    }
    // Never a claim about where an external clip came from, and only the
    // models the piece used are named.
    const words = JSON.stringify(seed);
    expect(words).not.toMatch(/made in the studio"/i);
  });
});

describe("the teaser recipes are pure in time", () => {
  it("moves the camera as a function of time alone, inside the frame", () => {
    const p = {
      fromX: 0.5,
      fromY: 0.5,
      fromZoom: 1,
      x: 0.95,
      y: 0.05,
      zoom: 2,
      ease: 1,
      drift: 0.02,
    };
    expect(windowAt(p, 0)).toEqual({ zoom: 1, x: 0.5, y: 0.5 });
    expect(windowAt(p, 0.7)).toEqual(windowAt(p, 0.7));
    const end = windowAt(p, 1);
    expect(end.zoom).toBe(2);
    // A 2× window is half the frame, so its centre stays a quarter in.
    expect(end.x).toBe(0.75);
    expect(end.y).toBe(0.25);
  });

  it("walks the pointer between its points and holds at the ends", () => {
    const keys = parsePath("0:0.1,0.1 / 1:0.5,0.5 / 2:0.9,0.2");
    expect(pointAt(keys, -1)).toMatchObject({ x: 0.1, y: 0.1 });
    const mid = pointAt(keys, 0.5)!;
    expect(mid.x).toBeCloseTo(0.3, 9);
    expect(mid.y).toBeCloseTo(0.3, 9);
    expect(pointAt(keys, 9)).toMatchObject({ x: 0.9, y: 0.2 });
    expect(parseClicks("0.5 / 1.25 / ")).toEqual([0.5, 1.25]);
  });
});

describe("the teaser's media and licences", () => {
  // Cloudflare Pages serves files up to 25 MiB (docs/cloudflare.md).
  it.each(Object.entries(mix.media))(
    "%s is bundled and Pages-sized",
    (_, m) => {
      const size = statSync(new URL(`public${m.url}`, root)).size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(25 * 1024 * 1024);
    },
  );

  it("keeps the vendored Transitions.dev files unchanged, with their notice", () => {
    const file = (p: string) => readFileSync(new URL(p, root));
    // Byte for byte the upstream files at commit e3aefb554d8f.
    expect(
      sha(file("public/motion/text-generation/text-image-generation.js")),
    ).toBe("b690ce039d40d5823f56d87f186fc0962ca3868ac6f7aebd173208a67622220b");
    expect(
      sha(file("public/motion/text-generation/text-image-generation.css")),
    ).toBe("ea7d447ea450934df5c14b054411b65c66ebe51b35cc933b1d46a3193990f222");
    for (const dir of ["text-generation", "transitions-dev"])
      expect(file(`public/motion/${dir}/LICENSE.txt`).toString()).toContain(
        "Transitions.dev License",
      );
    for (const name of [
      "matrix-loader.css",
      "shimmer-text.css",
      "success-check.css",
      "texts-reveal.css",
      "matrix-loader.js",
    ])
      expect(
        file(`public/motion/transitions-dev/${name}`).toString(),
      ).toContain("e3aefb554d8f");
  });

  it("records the track, footage and transitions in LICENCES.md", () => {
    const licences = readFileSync(new URL("LICENCES.md", root), "utf8");
    for (const needle of [
      "genobi-teaser/teaser-track.mp3",
      "genobi-teaser/ui-*.mp4",
      "public/motion/text-generation/",
      "public/motion/transitions-dev/",
      "e3aefb554d8fd2cb3e91e773e82a0f2d5a4f82a0",
      "genobi-teaser/ui-comfy.mp4",
      "@paper-design/shaders",
      "@alienkitty/space.js",
    ])
      expect(licences).toContain(needle);
  });
});
