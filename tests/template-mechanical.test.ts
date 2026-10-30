// The gallery's two Generate paths (27 October 2026): a template declares
// its run kind; a mechanical one (Sheet to shot) sends the Camera's own
// request with the person's files swapped in, one quote and one submission
// per Generate, the key recorded before the request leaves.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h3RouterBody } from "../shared/comfy/h3-router";
import { estimateRunUsd, type Quote } from "../shared/quote";
import {
  animeTeaser,
  houseTemplates,
  sheetToShot,
} from "../shared/templates/catalogue";
import { startingPicks } from "../shared/templates/intake";
import {
  mechanicalDefaults,
  mechanicalInput,
} from "../shared/templates/mechanical";
import { checkTemplate, planTemplate } from "../shared/templates/plan";
import { runKind } from "../shared/templates/run-kind";
import type { HouseTemplate } from "../shared/templates/types";
import type { Job } from "../shared/types";
import { validateInput } from "../server/validation";
import { platePng } from "../src/director/plate";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";

const dataUrl = (bytes: Uint8Array, type = "image/png") =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const sheet = dataUrl(platePng(256, 256, "#101820", "#f0e8d8"));
const board = dataUrl(platePng(256, 256, "#202020", "#e8f0f8"));

describe("run kind", () => {
  it("is declared, never inferred: agent unless a template says mechanical", () => {
    expect(houseTemplates.map((t) => [t.id, t.run, runKind(t)])).toEqual([
      ["product-video", undefined, "agent"],
      ["character-piece", undefined, "agent"],
      ["audio-visual", undefined, "agent"],
      ["anime-teaser", "agent", "agent"],
      ["sheet-to-shot", "mechanical", "mechanical"],
      ["falling-room", "agent", "agent"],
    ]);
    for (const t of houseTemplates)
      expect(() => checkTemplate(t)).not.toThrow();
  });

  it("refuses a run kind it does not know", () => {
    const odd = { ...sheetToShot, run: "magic" } as unknown as HouseTemplate;
    expect(() => checkTemplate(odd)).toThrow(
      "run must be mechanical, agent or mix",
    );
  });

  it("refuses a mechanical template that is not one generation its recipe describes", () => {
    const [character, storyboard] = sheetToShot.references;
    const mech = (patch: Partial<HouseTemplate>) => () =>
      checkTemplate({ ...sheetToShot, ...patch });
    expect(
      mech({
        shots: [...sheetToShot.shots, { ...sheetToShot.shots[0], id: "two" }],
      }),
    ).toThrow("it has 2 shots");
    expect(
      mech({
        references: [{ ...character, madeWith: "flux-3-klein" }, storyboard],
      }),
    ).toThrow("made by a step before the run");
    expect(
      mech({ references: [{ ...character, example: undefined }, storyboard] }),
    ).toThrow("no example to open with");
    expect(
      mech({ references: [{ ...character, min: 0 }, storyboard] }),
    ).toThrow("exactly one file");
    expect(
      mech({ shots: [{ ...sheetToShot.shots[0], references: ["character"] }] }),
    ).toThrow("does not carry Storyboard");
    // An agent template may be anything the planner takes.
    expect(() => checkTemplate({ ...animeTeaser, run: "mechanical" })).toThrow(
      "anime-teaser cannot run mechanically",
    );
    expect(() => mechanicalDefaults(animeTeaser)).toThrow(
      "runs through an agent session",
    );
  });

  it("starts Sheet to shot at the Scrolls sheet and storyboard, with nothing to generate", () => {
    expect(startingPicks(sheetToShot)).toEqual({
      character: "example",
      storyboard: "example",
    });
    expect(sheetToShot.references.map((r) => r.example)).toEqual([
      "/scrolls/character.png",
      "/scrolls/storyboard.png",
    ]);
    expect(sheetToShot.examples).toEqual([]);
  });
});

describe("Sheet to shot's request", () => {
  const recipe = { ...mechanicalDefaults(sheetToShot), duration: 8 };

  it("is one H3 Router run at 768P in the anime teaser's prompt pattern", () => {
    const [shot] = planTemplate(sheetToShot).shots;
    expect(shot.input).toMatchObject({
      model: "minimax-h3-router",
      resolution: "hd",
      aspectRatio: "16:9",
      cameraEnabled: true,
    });
    expect(recipe.prompt).toBe(shot.prompt);
    expect(recipe.prompt).toMatch(
      /^Use the first image as the character sheet and the second as the storyboard\. The same character throughout; follow the storyboard panel 1; one smooth continuous shot with no cuts or transitions; /,
    );
  });

  it("is the request the Camera sends for the same choices", () => {
    const prompt = "The guardian lands; the camera cranes up.";
    const mine = mechanicalInput(
      sheetToShot,
      { prompt, aspect: "9:16", duration: 8 },
      [sheet, board],
    );
    // The Camera with H3 picked, the same prompt, length, ratio and its two
    // reference slots filled, through its own reducer and request builder.
    const camera = composerInput(
      composerReducer(initialComposer, {
        type: "update",
        patch: {
          generator: "video",
          model: "minimax-h3-router",
          description: prompt,
          duration: 8,
          aspectRatio: "9:16",
          resolution: "hd",
          cameraEnabled: true,
          camera: mine.camera,
          cameraEdits: {},
          imageReferences: [sheet, board],
        },
      }),
    );
    const a = validateInput(mine);
    const b = validateInput(camera);
    for (const key of [
      "generator",
      "model",
      "description",
      "duration",
      "aspectRatio",
      "resolution",
      "cameraEnabled",
      "imageReferences",
      "draft",
      "acoustic",
    ] as const)
      expect(a[key], key).toEqual(b[key]);
    expect(h3RouterBody(a, prompt)).toEqual(h3RouterBody(b, prompt));
    expect(estimateRunUsd(a)).toBe(estimateRunUsd(b));
    // The sheet first, the storyboard second.
    expect(a.imageReferences).toEqual([sheet, board]);
  });

  it("refuses what the Camera's entry or the server would refuse", () => {
    const refs = [sheet, board];
    expect(() =>
      mechanicalInput(sheetToShot, { ...recipe, duration: 16 }, refs),
    ).toThrow("cannot make that length");
    expect(() =>
      mechanicalInput(sheetToShot, { ...recipe, aspect: "1:1" }, refs),
    ).toThrow("takes 16:9 or 9:16");
    expect(() =>
      mechanicalInput(sheetToShot, { ...recipe, prompt: " \u0007 " }, refs),
    ).toThrow("1 to 1200 characters");
    expect(() => mechanicalInput(sheetToShot, recipe, [sheet])).toThrow(
      "takes 2 images, in order",
    );
    expect(() =>
      mechanicalInput(sheetToShot, recipe, [
        sheet,
        "https://example.test/a.png",
      ]),
    ).toThrow("takes 2 images, in order");
    // Control characters become spaces, as every template input.
    expect(
      mechanicalInput(sheetToShot, { ...recipe, prompt: "a\u0000b\nc" }, refs)
        .description,
    ).toBe("a b c");
  });
});

const QUOTE: Quote = {
  id: "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  estimateUsd: 1.03,
  recipe: {} as Quote["recipe"],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
const JOB = { id: "job-12345678-abcd", status: "submitting" } as Job;

/** Reads a File as the Camera's tray would, minus the decode. */
const readImage = async (file: File) =>
  dataUrl(new Uint8Array(await file.arrayBuffer()), file.type);
const fetchExample = async (url: string) =>
  new Blob([readFileSync(new URL(`../public${url}`, import.meta.url))], {
    type: "image/png",
  });

afterEach(() => vi.unstubAllGlobals());

describe("Generate on a mechanical template", () => {
  const dropped = platePng(256, 256, "#000000", "#ffffff");
  const chosen = {
    picks: { character: "example", storyboard: "yours" } as const,
    dropped: {
      storyboard: [
        { bytes: dropped, ext: "png" as const, origin: "uploaded" as const },
      ],
    },
  };

  it("quotes once, with the person's storyboard swapped in after the example sheet", async () => {
    const { quoteMechanical } =
      await import("../src/template-gallery/mechanical-run");
    const quote = vi.fn(async () => QUOTE);
    const approval = await quoteMechanical(
      sheetToShot,
      { ...chosen, picks: { ...chosen.picks } },
      mechanicalDefaults(sheetToShot),
      { key: "", quote, readImage, fetchExample },
    );
    expect(quote).toHaveBeenCalledOnce();
    const [input] = quote.mock.calls[0] as unknown as [Job];
    expect(input.imageReferences).toHaveLength(2);
    expect(input.imageReferences![0]).toBe(
      dataUrl(
        readFileSync(
          new URL("../public/scrolls/character.png", import.meta.url),
        ),
      ),
    );
    expect(input.imageReferences![1]).toBe(dataUrl(dropped));
    expect(approval).toMatchObject({
      templateId: "sheet-to-shot",
      quote: QUOTE,
      input,
    });
    expect(approval.idempotency).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks the Camera's quote route, with the page key in a header only", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ quote: QUOTE }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);
    const { quoteMechanical } =
      await import("../src/template-gallery/mechanical-run");
    const approval = await quoteMechanical(
      sheetToShot,
      { ...chosen, picks: { ...chosen.picks } },
      mechanicalDefaults(sheetToShot),
      { key: "byo-key-1234", readImage, fetchExample },
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/quotes");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-byo-key": "byo-key-1234" });
    expect(JSON.parse(String(init.body))).toEqual(approval.input);
    expect(String(init.body)).not.toContain("byo-key-1234");
  });

  it("records the key, then submits exactly the quoted run once", async () => {
    const { quoteMechanical, submitMechanical } =
      await import("../src/template-gallery/mechanical-run");
    const approval = await quoteMechanical(
      sheetToShot,
      { ...chosen, picks: { ...chosen.picks } },
      mechanicalDefaults(sheetToShot),
      { key: "", quote: async () => QUOTE, readImage, fetchExample },
    );
    const events: string[] = [];
    const record = vi.fn((run: { state: string; idempotency: string }) =>
      events.push(`record ${run.state} ${run.idempotency}`),
    );
    const generate = vi.fn(
      async (_input: unknown, a: { idempotency: string }) => {
        events.push(`submit ${a.idempotency}`);
        return JOB;
      },
    );
    expect(await submitMechanical(approval, { record, generate })).toBe(JOB);
    const key = approval.idempotency;
    expect(events).toEqual([
      `record submitting ${key}`,
      `submit ${key}`,
      `record started ${key}`,
    ]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(approval.input, {
      quoteId: QUOTE.id,
      idempotency: key,
    });
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ jobId: JOB.id, quoteId: QUOTE.id }),
    );
  });

  it("reports an uncertain submission against its key and never retries", async () => {
    const { submitMechanical, UNCERTAIN } =
      await import("../src/template-gallery/mechanical-run");
    const approval = {
      templateId: "sheet-to-shot",
      quote: QUOTE,
      input: mechanicalInput(sheetToShot, mechanicalDefaults(sheetToShot), [
        sheet,
        board,
      ]),
      idempotency: "11111111-2222-4333-8444-555555555555",
    };
    const record = vi.fn();
    const generate = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      submitMechanical(approval, { record, generate }),
    ).rejects.toThrow(`Failed to fetch ${UNCERTAIN}`);
    expect(generate).toHaveBeenCalledOnce();
    expect(record.mock.calls.map(([r]) => [r.state, r.idempotency])).toEqual([
      ["submitting", approval.idempotency],
      ["uncertain", approval.idempotency],
    ]);
    // An expired quote submits nothing and records nothing.
    const stale = {
      ...approval,
      quote: { ...QUOTE, expiresAt: new Date(0).toISOString() },
    };
    record.mockClear();
    await expect(submitMechanical(stale, { record, generate })).rejects.toThrow(
      "The quote expired",
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
  });

  it("adds a finished clip to project assets, opening the template's project when none is open", async () => {
    const { addResultToAssets } =
      await import("../src/template-gallery/mechanical-run");
    let bundle: object | undefined;
    const store = { getState: () => ({ director: { bundle } }) };
    const open = vi.fn(async () => {
      bundle = {};
    });
    const add = vi.fn(async () => ({
      assetId: "a",
      added: true,
      use: "production" as const,
      filename: "sheet-to-shot-job-1234.mp4",
    }));
    const ready = {
      ...JOB,
      status: "Ready",
      resultUrl: "/api/media/job.mp4",
    } as Job;
    const deps = { open, add, store } as unknown as Parameters<
      typeof addResultToAssets
    >[3];
    await addResultToAssets(
      sheetToShot,
      { ...chosen, picks: { ...chosen.picks } },
      ready,
      deps,
    );
    expect(open).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      "/api/media/job.mp4",
      "sheet-to-shot-job-1234.mp4",
      "production",
    );
    await addResultToAssets(
      sheetToShot,
      { ...chosen, picks: { ...chosen.picks } },
      ready,
      deps,
    );
    expect(open).toHaveBeenCalledOnce();
    await expect(
      addResultToAssets(
        sheetToShot,
        { ...chosen, picks: { ...chosen.picks } },
        JOB,
        deps,
      ),
    ).rejects.toThrow("not available");
  });
});
