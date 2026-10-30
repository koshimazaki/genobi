import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScroll } from "../shared/scrolls/commands";
import { DEFAULT_GENERATOR } from "../shared/scrolls/generator";
import type { Job } from "../shared/types";
import { addFile, type ScrollBundle } from "../src/scrolls/bundle";
import type { ScrollsBridge } from "../src/scrolls/bridge";
import { approvedRun } from "../src/scrolls/approval";

const quotes: Record<string, unknown>[] = [];
vi.mock("../src/useJobs", () => ({
  request: vi.fn(async (_path: string, init: RequestInit) => {
    quotes.push(JSON.parse(String(init.body)));
    return {
      quote: {
        id: `quote-${quotes.length}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        estimateUsd: 0.009,
      },
    };
  }),
}));
vi.mock("../src/settings-store", () => ({ expectedHeaders: () => ({}) }));
vi.mock("../src/image-files", () => ({
  readReference: async () => "data:image/png;base64,AAAA",
}));
const { collectScroll, quoteTarget, submitRuns } =
  await import("../src/scrolls/generate");

const png = readFileSync("public/scrolls/creature.png");
const bridge = (generate = vi.fn()) =>
  ({ key: "", jobs: [], generate, update: vi.fn() }) as ScrollsBridge;

async function storyboard(): Promise<ScrollBundle> {
  const d = createScroll("storyboard", 3, "runs");
  d.prompt = "Two ninjas cross the rooftops.";
  let bundle: ScrollBundle = { document: d, files: new Map() };
  bundle = await addFile(
    bundle,
    new File([png], "Sky\x07 Gate.png", { type: "image/png" }),
    "style",
    undefined,
    "An ink storyboard of a sky gate.",
  );
  return bundle;
}

beforeEach(() => {
  quotes.length = 0;
});

describe("each Scrolls run is quoted on its own", () => {
  it("quotes a board once, with the reference and its recorded prompt", async () => {
    const bundle = await storyboard();
    const ref = bundle.document.assets[0];
    const quoted = await quoteTarget(
      bridge(),
      bundle,
      { ...DEFAULT_GENERATOR, entry: "flux-3-klein-api" },
      [ref.id],
      { kind: "sheet", plan: true },
    );
    expect(quoted).toHaveLength(1);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      generator: "image",
      model: "flux-3-klein-api",
      imageReferences: ["data:image/png;base64,AAAA"],
    });
    expect(String(quotes[0].description)).toMatch(
      /its prompt: "An ink storyboard of a sky gate\."/,
    );
    expect(quoted[0].generation).toEqual({
      entry: "flux-3-klein-api",
      references: [{ name: "Sky Gate.png", sha256: ref.file.sha256 }],
    });
  });

  it("quotes Fill panels once per empty panel, each with its own key", async () => {
    const bundle = await storyboard();
    const [first, , third] = bundle.document.cells;
    bundle.document.cells[1] = {
      ...bundle.document.cells[1],
      assetId: bundle.document.assets[0].id,
    };
    const quoted = await quoteTarget(bridge(), bundle, DEFAULT_GENERATOR, [], {
      kind: "fill",
    });
    expect(quoted.map((a) => a.cellId)).toEqual([first.id, third.id]);
    expect(quotes).toHaveLength(2);
    expect(new Set(quoted.map((a) => a.idempotency)).size).toBe(2);
    expect(quoted.every((a) => a.fill)).toBe(true);
  });
});

describe("approved runs are submitted once, and never retried", () => {
  it("stops at the first failure and says how many started", async () => {
    const bundle = await storyboard();
    const quoted = await quoteTarget(bridge(), bundle, DEFAULT_GENERATOR, [], {
      kind: "fill",
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ id: "job-1" })
      .mockRejectedValueOnce(new Error("Network lost."));
    const started: unknown[] = [],
      uncertain: unknown[] = [];
    const runs = quoted.map((a) => approvedRun(a, bundle.document.revision));
    await expect(
      submitRuns(
        bridge(generate),
        bundle.document.id,
        quoted,
        runs,
        (r) => started.push(r),
        (u) => uncertain.push(u),
      ),
    ).rejects.toThrow(
      /1 of 3 runs had started\. Panel 2 \(Approach\) may have started: Fill panels skips it.*No automatic retry/,
    );
    // The uncertain run keeps its panel and key for the Camera history check.
    expect(uncertain).toEqual([
      {
        documentId: bundle.document.id,
        cellId: quoted[1].cellId,
        idempotency: quoted[1].idempotency,
        label: "Panel 2 (Approach)",
      },
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][1]).toEqual({
      quoteId: quoted[0].quote.id,
      idempotency: quoted[0].idempotency,
    });
    expect(started).toHaveLength(1);
  });
});

describe("an unconfirmed panel is not quoted again", () => {
  it("skips the panel in the next Fill until it is cleared", async () => {
    const bundle = await storyboard();
    const [first, second, third] = bundle.document.cells;
    const skipped = await quoteTarget(
      bridge(),
      bundle,
      DEFAULT_GENERATOR,
      [],
      { kind: "fill" },
      [second.id],
    );
    expect(skipped.map((a) => a.cellId)).toEqual([first.id, third.id]);
    await expect(
      quoteTarget(bridge(), bundle, DEFAULT_GENERATOR, [], { kind: "fill" }, [
        first.id,
        second.id,
        third.id,
      ]),
    ).rejects.toThrow(/unconfirmed run/);
  });
});

describe("a paid result can always be recorded", () => {
  const job = { status: "Ready", resultUrl: "/result.png" } as Job;

  it("records the person's own prompt, so long example pairs still land", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png)),
    );
    let bundle = await storyboard();
    bundle.document.prompt = "A long brief. ".repeat(200).trim();
    for (const n of [1, 2, 3])
      bundle = await addFile(
        bundle,
        new File([png], `Example ${n}.png`, { type: "image/png" }),
        "style",
        undefined,
        `Example prompt ${n}. `.repeat(200).slice(0, 4000),
      );
    const refs = bundle.document.assets.slice(1).map((a) => a.id);
    const [approval] = await quoteTarget(
      bridge(),
      bundle,
      { ...DEFAULT_GENERATOR, entry: "flux-3-klein-api" },
      refs,
      { kind: "sheet", plan: true },
    );
    // The model gets the pairs; the result records only the person's words.
    expect(approval.input.description.length).toBeGreaterThan(4000);
    expect(approval.prompt.length).toBeLessThanOrEqual(4000);
    expect(approval.prompt).not.toMatch(/Reference 1/);
    const landed = await collectScroll(bundle, job, {
      jobId: "job-long",
      documentId: bundle.document.id,
      prompt: approval.prompt,
      generation: approval.generation,
    });
    const asset = landed.bundle.document.assets.at(-1)!;
    expect(asset.prompt).toBe(approval.prompt);
    expect(asset.generation?.references).toHaveLength(3);
  });

  it("refuses a Fill batch before any quote when its results would pass 64 KB", async () => {
    const d = createScroll("storyboard", 16, "big");
    d.prompt = "A long brief. ".repeat(250).trim();
    const bundle: ScrollBundle = { document: d, files: new Map() };
    await expect(
      quoteTarget(bridge(), bundle, DEFAULT_GENERATOR, [], { kind: "fill" }),
    ).rejects.toThrow(/larger than 64 KB/);
    expect(quotes).toHaveLength(0);
  });
});

describe("a finished run lands back in Scrolls", () => {
  const job = { status: "Ready", resultUrl: "/result.png" } as Job;
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(png, { headers: { "Content-Type": "image/png" } }),
      ),
    );
  });

  it("becomes the board's sheet, named for its model, with its prompt and references", async () => {
    const before = await storyboard();
    const generation = {
      entry: "flux-3-klein-api",
      references: [{ name: "Sky Gate.png", sha256: "c".repeat(64) }],
    };
    const { bundle, assetId, placed } = await collectScroll(before, job, {
      jobId: "job-1",
      documentId: before.document.id,
      prompt: "The prompt that was sent.",
      generation,
    });
    const asset = bundle.document.assets.find((a) => a.id === assetId)!;
    expect(asset).toMatchObject({
      name: "FLUX 3 Image Klein · API · storyboard.png",
      origin: "generated",
      prompt: "The prompt that was sent.",
      generation,
    });
    expect(bundle.document.sheetAssetId).toBe(assetId);
    expect(placed).toBe(true);
  });

  it("goes into its panel on Fill panels, only while that panel is empty", async () => {
    const before = await storyboard();
    const cell = before.document.cells[0];
    const pending = {
      jobId: "job-2",
      documentId: before.document.id,
      cellId: cell.id,
      prompt: "Panel one.",
      generation: { entry: "flux-3-klein", references: [] },
      fill: true,
    };
    const { bundle, assetId, placed } = await collectScroll(
      before,
      job,
      pending,
    );
    expect(placed).toBe(true);
    expect(bundle.document.cells[0].assetId).toBe(assetId);
    expect(bundle.document.sheetAssetId).toBe(before.document.sheetAssetId);
    const again = await collectScroll(bundle, job, {
      ...pending,
      jobId: "job-3",
    });
    expect(again.bundle.document.cells[0].assetId).toBe(assetId);
    expect(again.placed).toBe(false);
  });

  it("refuses a result for a scroll that was replaced", async () => {
    const before = await storyboard();
    await expect(
      collectScroll(before, job, {
        jobId: "job-4",
        documentId: "another",
        prompt: "x",
        generation: { entry: "flux-3-klein", references: [] },
      }),
    ).rejects.toThrow(/Camera history/);
  });
});
