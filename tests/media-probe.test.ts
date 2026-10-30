import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { probeVideo, validateUpscaleSource } from "../server/media";
import { inspectMp4 } from "../shared/mp4";

const FIXTURE = "tests/fixtures/metadata.mp4";

describe("local video inspection", () => {
  it("reads real geometry from an MP4", async () => {
    expect(await probeVideo(FIXTURE)).toEqual({
      width: 960,
      height: 528,
      duration: 10.042,
    });
  });

  // The local adapter used to shell out to ffprobe while the Worker parsed the
  // MP4 itself: two readers for one job, disagreeing on duration by a third of
  // a millisecond. Since duration is a factor in the upscale price, the two
  // adapters must not drift apart again.
  it("agrees exactly with the reader the Worker uses", async () => {
    const file = await readFile(FIXTURE);
    const hosted = await inspectMp4(
      file.length,
      async (offset, length) =>
        new Uint8Array(file.subarray(offset, offset + length)).buffer,
    );
    expect(await probeVideo(FIXTURE)).toEqual(hosted);
  });

  it("rejects a file it cannot read as the caller's problem", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "probe-"));
    const file = path.join(directory, "not-a-video.mp4");
    await writeFile(file, "this is not an MP4");
    await expect(probeVideo(file)).rejects.toMatchObject({ status: 400 });
  });

  it("enforces the upscale ceilings shared with the Worker", async () => {
    expect((await validateUpscaleSource(FIXTURE)).width).toBe(960);
  });

  it("reports a file the server cannot open as the server's problem", async () => {
    await expect(
      probeVideo("tests/fixtures/missing.mp4"),
    ).rejects.toMatchObject({ status: 500 });
  });
});
