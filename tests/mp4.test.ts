import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { inspectMp4, checkUpscaleLimits } from "../shared/mp4";
import { estimateUpscaleUsd } from "../shared/presets";
describe("portable MP4 metadata", () => {
  it("reads actual library geometry and calculates an upscale estimate without ffprobe", async () => {
    const file = await readFile("tests/fixtures/metadata.mp4");
    let readBytes = 0;
    const metadata = await inspectMp4(file.length, async (offset, length) => {
      readBytes += length;
      return new Uint8Array(file.subarray(offset, offset + length)).buffer;
    });
    expect(metadata.width).toBe(960);
    expect(metadata.height).toBe(528);
    expect(metadata.duration).toBeCloseTo(10.041667, 2);
    expect(readBytes).toBeLessThan(file.length);
    expect(estimateUpscaleUsd(metadata, 2)).toBe(1.36);
  });
  it("rejects arbitrary data and metadata beyond the bounded scan", async () => {
    await expect(
      inspectMp4(1024, async (_, length) => new ArrayBuffer(length)),
    ).rejects.toThrow();
  });
  it("enforces actual input dimensions, duration and byte limits", () => {
    expect(() =>
      checkUpscaleLimits({ width: 960, height: 528, duration: 21 }, 1000),
    ).toThrow();
    expect(() =>
      checkUpscaleLimits({ width: 3000, height: 500, duration: 5 }, 1000),
    ).toThrow();
    expect(() =>
      checkUpscaleLimits({ width: 960, height: 528, duration: 5 }, 50_000_001),
    ).toThrow();
  });
});

it("skips a large media box to find metadata at the end", async () => {
  const file = await readFile("tests/fixtures/metadata.mp4");
  const boxes: { type: string; bytes: Buffer }[] = [];
  for (let offset = 0; offset < file.length;) {
    const size = file.readUInt32BE(offset);
    boxes.push({
      type: file.toString("ascii", offset + 4, offset + 8),
      bytes: file.subarray(offset, offset + size),
    });
    offset += size;
  }
  const payload = Buffer.alloc(8 * 1024 * 1024);
  payload.writeUInt32BE(payload.length, 0);
  payload.write("mdat", 4);
  const fixture = Buffer.concat([
    boxes.find((b) => b.type === "ftyp")!.bytes,
    payload,
    boxes.find((b) => b.type === "moov")!.bytes,
  ]);
  let readBytes = 0;
  const metadata = await inspectMp4(fixture.length, async (offset, length) => {
    readBytes += length;
    return new Uint8Array(fixture.subarray(offset, offset + length)).buffer;
  });
  expect(metadata.width).toBe(960);
  expect(readBytes).toBeLessThan(256 * 1024);
});
