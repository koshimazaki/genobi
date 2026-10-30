import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { presetRecipe } from "../src/world-builder/recipe";
import {
  rewindUnlessPlaying,
  runPreview,
  stopPreviewThen,
} from "../src/world-builder/scene-playback";
import { CaptureControls } from "../src/world-builder/CaptureControls";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { BuilderAssets } from "../src/world-builder/useBuilderAssets";

/** A manual animation clock, so a tick queued before Stop can be fired late. */
function clock() {
  let time = 0,
    next = 1;
  const queued = new Map<number, () => void>();
  return {
    now: () => time,
    request: (tick: () => void) => (queued.set(next, tick), next++),
    cancel: (id: number) => void queued.delete(id),
    async advance(ms: number) {
      time += ms;
      const ticks = [...queued.values()];
      queued.clear();
      for (const tick of ticks) tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

/** The session's preview queue: one frame drawn at a time, in order. */
function scene() {
  const drawn: number[] = [];
  let queue: Promise<unknown> = Promise.resolve(),
    holding = false,
    release = () => {};
  return {
    drawn,
    queue: () => queue,
    /** The next frame stays in flight until `land` is called. */
    holdNext: () => void (holding = true),
    land: () => release(),
    draw(frame: number) {
      const gate = holding
        ? new Promise<void>((resolve) => (release = resolve))
        : null;
      holding = false;
      queue = queue.then(async () => {
        if (gate) await gate;
        drawn.push(frame);
      });
      return queue as Promise<void>;
    },
  };
}

describe("Capture take during Play", () => {
  it("stops the preview, lets its frame land, then captures from frame zero", async () => {
    const time = clock(),
      set = scene(),
      frames = 48;
    let playing = true,
      audioPaused = false,
      restarts = 0;
    const end = runPreview({
      frames: () => frames,
      loop: () => false,
      active: () => playing,
      held: () => false,
      draw: (frame) => set.draw(frame),
      restartAudio: () => restarts++,
      finish: () => (playing = false),
      fail: (e) => {
        throw e;
      },
      ...time,
    });
    for (let i = 0; i < 10; i++) await time.advance(1000 / 24);
    expect(set.drawn.at(-1)).toBeGreaterThan(5);
    // A frame is mid-draw when Capture is pressed.
    set.holdNext();
    await time.advance(1000 / 24);
    const inFlight = set.drawn.length;

    const captured: number[] = [];
    const take = stopPreviewThen(
      {
        playing: () => playing,
        stop: () => {
          playing = false;
          audioPaused = true;
        },
        settle: set.queue,
      },
      async () => {
        expect(playing).toBe(false);
        // The preview's last frame landed before the capture drew anything.
        expect(set.drawn.length).toBe(inFlight + 1);
        for (let n = 0; n < frames; n++) captured.push(n);
        return captured;
      },
    );
    expect(audioPaused).toBe(true);
    // A tick queued before React's cleanup fires late and must draw nothing.
    await time.advance(1000 / 24);
    set.land();
    expect(await take).toEqual(Array.from({ length: frames }, (_, n) => n));
    await time.advance(1000 / 24);
    expect(set.drawn.length).toBe(inFlight + 1);
    expect(restarts).toBe(1);
    end();
  });

  it("runs the action at once when nothing is playing", async () => {
    const stop = vi.fn();
    const result = await stopPreviewThen(
      {
        playing: () => false,
        stop,
        settle: () => new Promise(() => {}),
      },
      async () => "captured",
    );
    expect(result).toBe("captured");
    expect(stop).not.toHaveBeenCalled();
  });

  it("skips frames while a live edit reloads the set, then keeps playing", async () => {
    const time = clock(),
      drawn: number[] = [];
    let reloading = false;
    const fail = vi.fn();
    const end = runPreview({
      frames: () => 240,
      loop: () => false,
      active: () => true,
      held: () => reloading,
      draw: (frame) => void drawn.push(frame),
      restartAudio: () => {},
      finish: () => {},
      fail,
      ...time,
    });
    await time.advance(1000 / 24);
    reloading = true;
    const before = drawn.length;
    await time.advance(1000 / 24);
    await time.advance(1000 / 24);
    expect(drawn.length).toBe(before);
    reloading = false;
    await time.advance(1000 / 24);
    expect(drawn.length).toBe(before + 1);
    expect(fail).not.toHaveBeenCalled();
    end();
  });
});

describe("A live edit during Play", () => {
  it("keeps the preview's frame; an edit while stopped shows frame zero", async () => {
    const shown: number[] = [],
      drawn: number[] = [];
    const show = (n: number) => void shown.push(n),
      draw = (n: number) => void drawn.push(n);
    await rewindUnlessPlaying(true, show, draw);
    expect([shown, drawn]).toEqual([[], []]);
    await rewindUnlessPlaying(false, show, draw);
    expect([shown, drawn]).toEqual([[0], [0]]);
  });
});

describe("Capture panel while Play runs", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps Capture take and Save PNG enabled", () => {
    const page: { parent?: unknown } = {};
    page.parent = page;
    vi.stubGlobal("window", page);
    const s = {
      ready: true,
      busy: false,
      playing: true,
      capturing: false,
      recipe: presetRecipe("Playground"),
      take: null,
      error: "",
      progress: 0,
    } as unknown as BuilderSession;
    const a = { saving: "", result: "" } as unknown as BuilderAssets;
    const html = renderToStaticMarkup(<CaptureControls s={s} a={a} shot />);
    for (const label of ["Capture take", "Save PNG"])
      expect(html).toMatch(
        new RegExp(`<button(?![^>]*disabled)[^>]*>${label}</button>`),
      );
  });
});
