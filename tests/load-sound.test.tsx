// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChipContext } from "../src/deck/walkers/chip-audio";
import {
  DEFAULT_LOAD_SOUND,
  loadSoundChoice,
  setLoadSoundChoice,
} from "../src/load-sound/choice";
import {
  LOAD_SOUNDS,
  LOAD_SOUND_NAMES,
  cueSeconds,
} from "../src/load-sound/cues";
import { LOAD_SOUND_VOLUME, LoadSoundPlayer } from "../src/load-sound/player";
import {
  START_DELAY_MS,
  loadSoundActive,
  useLoadSound,
} from "../src/load-sound/useLoadSound";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders `useLoadSound` and lets a test flip `active`. */
function mountHook(player: LoadSoundPlayer) {
  let root: Root | undefined;
  const host = document.body.appendChild(document.createElement("div"));
  function Probe({ active }: { active: boolean }) {
    useLoadSound(active, player);
    return null;
  }
  const rerender = ({ active }: { active: boolean }) =>
    act(() => {
      root ??= createRoot(host);
      root.render(<Probe active={active} />);
    });
  rerender({ active: false });
  return { rerender, unmount: () => act(() => root?.unmount()) };
}

/** A fake AudioContext recording each scheduled source. */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const sources: { kind: string; type: string; start?: number }[] = [];
  const gains: ReturnType<typeof param>[] = [];
  const node = (kind: string) => {
    const n = {
      kind,
      type: "sine",
      frequency: param(),
      playbackRate: param(),
      buffer: null as unknown,
      loop: false,
      onended: null as null | (() => void),
      connect: vi.fn(),
      disconnect: vi.fn(),
      setPeriodicWave: vi.fn(),
      start(t: number) {
        sources.push({ kind, type: n.type, start: t });
      },
      stop: vi.fn(),
    };
    return n;
  };
  const ctx = {
    currentTime: 2,
    sampleRate: 8000,
    destination: {} as AudioNode,
    createGain() {
      const gain = param();
      gains.push(gain);
      return {
        gain,
        connect: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as GainNode;
    },
    createOscillator: () => node("osc") as unknown as OscillatorNode,
    createBufferSource: () => node("noise") as unknown as AudioBufferSourceNode,
    createBuffer: (_c: number, length: number) =>
      ({
        getChannelData: () => new Float32Array(length),
      }) as unknown as AudioBuffer,
    createPeriodicWave: () => ({}) as PeriodicWave,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return { ctx: ctx as unknown as ChipContext, sources, gains };
}

describe("loading cues", () => {
  it("every variant has a short start and done made only of sane blips", () => {
    expect(LOAD_SOUND_NAMES.length).toBeGreaterThanOrEqual(3);
    for (const name of LOAD_SOUND_NAMES)
      for (const part of ["start", "done"] as const) {
        const blips = LOAD_SOUNDS[name][part];
        expect(blips.length, `${name} ${part}`).toBeGreaterThan(0);
        expect(cueSeconds(blips)).toBeLessThanOrEqual(1);
        for (const b of blips) {
          expect(b.at).toBeGreaterThanOrEqual(0);
          expect(b.length).toBeGreaterThan(0);
          expect(b.level).toBeGreaterThan(0);
          expect(b.level).toBeLessThanOrEqual(1);
          expect(Number.isFinite(b.from) && b.from > 0).toBe(true);
        }
      }
  });

  it("the player schedules one source per blip, quietly, noise from a buffer", () => {
    const fake = fakeContext();
    const player = new LoadSoundPlayer(() => fake.ctx);
    expect(player.play(LOAD_SOUNDS.sonar.start)).toBe(true);
    expect(fake.sources.map((s) => s.kind)).toEqual(["osc", "noise"]);
    expect(fake.sources[0].type).toBe("triangle");
    // The master gain is the first gain made, at the quiet volume.
    expect(fake.gains[0].value).toBe(LOAD_SOUND_VOLUME);
    expect(fake.sources.every((s) => (s.start ?? 0) >= 2)).toBe(true);
  });

  it("is silent, not broken, without Web Audio", () => {
    expect(
      new LoadSoundPlayer(() => undefined).play(LOAD_SOUNDS.chip.done),
    ).toBe(false);
  });
});

describe("when a cue plays", () => {
  const media = { id: "template-media-x", line: "LOADING CLIP  40%" };
  it("sounds for media loads and real work with a percent, never for play", () => {
    expect(loadSoundActive([])).toBe(false);
    expect(loadSoundActive([media])).toBe(true);
    expect(loadSoundActive([{ id: "job", line: "RENDERING  12%" }])).toBe(true);
    expect(loadSoundActive([{ id: "job", line: "THINKING" }])).toBe(false);
    expect(
      loadSoundActive([
        { id: "walkers", line: "WALKERS  3%", background: true },
      ]),
    ).toBe(false);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  const mounted: { unmount: () => void }[] = [];
  afterEach(() => {
    for (const m of mounted.splice(0)) m.unmount();
    vi.useRealTimers();
  });

  const setup = () => {
    const played: string[] = [];
    const player = {
      play: (blips: readonly unknown[]) => {
        for (const [name, cue] of Object.entries(LOAD_SOUNDS))
          if (cue.start === blips) played.push(`${name}:start`);
          else if (cue.done === blips) played.push(`${name}:done`);
        return true;
      },
    } as unknown as LoadSoundPlayer;
    const hook = mountHook(player);
    mounted.push(hook);
    return { played, hook };
  };

  it("a quick load stays silent", () => {
    const { played, hook } = setup();
    hook.rerender({ active: true });
    act(() => vi.advanceTimersByTime(START_DELAY_MS - 50));
    hook.rerender({ active: false });
    act(() => vi.advanceTimersByTime(2000));
    expect(played).toEqual([]);
  });

  it("a load that lasts plays the chosen start, then done when it ends", () => {
    const { played, hook } = setup();
    hook.rerender({ active: true });
    act(() => vi.advanceTimersByTime(START_DELAY_MS));
    expect(played).toEqual([`${DEFAULT_LOAD_SOUND}:start`]);
    hook.rerender({ active: false });
    expect(played).toEqual([
      `${DEFAULT_LOAD_SOUND}:start`,
      `${DEFAULT_LOAD_SOUND}:done`,
    ]);
  });

  it("follows the remembered choice, and Off silences it", () => {
    setLoadSoundChoice("glass");
    expect(loadSoundChoice()).toBe("glass");
    const first = setup();
    first.hook.rerender({ active: true });
    act(() => vi.advanceTimersByTime(START_DELAY_MS));
    expect(first.played).toEqual(["glass:start"]);
    setLoadSoundChoice("off");
    const second = setup();
    second.hook.rerender({ active: true });
    act(() => vi.advanceTimersByTime(START_DELAY_MS));
    second.hook.rerender({ active: false });
    expect(second.played).toEqual([]);
  });

  it("an unknown stored value falls back to the default", () => {
    localStorage.setItem("genobi.loadSound", "kazoo");
    expect(loadSoundChoice()).toBe(DEFAULT_LOAD_SOUND);
  });
});
