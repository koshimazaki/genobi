// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  ChipAudio,
  LOOKAHEAD,
  MASTER_VOLUME,
  lfsrNoise,
  pulseTerms,
  type ChipContext,
} from "../src/deck/walkers/chip-audio";
import {
  LOOP_STEPS,
  SFX,
  STEP_SECONDS,
  hertz,
  midi,
  songStep,
} from "../src/deck/walkers/chip-tune";
import { KONAMI, countsTowardCode, pushKey } from "../src/deck/walkers/konami";

/** A fake AudioContext that records what the engine schedules. */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const sources: {
    kind: string;
    type?: string;
    starts: number[];
    stops: number[];
    frequency: ReturnType<typeof param>;
    stopped: boolean;
    disconnected: boolean;
    onended?: () => void;
  }[] = [];
  const source = (kind: string) => {
    const node = {
      kind,
      type: "sine",
      starts: [] as number[],
      stops: [] as number[],
      frequency: param(),
      playbackRate: param(),
      stopped: false,
      disconnected: false,
      buffer: null as unknown,
      onended: undefined as undefined | (() => void),
      connect: vi.fn(),
      disconnect() {
        node.disconnected = true;
      },
      setPeriodicWave: vi.fn(),
      start(t: number) {
        node.starts.push(t);
      },
      stop(t?: number) {
        if (t === undefined) node.stopped = true;
        else node.stops.push(t);
      },
    };
    sources.push(node);
    return node;
  };
  const gains: { gain: ReturnType<typeof param> }[] = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain() {
      const g = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    },
    createOscillator: () => source("osc"),
    createBufferSource: () => source("noise"),
    createBuffer: (_c: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createPeriodicWave: vi.fn(() => ({})),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  return { ctx, sources, gains, as: ctx as unknown as ChipContext };
}
const timers = () => {
  const live = new Set<number>();
  let id = 0;
  return {
    live,
    setInterval: () => {
      live.add(++id);
      return id;
    },
    clearInterval: (i: unknown) => live.delete(i as number),
  };
};

describe("the walkers tune", () => {
  it("is an original eight-bar loop of four channels", () => {
    expect(LOOP_STEPS).toBe(64);
    expect(
      songStep(0)
        .map((n) => n.channel)
        .sort(),
    ).toEqual(["bass", "harmony", "lead", "noise"]);
    expect(songStep(LOOP_STEPS)).toBe(songStep(0));
    expect(midi("A4")).toBe(69);
    expect(midi("C4")).toBe(60);
    expect(hertz(69)).toBeCloseTo(440);
    // Held notes ("-") lengthen the note instead of starting another.
    expect(songStep(0).find((n) => n.channel === "lead")?.steps).toBe(2);
    expect(songStep(1).some((n) => n.channel === "lead")).toBe(false);
  });

  it("has every effect the game plays", () => {
    for (const name of [
      "spawn",
      "assign",
      "dig",
      "build",
      "splat",
      "saved",
      "won",
      "failed",
    ] as const)
      expect(SFX[name].length, name).toBeGreaterThan(0);
  });

  it("builds pulse waves by duty and a two-level noise", () => {
    const narrow = pulseTerms(0.125),
      square = pulseTerms(0.5);
    expect(square.real[2]).toBeCloseTo(0); // a square has no even harmonics
    expect(narrow.real[2]).not.toBeCloseTo(0);
    const noise = lfsrNoise(64);
    expect(new Set(noise)).toEqual(new Set([0.8, -0.8].map(Math.fround)));
  });
});

describe("the chip audio engine", () => {
  it("creates nothing until started, then plays quietly", () => {
    const fake = fakeContext();
    const make = vi.fn(() => fake.as);
    const audio = new ChipAudio(make, timers());
    audio.sfx("spawn");
    expect(make).not.toHaveBeenCalled();
    expect(audio.start()).toBe(true);
    expect(fake.gains[0].gain.value).toBe(MASTER_VOLUME);
    expect(MASTER_VOLUME).toBeLessThanOrEqual(0.1);
  });

  it("schedules the loop just ahead of the clock, step by step", () => {
    const fake = fakeContext();
    const clock = timers();
    const audio = new ChipAudio(() => fake.as, clock);
    audio.music();
    expect(clock.live.size).toBe(1);
    const scheduled = () =>
      fake.sources.flatMap((s) => s.starts).sort((a, b) => a - b);
    // Everything starts within the lookahead window, on the step grid.
    for (const t of scheduled()) {
      expect(t).toBeLessThan(LOOKAHEAD + STEP_SECONDS);
      expect(((t - 0.05) / STEP_SECONDS) % 1).toBeCloseTo(0);
    }
    const first = scheduled().length;
    audio.schedule(); // no time has passed: nothing new
    expect(scheduled().length).toBe(first);
    // The timer wakes every 25 ms; walk the clock forward a second.
    for (let t = 0.025; t <= 1; t += 0.025) {
      fake.ctx.currentTime = t;
      audio.schedule();
    }
    const later = scheduled();
    expect(later.length).toBeGreaterThan(first);
    expect(later.at(-1)!).toBeLessThan(1 + LOOKAHEAD);
    // After a long stall it skips ahead rather than bursting old notes.
    fake.ctx.currentTime = 30;
    const before = fake.sources.length;
    audio.schedule();
    const burst = fake.sources.slice(before).flatMap((s) => s.starts);
    expect(Math.min(...burst)).toBeGreaterThanOrEqual(30 - LOOKAHEAD);
  });

  it("plays effects on pulse and noise voices at their pitch", () => {
    const fake = fakeContext();
    const audio = new ChipAudio(() => fake.as, timers());
    audio.start();
    audio.sfx("saved");
    const arp = fake.sources.filter((s) => s.kind === "osc");
    expect(arp).toHaveLength(SFX.saved[0].notes.length);
    const pitches = arp.map((s) => s.frequency.setValueAtTime.mock.calls[0][0]);
    expect(pitches).toEqual([...pitches].sort((a, b) => a - b)); // rising
    audio.sfx("dig");
    expect(fake.sources.some((s) => s.kind === "noise")).toBe(true);
  });

  it("stops every node, the timer and the context", () => {
    const fake = fakeContext();
    const clock = timers();
    const audio = new ChipAudio(() => fake.as, clock);
    audio.music();
    audio.sfx("won");
    expect(audio.sounding).toBeGreaterThan(0);
    audio.stop();
    expect(clock.live.size).toBe(0);
    expect(audio.sounding).toBe(0);
    expect(fake.sources.every((s) => s.stopped && s.disconnected)).toBe(true);
    expect(fake.ctx.close).toHaveBeenCalledTimes(1);
    expect(audio.started).toBe(false);
    audio.stop();
    expect(fake.ctx.close).toHaveBeenCalledTimes(1);
  });

  it("forgets nodes once they end", () => {
    const fake = fakeContext();
    const audio = new ChipAudio(() => fake.as, timers());
    audio.start();
    audio.sfx("assign");
    expect(audio.sounding).toBe(1);
    fake.sources[0].onended?.();
    expect(audio.sounding).toBe(0);
  });

  it("does nothing without Web Audio", () => {
    const audio = new ChipAudio(() => undefined, timers());
    expect(audio.start()).toBe(false);
    audio.music();
    audio.sfx("won");
    audio.stop();
    expect(audio.sounding).toBe(0);
  });
});

describe("the Konami code", () => {
  const type = (keys: string[]) => {
    let recent: string[] = [];
    let matched = false;
    for (const k of keys) {
      const r = pushKey(recent, k);
      recent = r.recent;
      matched ||= r.matched;
    }
    return matched;
  };
  it("matches ↑↑↓↓←→←→BA, after any lead-in and in either case", () => {
    expect(type([...KONAMI])).toBe(true);
    expect(type(["ArrowUp", ...KONAMI.slice(0, 8), "B", "A"])).toBe(true);
    expect(type(KONAMI.slice(0, 9))).toBe(false);
    expect(type([...KONAMI.slice(0, 8), "a", "b"])).toBe(false);
  });
  it("ignores text fields, contenteditable, dialogs and modified keys", () => {
    const at = (target: unknown, mods = {}) =>
      countsTowardCode({
        target: target as EventTarget,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...mods,
      });
    expect(at(null)).toBe(true);
    expect(at(null, { metaKey: true })).toBe(false);
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(at(input)).toBe(false);
    expect(at(editable)).toBe(false);
    expect(at(document.createElement("button"))).toBe(true);
    const dialog = document.createElement("dialog");
    const inside = document.createElement("button");
    dialog.append(inside);
    expect(at(inside)).toBe(false);
  });
});
