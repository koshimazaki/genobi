import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { arenaDraft, newArena, type Arena } from "../shared/arena";
import {
  arenaRunEntries,
  arenaRunInput,
  runName,
  slotPrompt,
} from "../shared/arena-run";
import { estimateRunUsd, type Quote } from "../shared/quote";
import { ArenaCard } from "../src/arena/ArenaCard";
import {
  chooseModel,
  modelChoices,
  modelValue,
  RECORD_ONLY,
} from "../src/arena/model-choice";
import {
  confirmText,
  planRuns,
  quoteRuns,
  slotEstimate,
} from "../src/arena/quote-runs";

const arena = (draft = newArena()): Arena => ({
  ...draft,
  id: "00000000-0000-4000-8000-000000000001",
  revision: 1,
  updatedAt: "2026-10-27T00:00:00Z",
  media: [],
});

describe("a load's Model menu", () => {
  it("offers every runnable model whatever the load already holds", () => {
    const all = modelChoices().map((c) => c.value);
    expect(all).toEqual([...arenaRunEntries().map((e) => e.id), RECORD_ONLY]);
  });

  it("takes effect at once, without clearing the typed name first", () => {
    const key = crypto.randomUUID();
    const slot = {
      model: "LTX-2.5 Fast · Text to video",
      run: { entry: "ltx-2-5-fast", key },
    };
    // A different model replaces the run and its name; the old key goes.
    expect(chooseModel(slot, "flux-3-video")).toEqual({
      run: { entry: "flux-3-video" },
      model: runName(arenaRunEntries().find((e) => e.id === "flux-3-video")!),
    });
    // The same model again restores its name and keeps the key for replay.
    expect(chooseModel({ ...slot, model: "my note" }, "ltx-2-5-fast")).toEqual({
      model: "LTX-2.5 Fast · Text to video",
    });
    expect(chooseModel(slot, RECORD_ONLY)).toEqual({ run: undefined });
    expect(() => chooseModel(slot, "minimax-h3")).toThrow("Arena can run");
    expect(modelValue(slot)).toBe("ltx-2-5-fast");
    expect(modelValue({})).toBe(RECORD_ONLY);
  });

  it("renders a menu, not a datalist the typed value filters", () => {
    const draft = newArena();
    const slot = {
      ...draft.slots[0],
      model: "LTX 2.5",
      run: { entry: "ltx-2-5-pro" },
    };
    const html = renderToStaticMarkup(
      <ArenaCard
        arena={arena(draft)}
        slot={slot}
        index={0}
        preferred={false}
        busy={false}
        audio={false}
        onAudio={vi.fn()}
        onChange={vi.fn()}
        onUpload={vi.fn()}
        onPrefer={vi.fn()}
        bind={vi.fn()}
        onLoaded={vi.fn()}
        onError={vi.fn()}
        onDropMedia={vi.fn()}
        canRun
        onRun={vi.fn()}
      />,
    );
    expect(html).not.toContain("list=");
    expect(html).not.toContain("<datalist");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("LTX-2.5 Pro · Text to video");
    expect(html).toContain("Generate with the main prompt");
  });
});

describe("prompt override", () => {
  it("generates with a load's own prompt and falls back to the main one", () => {
    const main = { prompt: "A lighthouse at dusk." };
    expect(slotPrompt({ prompt: "Storm at noon." }, main)).toBe(
      "Storm at noon.",
    );
    expect(slotPrompt({ prompt: "" }, main)).toBe(main.prompt);
    expect(slotPrompt({ prompt: "   \n" }, main)).toBe(main.prompt);
  });
});

describe("quoting each load", () => {
  const draft = arenaDraft.parse({
    ...newArena(),
    prompt: "A lighthouse at dusk.",
    settings: { duration: 7, aspectRatio: "4:3", resolution: "qhd" },
    slots: newArena().slots.map((s, i) => ({
      ...s,
      prompt: i === 1 ? "Storm at noon." : i === 2 ? "  " : "",
      run: {
        entry: ["ltx-2-5-pro", "flux-3-video", "flux-3-image"][i],
      },
    })),
  });

  it("builds one request per load on its own model, prompt and fitted settings", () => {
    const plans = planRuns(
      draft,
      draft.slots.map((s) => s.id),
      {},
    );
    expect(plans.map((p) => p.input.model)).toEqual([
      "ltx-2.5-pro",
      "flux-3",
      "flux-3",
    ]);
    expect(plans.map((p) => p.input.generator)).toEqual([
      "video",
      "video",
      "image",
    ]);
    expect(plans.map((p) => p.input.description)).toEqual([
      "A lighthouse at dusk.",
      "Storm at noon.",
      "A lighthouse at dusk.",
    ]);
    // LTX Pro takes 16:9 or 9:16 at HD or Full HD, in whole Router seconds.
    expect(plans[0].input).toMatchObject({
      duration: 6,
      aspectRatio: "16:9",
      resolution: "hd",
    });
    // FLUX 3 video takes the chosen settings as they are.
    expect(plans[1].input).toMatchObject({
      duration: 7,
      aspectRatio: "4:3",
      resolution: "qhd",
    });
    // The same request the Camera would send for that model and settings.
    expect(plans[1].input).toEqual(
      arenaRunInput("flux-3-video", "Storm at noon.", draft.settings),
    );
  });

  it("asks for one quote per load and confirms each price and the total", async () => {
    const plans = planRuns(
      draft,
      draft.slots.map((s) => s.id),
      {},
    );
    const quote = vi.fn(
      async (input): Promise<Quote> =>
        ({
          id: crypto.randomUUID(),
          estimateUsd: estimateRunUsd(input),
          expiresAt: "2026-10-27T00:10:00Z",
        }) as Quote,
    );
    const quotes = await quoteRuns(plans, quote);
    expect(quote).toHaveBeenCalledTimes(3);
    expect(quote.mock.calls.map(([input]) => input)).toEqual(
      plans.map((p) => p.input),
    );
    // The row's estimate is the number the quote states.
    draft.slots.forEach((slot, i) =>
      expect(slotEstimate(draft, slot)).toBe(quotes[i].estimateUsd),
    );
    const text = confirmText(plans, quotes);
    for (const plan of plans) expect(text).toContain(plan.slot.label);
    const total = quotes.reduce((n, q) => n + q.estimateUsd, 0);
    expect(text).toContain(`$${total.toFixed(2)}`);
  });

  it("skips loads without a model or still waiting on a run", () => {
    const waiting = {
      ...draft,
      slots: draft.slots.map((s, i) =>
        i === 0
          ? { ...s, run: undefined }
          : i === 1
            ? { ...s, run: { ...s.run!, jobId: crypto.randomUUID() } }
            : s,
      ),
    };
    expect(
      planRuns(
        waiting,
        waiting.slots.map((s) => s.id),
        {},
      ).map((p) => p.slot.id),
    ).toEqual([waiting.slots[2].id]);
    expect(slotEstimate(waiting, waiting.slots[0])).toBeNull();
  });
});

describe("saved generator settings", () => {
  it("are stored with the comparison, refused when invalid and cleared", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { ArenaStore } = await import("../server/arena-store");
    const store = new ArenaStore(
      await mkdtemp(path.join(os.tmpdir(), "arena-settings-")),
    );
    await store.load();
    const owner = crypto.randomUUID();
    const created = await store.create(owner, newArena());
    const settings = { duration: 8, aspectRatio: "9:16", resolution: "fhd" };
    const saved = await store.update(created.id, owner, 0, {
      ...newArena(),
      settings,
    });
    expect(saved.settings).toEqual(settings);
    expect(() =>
      store.update(created.id, owner, 1, {
        ...newArena(),
        settings: { aspectRatio: "5:1" },
      }),
    ).toThrow("Invalid comparison");
    const cleared = await store.update(created.id, owner, 1, newArena());
    expect(cleared.settings).toBeUndefined();
  });
});
