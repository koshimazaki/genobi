import { afterEach, expect, it, vi } from "vitest";
import { play } from "../src/director/playback";
import type { DirectorRenderer } from "../src/director/renderer";
afterEach(() => vi.unstubAllGlobals());

function renderer() {
  const audio = { currentTime: 0 };
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    audio.currentTime += 0.1;
    queueMicrotask(callback);
  });
  return {
    audio,
    bundle: { project: { composition: { fps: 10, durationFrames: 4 } } },
    resume: vi.fn(async () => {}),
    render: vi.fn(async () => {}),
    scheduleAudio: vi.fn(),
    stopAudio: vi.fn(),
  };
}
it("loops the composition and audio clock until cancelled", async () => {
  const r = renderer(),
    frames: number[] = [];
  const playback = play(
    r as unknown as DirectorRenderer,
    0,
    (frame) => {
      frames.push(frame);
      if (frames.length >= 10) playback.cancel();
    },
    undefined,
    () => true,
  );
  await playback.done;
  expect(r.scheduleAudio.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(frames.filter((f) => f === 0).length).toBeGreaterThanOrEqual(3);
  expect(frames.every((f) => f >= 0 && f < 4)).toBe(true);
  expect(r.stopAudio).toHaveBeenCalled();
});
it("turning looping off completes the current pass", async () => {
  const r = renderer(),
    frames: number[] = [];
  let looping = true;
  const playback = play(
    r as unknown as DirectorRenderer,
    2,
    (frame) => {
      frames.push(frame);
      if (r.scheduleAudio.mock.calls.length > 1) looping = false;
    },
    undefined,
    () => looping,
  );
  await playback.done;
  expect(r.scheduleAudio.mock.calls.length).toBe(2);
  expect(frames.at(-1)).toBe(3);
});
