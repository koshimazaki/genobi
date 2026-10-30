import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { videoDuration } from "../src/director/video-source";

it("reads all 97 frames despite a shorter container duration", async () => {
  const bytes = new Uint8Array(
    readFileSync("tests/fixtures/short-metadata.mp4"),
  );
  const mdhd = Buffer.from(bytes).indexOf("mdhd");
  expect(mdhd).toBeGreaterThan(0);
  expect(bytes[mdhd + 4]).toBe(0); // version-0 media header
  const header = new DataView(bytes.buffer);
  const containerDuration =
    header.getUint32(mdhd + 20) / header.getUint32(mdhd + 16);
  expect(containerDuration).toBeLessThan(3.2333);
  const duration = await videoDuration(bytes);
  expect(duration).toBeCloseTo(97 / 30, 9);
});
