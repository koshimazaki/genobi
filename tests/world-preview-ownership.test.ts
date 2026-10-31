import { expect, it, vi } from "vitest";
import { runPreview } from "../src/world-builder/scene-playback";

it("a stopped final-frame draw cannot finish a newer playback session", async () => {
  let release!: () => void;
  const drawn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finish = vi.fn();
  const stop = runPreview({
    frames: () => 9,
    loop: () => false,
    elapsed: () => 2,
    active: () => true,
    held: () => false,
    draw: () => drawn,
    restartAudio: vi.fn(),
    finish,
    fail: vi.fn(),
    request: () => 1,
    cancel: vi.fn(),
  });
  stop();
  release();
  await drawn;
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
});
