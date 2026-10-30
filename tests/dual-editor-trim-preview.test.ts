import { describe, expect, it, vi } from "vitest";
import { trimPreview, retainsTrim } from "../src/dual-editor/trim-preview";
import { LatestFrame } from "../src/dual-editor/latest-frame";
import type { EditClip } from "../src/dual-editor/timeline-model";
const source = {
  frames: [
    { timestamp: 2, duration: 0.1 },
    { timestamp: 2.1, duration: 0.2 },
    { timestamp: 2.3, duration: 0.1 },
    { timestamp: 2.4, duration: 0.3 },
  ],
};
const clip: EditClip = {
  id: "clip",
  source: "video",
  lane: "B",
  start: 1,
  in: 1,
  out: 4,
  muted: false,
};
describe("Live trim preview", () => {
  it("shows first included frame at the start edge and last included frame before exclusive Out", () => {
    expect(trimPreview(clip, source, "in")).toMatchObject({
      frame: 1,
      time: 1,
      lane: "B",
    });
    const end = trimPreview(clip, source, "out");
    expect(end.frame).toBe(3);
    expect(end.time).toBeCloseTo(1.3);
    expect(trimPreview({ ...clip, out: 3 }, source, "out").frame).toBe(2);
  });
  it("handles single-frame sections, body moves, undo and deletion without retaining a wrong boundary", () => {
    expect(trimPreview({ ...clip, out: 2 }, source, "out").frame).toBe(1);
    expect(trimPreview({ ...clip, start: 4 }, source, "move")).toMatchObject({
      frame: 1,
      time: 4,
    });
    const preview = trimPreview(clip, source, "out");
    expect(retainsTrim(preview, [clip])).toBe(true);
    expect(retainsTrim(preview, [{ ...clip, out: 3 }])).toBe(false);
    expect(retainsTrim(preview, [{ ...clip, id: "another section" }])).toBe(
      false,
    );
    expect(retainsTrim(preview, [])).toBe(false);
  });
  it("serializes decoding, skips intermediate pointer requests and never publishes an older frame", async () => {
    let finish!: (result: string) => void;
    const decode = vi.fn((n: number) =>
      n === 1
        ? new Promise<string>((resolve) => (finish = resolve))
        : Promise.resolve(`frame ${n}`),
    );
    const publish = vi.fn(),
      fail = vi.fn(),
      queue = new LatestFrame(decode, publish, fail);
    const pending = queue.request(1);
    void queue.request(2);
    void queue.request(3);
    expect(decode).toHaveBeenCalledTimes(1);
    finish("stale frame 1");
    await pending;
    expect(decode.mock.calls.map((c) => c[0])).toEqual([1, 3]);
    expect(publish.mock.calls).toEqual([[3, "frame 3"]]);
    expect(fail).not.toHaveBeenCalled();
  });
  it("discards results after cancellation and permits a fresh request", async () => {
    let finish!: (result: number) => void;
    const publish = vi.fn(),
      queue = new LatestFrame(
        (n: number) =>
          n === 1
            ? new Promise<number>((r) => (finish = r))
            : Promise.resolve(n),
        publish,
        vi.fn(),
      );
    const pending = queue.request(1);
    queue.clear();
    finish(1);
    await pending;
    expect(publish).not.toHaveBeenCalled();
    await queue.request(2);
    expect(publish).toHaveBeenCalledWith(2, 2);
  });
  it("suppresses stale decode errors and still renders the newest frame", async () => {
    let reject!: (error: Error) => void;
    const fail = vi.fn(),
      publish = vi.fn(),
      queue = new LatestFrame(
        (n: number) =>
          n === 1
            ? new Promise<number>((_r, j) => (reject = j))
            : Promise.resolve(n),
        publish,
        fail,
      );
    const pending = queue.request(1);
    void queue.request(2);
    reject(new Error("stale"));
    await pending;
    expect(fail).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(2, 2);
  });
});
