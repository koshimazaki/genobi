import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScroll } from "../shared/scrolls/commands";
import { DEFAULT_GENERATOR } from "../shared/scrolls/generator";
import { planRuns, runProblem } from "../shared/scrolls/run-plan";
import { panelFrames } from "../shared/scrolls/panel-frames";
import { addFile, type ScrollBundle } from "../src/scrolls/bundle";
import type { ScrollsBridge } from "../src/scrolls/bridge";
import { ninjaRooms } from "../src/scrolls/ninja-storyboard";
import { validateRecipe } from "../src/world-builder/recipe";

const quotes: Record<string, unknown>[] = [];
vi.mock("../src/useJobs", () => ({
  request: vi.fn(async (_path: string, init: RequestInit) => {
    quotes.push(JSON.parse(String(init.body)));
    return {
      quote: {
        id: `quote-${quotes.length}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        estimateUsd: 0.04,
      },
    };
  }),
}));
vi.mock("../src/settings-store", () => ({ expectedHeaders: () => ({}) }));
vi.mock("../src/image-files", () => ({
  readReference: async (file: File) => `data:${file.name}`,
}));
const { quoteTarget } = await import("../src/scrolls/generate");

const bridge = () =>
  ({ key: "", jobs: [], generate: vi.fn(), update: vi.fn() }) as ScrollsBridge;
const frame = (n: string) =>
  readFileSync(`public/scrolls/ninja/${n}.png`) as Uint8Array<ArrayBuffer>;

/** A three-panel board whose first two panels carry their 3D frames. */
async function board(): Promise<ScrollBundle> {
  const d = createScroll("storyboard", 3, "frames");
  d.prompt = "A ninja crosses four rooms.";
  d.cells = d.cells.map((c, i) => ({ ...c, title: `Shot ${i + 1}` }));
  let bundle: ScrollBundle = { document: d, files: new Map() };
  for (const [i, n] of ["p01", "p06"].entries())
    bundle = await addFile(
      bundle,
      new File([frame(n)], `${n}.png`, { type: "image/png" }),
      "style",
      d.cells[i].id,
    );
  return bundle;
}

beforeEach(() => {
  quotes.length = 0;
});

describe("a panel's own 3D frame is its reference", () => {
  it("plans each panel's frame and never repeats a board reference", async () => {
    const { document: d } = await board();
    const runs = planRuns(d, { kind: "fill" });
    expect(runs.map((r) => r.frames)).toEqual([
      [d.assets[0].id],
      [d.assets[1].id],
      [],
    ]);
    expect(panelFrames(d, d.cells[0].id, [d.assets[0].file.sha256])).toEqual(
      [],
    );
    expect(planRuns(d, { kind: "sheet", plan: true })[0].frames).toEqual([]);
  });

  it("refuses Klein's open graph and lets FLUX 3 Edit draw from frames alone", async () => {
    const { document: d } = await board();
    expect(runProblem(d, DEFAULT_GENERATOR, [], { kind: "fill" })).toMatch(
      /Panel 1 \(Shot 1\) has its own 3D frame\. Klein's open graph takes text only/,
    );
    const edit = { ...DEFAULT_GENERATOR, entry: "flux-3-edit" };
    expect(runProblem(d, edit, [], { kind: "fill" })).toMatch(
      /FLUX 3 Edit redraws a reference/,
    );
    d.cells[2].assetId = d.assets[0].id;
    expect(runProblem(d, edit, [], { kind: "fill" })).toBeUndefined();
    expect(runProblem(d, edit, [], { kind: "sheet", plan: true })).toMatch(
      /FLUX 3 Edit redraws a reference/,
    );
  });

  it("quotes each panel with its frame first and records it", async () => {
    const bundle = await board();
    const quoted = await quoteTarget(
      bridge(),
      bundle,
      { ...DEFAULT_GENERATOR, entry: "flux-3-klein-api" },
      [],
      { kind: "fill" },
    );
    expect(quotes.map((q) => q.imageReferences)).toEqual([
      ["data:p01.png"],
      ["data:p06.png"],
      [],
    ]);
    expect(String(quotes[0].description)).toMatch(
      /^Reference 1 is this panel's 3D blocking frame from World Builder\.\nKeep its camera angle/,
    );
    expect(String(quotes[2].description)).not.toMatch(/3D blocking/);
    expect(quoted[1].generation.references).toEqual([
      { name: "p06.png", sha256: bundle.document.assets[1].file.sha256 },
    ]);
    // The person's own prompt, recorded on the result, stays the panel text.
    expect(quoted[0].prompt).not.toMatch(/3D blocking/);
  });
});

describe("the Four Rooms board", () => {
  const plan = ninjaRooms.plan!;
  it("has eight panels, each with its text, frame and a valid recipe", () => {
    expect(plan.shots).toHaveLength(8);
    expect(plan.panels).toHaveLength(8);
    expect(existsSync(`public/scrolls/${ninjaRooms.file}`)).toBe(true);
    for (const [i, p] of plan.panels!.entries()) {
      expect(p.prompt).toMatch(
        new RegExp(`^P0${i + 1} / .*Camera path: .*Escalation: L\\d`),
      );
      expect(existsSync(`public/scrolls/${p.frame}`)).toBe(true);
      const raw = readFileSync(p.recipe, "utf8");
      expect(raw.length).toBeLessThanOrEqual(64_000);
      const r = validateRecipe(JSON.parse(raw));
      expect(r).toMatchObject({ frames: 17, fps: 24, avatar: true });
      expect(r.width / r.height).toBeCloseTo(16 / 9, 2);
      expect(r.objects.length).toBeLessThanOrEqual(24);
      expect(r.cameraShot).not.toBe("custom");
    }
  });
});
