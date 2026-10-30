import { describe, expect, it } from "vitest";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  FALLBACK_HEAT,
  PEAK_FALL,
  bandLevel,
  easeLevels,
  envelopeLevels,
  heat,
  holdPeak,
  liveLevels,
  parseColor,
  rmsLevel,
  silence,
} from "../src/world-builder/signal-meter";
import {
  RECENT_AUDIO,
  RECENT_AUDIO_BYTES,
  type RecentAudio,
} from "../src/world-builder/audio-history";
import {
  createRecentAudio,
  indexedDbAudioBackend,
  memoryAudioBackend,
  type AudioBackend,
  type StoredAudio,
} from "../src/world-builder/audio-recent-store";

describe("Meter maths", () => {
  it("holds a peak, then lets it fall at the same rate at any frame rate", () => {
    expect(holdPeak(0.2, 0.9, 1 / 60)).toBe(0.9);
    const once = holdPeak(0.9, 0, 0.5);
    expect(once).toBeCloseTo(0.9 - PEAK_FALL * 0.5);
    let twice = 0.9;
    for (let i = 0; i < 30; i++) twice = holdPeak(twice, 0, 1 / 60);
    expect(twice).toBeCloseTo(once);
    // Never below the live value, and clamped to the meter.
    expect(holdPeak(0.9, 0.85, 10)).toBe(0.85);
    expect(holdPeak(0, 3, 0)).toBe(1);
    expect(holdPeak(0.5, -1, 100)).toBe(0);
  });

  it("reads bands from FFT bins and level from the waveform", () => {
    const freq = new Uint8Array(1024);
    // 48 kHz: each bin is 23.4 Hz wide, so bins 0-7 cover the low band.
    freq.fill(255, 0, 8);
    const quiet = new Uint8Array(2048).fill(128);
    const levels = liveLevels(freq, quiet, 48000);
    expect(levels.low).toBeGreaterThan(0.5);
    expect(levels.mid).toBeLessThan(0.1);
    expect(levels.high).toBe(0);
    expect(levels.level).toBe(0);
    expect(bandLevel(new Uint8Array(1024).fill(255), 48000, [160, 2000])).toBe(
      1,
    );
    expect(bandLevel([], 48000, [20, 160])).toBe(0);
    const square = Uint8Array.from({ length: 64 }, (_, i) =>
      i % 2 ? 192 : 64,
    );
    expect(rmsLevel(square)).toBeCloseTo(0.85);
  });

  it("shows the recipe's envelopes at a frame when not playing", () => {
    const recipe = validateRecipe({
      ...presetRecipe("Playground"),
      envelope: [0.1, 0.7],
      bandEnvelopes: { low: [0.2, 0.3], mid: [0.4], high: [] },
    });
    expect(envelopeLevels(recipe, 1)).toEqual({
      low: 0.3,
      mid: 0,
      high: 0,
      level: 0.7,
    });
    expect(envelopeLevels(recipe, 99)).toEqual(silence());
  });

  it("eases toward a target in place", () => {
    const from = silence();
    easeLevels(from, { low: 1, mid: 0.5, high: 0, level: 1 }, 0.5);
    expect(from).toEqual({ low: 0.5, mid: 0.25, high: 0, level: 0.5 });
  });

  it("parses theme colours and grades the heat between them", () => {
    expect(parseColor("#abc")).toEqual([170, 187, 204]);
    expect(parseColor(" #a8be5c ")).toEqual([168, 190, 92]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseColor("rgba(1 2 3 / 0.5)")).toEqual([1, 2, 3]);
    expect(parseColor("var(--x)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(heat(0, FALLBACK_HEAT)).toEqual(FALLBACK_HEAT.cold);
    expect(heat(1, FALLBACK_HEAT)).toEqual(FALLBACK_HEAT.peak);
    expect(heat(0.2, FALLBACK_HEAT)).toEqual(FALLBACK_HEAT.low);
    expect(heat(5, FALLBACK_HEAT)).toEqual(FALLBACK_HEAT.peak);
  });
});

const id = (n: number) => n.toString(16).padStart(64, "0");
const track = (
  n: number,
  bytes = 10,
  source: RecentAudio["source"] = "file",
): RecentAudio => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return { id: id(n), label: `Track ${n}`, source, bytes, open: () => blob };
};

describe("Recent audio store", () => {
  it("keeps tracks across a reload, newest first", async () => {
    const map = new Map<string, StoredAudio>();
    const first = createRecentAudio(memoryAudioBackend(map));
    await first.load();
    await first.add(track(1), 100);
    await first.add(track(2), 200);
    await first.add(track(1), 300);
    const reopened = createRecentAudio(memoryAudioBackend(map));
    const list = await reopened.load();
    expect(list.map((t) => t.label)).toEqual(["Track 1", "Track 2"]);
    expect(list[0].open().size).toBe(10);
    expect(reopened.persisted()).toBe(true);
  });

  it("bounds the count and bytes, deleting what it drops", async () => {
    const map = new Map<string, StoredAudio>();
    const store = createRecentAudio(memoryAudioBackend(map));
    for (let n = 1; n <= RECENT_AUDIO + 2; n++) await store.add(track(n), n);
    expect(store.list()).toHaveLength(RECENT_AUDIO);
    expect(map.size).toBe(RECENT_AUDIO);
    expect(map.has(id(1))).toBe(false);
    await store.add(track(99, RECENT_AUDIO_BYTES - 5), 1000);
    expect(store.list().map((t) => t.id)).toEqual([id(99)]);
    expect([...map.keys()]).toEqual([id(99)]);
  });

  it("restores within the bounds and drops unreadable rows", async () => {
    const map = new Map<string, StoredAudio>();
    const row = (n: number, usedAt: number): StoredAudio => ({
      id: id(n),
      label: `Track\x00 ${n}`,
      source: "drop",
      bytes: 1,
      usedAt,
      blob: new Blob(["x"]),
    });
    for (let n = 1; n <= RECENT_AUDIO + 1; n++) map.set(id(n), row(n, n));
    map.set("bad", { id: "bad" } as StoredAudio);
    map.set(id(50), { ...row(50, 99), source: "project" as never });
    const list = await createRecentAudio(memoryAudioBackend(map)).load();
    expect(list.map((t) => t.label)[0]).toBe(`Track ${RECENT_AUDIO + 1}`);
    expect(list).toHaveLength(RECENT_AUDIO);
    expect(map.has(id(1))).toBe(false);
  });

  it("lists project audio without storing it, and forgets on request", async () => {
    const map = new Map<string, StoredAudio>();
    const store = createRecentAudio(memoryAudioBackend(map));
    await store.add(track(1, 4, "project"));
    await store.add(track(2));
    expect(store.list()).toHaveLength(2);
    expect([...map.keys()]).toEqual([id(2)]);
    await store.forget(id(2));
    expect(store.list().map((t) => t.id)).toEqual([id(1)]);
    expect(map.size).toBe(0);
  });

  it("still works for the tab without storage", async () => {
    const broken: AudioBackend = {
      all: () => Promise.reject(new Error("blocked")),
      put: () => Promise.reject(new Error("blocked")),
      delete: () => Promise.reject(new Error("blocked")),
    };
    const store = createRecentAudio(broken);
    expect(await store.load()).toEqual([]);
    await store.add(track(1));
    expect(store.list()).toHaveLength(1);
    expect(store.persisted()).toBe(false);
    // No IndexedDB at all (Node here) rejects rather than throwing.
    const none = createRecentAudio(indexedDbAudioBackend());
    expect(await none.load()).toEqual([]);
    await none.add(track(2));
    expect(none.list()).toHaveLength(1);
    expect(none.persisted()).toBe(false);
  });

  it("keeps a track added while the store was still loading", async () => {
    let release: (rows: StoredAudio[]) => void = () => {};
    const slow: AudioBackend = {
      all: () => new Promise((done) => (release = done)),
      put: async () => {},
      delete: async () => {},
    };
    const store = createRecentAudio(slow);
    const loading = store.load();
    const adding = store.add(track(7));
    await new Promise((done) => setTimeout(done, 0));
    release([
      {
        id: id(7),
        label: "Old name",
        source: "file",
        bytes: 1,
        usedAt: 1,
        blob: new Blob(["x"]),
      },
    ]);
    await loading;
    const list = await adding;
    expect(list.map((t) => t.label)).toEqual(["Track 7"]);
  });

  it("stays within the bounds in storage under concurrent adds", async () => {
    const map = new Map<string, StoredAudio>();
    const base = memoryAudioBackend(map);
    // A slow store, so each add's eviction and write could interleave.
    const tick = () => new Promise((done) => setTimeout(done, 1));
    const slow: AudioBackend = {
      all: base.all,
      put: async (row) => {
        await tick();
        await base.put(row);
      },
      delete: async (key) => {
        await tick();
        await base.delete(key);
      },
    };
    const store = createRecentAudio(slow);
    const lists = await Promise.all(
      Array.from({ length: 12 }, (_, n) => store.add(track(n + 1), n + 1)),
    );
    expect(lists.at(-1)).toHaveLength(RECENT_AUDIO);
    expect(map.size).toBeLessThanOrEqual(RECENT_AUDIO);
    expect([...map.keys()].sort()).toEqual(
      store
        .list()
        .map((t) => t.id)
        .sort(),
    );
    // And by bytes: big tracks arriving together keep under the cap.
    const big = Math.floor(RECENT_AUDIO_BYTES / 3);
    await Promise.all([21, 22, 23, 24].map((n) => store.add(track(n, big), n)));
    const bytes = [...map.values()].reduce((sum, row) => sum + row.bytes, 0);
    expect(bytes).toBeLessThanOrEqual(RECENT_AUDIO_BYTES);
    expect(map.size).toBe(store.list().length);
  });
});
