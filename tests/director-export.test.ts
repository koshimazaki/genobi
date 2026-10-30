import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectorRenderer } from "../src/director/renderer";
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  videoSupport: vi.fn(),
  audioSupport: vi.fn(),
  audio: vi.fn(),
}));
vi.mock("mediabunny", () => ({
  Quality: class {},
  Mp4OutputFormat: class {},
  BufferTarget: class {
    buffer = new ArrayBuffer(8);
  },
  CanvasSource: class {
    add = mocks.add;
    close = mocks.close;
  },
  EncodedAudioPacketSource: class {},
  Output: class {
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    finalize = mocks.finalize;
    cancel = mocks.cancel;
  },
  canEncodeVideo: mocks.videoSupport,
  canEncodeAudio: mocks.audioSupport,
}));
vi.mock("../src/director/export-audio", () => ({
  aacConfig: {},
  writeAudio: mocks.audio,
}));
import { exportMp4 } from "../src/director/export";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.videoSupport.mockResolvedValue(true);
  mocks.audioSupport.mockResolvedValue(true);
});
function renderer() {
  return {
    bundle: {
      project: {
        composition: { width: 640, height: 360, fps: 30, durationFrames: 4 },
      },
    },
    output: { frame: -1 },
    mix: vi.fn().mockResolvedValue({}),
    render: vi.fn(),
  };
}
it("encodes every completed frame in order even when rendering exceeds a frame interval", async () => {
  const r = renderer();
  r.render.mockImplementation(async (f: number) => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    r.output.frame = f;
  });
  const captured: number[] = [];
  mocks.add.mockImplementation(async () => {
    captured.push(r.output.frame);
  });
  const progress = vi.fn();
  const blob = await exportMp4(
    r as unknown as DirectorRenderer,
    progress,
    new AbortController().signal,
  );
  expect(captured).toEqual([0, 1, 2, 3]);
  expect(mocks.add.mock.calls).toEqual(
    [0, 1, 2, 3].map((f) => [f / 30, 1 / 30]),
  );
  expect(progress.mock.calls).toEqual([[0], [1], [2], [3]]);
  expect(mocks.finalize).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(blob.type).toBe("video/mp4");
});
it("cancels without encoding further frames or returning a partial file", async () => {
  const r = renderer(),
    controller = new AbortController();
  await expect(
    exportMp4(
      r as unknown as DirectorRenderer,
      () => controller.abort(),
      controller.signal,
    ),
  ).rejects.toThrow("cancelled");
  expect(r.render.mock.calls).toEqual([[0]]);
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.finalize).not.toHaveBeenCalled();
});
it("releases encoders after a failed composition frame", async () => {
  const r = renderer();
  r.render.mockRejectedValue(new Error("Decode failed"));
  await expect(
    exportMp4(
      r as unknown as DirectorRenderer,
      vi.fn(),
      new AbortController().signal,
    ),
  ).rejects.toThrow("Decode failed");
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.add).not.toHaveBeenCalled();
});
it("rejects missing AAC support before mixing or rendering", async () => {
  mocks.audioSupport.mockResolvedValue(false);
  const r = renderer();
  await expect(
    exportMp4(
      r as unknown as DirectorRenderer,
      vi.fn(),
      new AbortController().signal,
    ),
  ).rejects.toThrow("WebCodecs");
  expect(r.mix).not.toHaveBeenCalled();
  expect(r.render).not.toHaveBeenCalled();
});

it("uses composition dimensions for encoder support and scales a bounded bitrate", async () => {
  const r = renderer();
  r.bundle.project.composition.width = 1920;
  r.bundle.project.composition.height = 1080;
  await exportMp4(
    r as unknown as DirectorRenderer,
    vi.fn(),
    new AbortController().signal,
  );
  expect(mocks.videoSupport).toHaveBeenCalledWith(
    "avc",
    expect.objectContaining({
      width: 1920,
      height: 1080,
      frameRate: 30,
    }),
  );
});

describe("the export bitrate", () => {
  it("scales the 540p rate by pixel count, bounded 2 to 32 Mb/s", async () => {
    const { exportBitrate } = await import("../src/director/export");
    expect(exportBitrate(960, 540, "")).toBe(8_000_000);
    expect(exportBitrate(1280, 720, "")).toBeGreaterThan(8_000_000);
    expect(exportBitrate(1920, 1080, "")).toBe(32_000_000);
    expect(exportBitrate(3840, 2160, "")).toBe(32_000_000);
    expect(exportBitrate(16, 16, "")).toBe(2_000_000);
  });

  it("lets the page ask for a master's 2 to 40 Mb/s over the scaled default", async () => {
    const { exportBitrate } = await import("../src/director/export");
    expect(exportBitrate(960, 540, "?exportMbps=28")).toBe(28_000_000);
    expect(exportBitrate(1920, 1080, "?exportMbps=40")).toBe(40_000_000);
    expect(exportBitrate(1920, 1080, "?exportMbps=2.4")).toBe(2_400_000);
    expect(exportBitrate(960, 540, "?exportMbps=90")).toBe(8_000_000);
    expect(exportBitrate(1920, 1080, "?exportMbps=1")).toBe(32_000_000);
    expect(exportBitrate(960, 540, "?exportMbps=x")).toBe(8_000_000);
  });
});
