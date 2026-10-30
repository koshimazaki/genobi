import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newArena, type ArenaDraft } from "../shared/arena";
import { draftSettings } from "../shared/arena-run";
import type { Quote } from "../shared/quote";
import { ArenaStore } from "../server/arena-store";
import {
  confirmText,
  generateAllLoads,
  planRuns,
} from "../src/arena/quote-runs";

const hash = (n: number) => String(n).repeat(64);
const draft: ArenaDraft = {
  ...newArena(),
  prompt: "A lighthouse at dusk.",
  slots: newArena().slots.map((s, i) => ({
    ...s,
    run: { entry: "flux-3-video" },
    ...(i === 0 ? { media: hash(1) } : {}),
  })),
};

describe("loads that already have a result", () => {
  it("are left out of Generate all", () => {
    expect(generateAllLoads(draft, {}).map((s) => s.id)).toEqual([
      "canny",
      "depth",
    ]);
    const done = {
      ...draft,
      slots: draft.slots.map((s) => ({ ...s, media: hash(1) })),
    };
    expect(generateAllLoads(done, {})).toEqual([]);
  });

  it("are named in the confirmation when run again", () => {
    const plans = planRuns(draft, ["rgb", "canny"], {});
    const quotes = plans.map(
      (_, i) => ({ id: String(i), estimateUsd: 0.5 }) as Quote,
    );
    const text = confirmText(plans, quotes);
    expect(text).toContain("RGB: $0.50 (replaces its result)");
    expect(text).toMatch(/Canny: \$0\.50\n/);
  });
});

describe("a very short source", () => {
  it("still asks for at least one second", () => {
    expect(draftSettings({ sourceSeconds: 0.3 }).duration).toBe(1);
    expect(draftSettings({ sourceSeconds: 7.6 }).duration).toBe(8);
    expect(draftSettings({}).duration).toBe(5);
  });
});

describe("a run's result replacing an earlier one", () => {
  const measured = {
    kind: "video" as const,
    contentType: "video/mp4" as const,
    label: "x",
    width: 16,
    height: 16,
    duration: 1,
  };
  it("removes the old result unless another approach shows it", async () => {
    const store = new ArenaStore(
      await mkdtemp(path.join(os.tmpdir(), "arena-replace-")),
    );
    await store.load();
    const owner = crypto.randomUUID();
    const { id } = await store.create(owner, newArena());
    const attach = (bytes: string, slot: string) =>
      store.attach(id, owner, {
        bytes: Buffer.from(bytes),
        measured,
        slot: { id: slot },
      });
    const first = await attach("first", "rgb");
    const old = first.media.hash;
    const second = await attach("second", "rgb");
    expect(second.arena.media.map((m) => m.hash)).toEqual([second.media.hash]);
    expect(await readdir(path.join(store.directory, id))).toEqual([
      second.media.hash,
    ]);
    expect(old).not.toBe(second.media.hash);

    // The same clip on two approaches stays while one still shows it.
    await attach("second", "canny");
    const third = await attach("third", "rgb");
    expect(third.arena.media.map((m) => m.hash).sort()).toEqual(
      [second.media.hash, third.media.hash].sort(),
    );
  });
});
