import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { wav } from "./audio-fixtures";
import { input, setup } from "./server-harness";

// Uploads verified by their bytes, and the bundled library for local visitors.
describe("local job API: uploads and the library", () => {
  it("requires MP4 upload MIME and verifies the file rather than trusting the header", async () => {
    const { base, cookie, store } = await setup();
    for (const type of [
      "application/octet-stream",
      "video/quicktime",
      "video/mp4",
    ]) {
      const response = await fetch(`${base}/api/uploads?filename=fake.mp4`, {
        method: "POST",
        headers: { cookie, "Content-Type": type },
        body: "This is not an MP4 file",
      });
      expect(response.status).toBe(400);
    }
    expect(store.data.sources).toHaveLength(0);
  });

  it("takes images and audio as well as MP4, hashed and typed by their bytes", async () => {
    const { base, cookie, store, post } = await setup();
    const upload = (
      body: Uint8Array<ArrayBuffer>,
      type: string,
      name: string,
    ) =>
      fetch(`${base}/api/uploads?filename=${name}`, {
        method: "POST",
        headers: { cookie, "Content-Type": type },
        body,
      });
    const track = wav(2);
    const audio = await upload(track, "audio/x-wav", "beat.wav");
    expect(audio.status).toBe(201);
    const { source } = await audio.json();
    expect(source).toMatchObject({
      label: "beat.wav",
      mediaType: "audio",
      contentType: "audio/wav",
      duration: 2,
    });
    expect(source).not.toHaveProperty("sha256");
    expect(store.data.sources.at(-1)!.sha256).toBe(
      createHash("sha256").update(track).digest("hex"),
    );
    const served = await fetch(`${base}${source.url}`, { headers: { cookie } });
    expect(served.headers.get("content-type")).toBe("audio/wav");
    const png = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/reference.png")),
    );
    const image = await upload(png, "image/png", "ref.png");
    expect((await image.json()).source).toMatchObject({
      mediaType: "image",
      contentType: "image/png",
    });
    // The declared type must be what the bytes are.
    const lying = await upload(track, "audio/mpeg", "beat.mp3");
    expect(lying.status).toBe(400);
    expect((await lying.json()).error).toMatch(/do not match/);
    expect(store.data.sources).toHaveLength(2);
    const upscaleAudio = await post("upscale-audio", {
      ...input,
      generator: "upscale",
      sourceId: source.id,
    });
    expect((await upscaleAudio.json()).error).toBe(
      "Choose a video to upscale.",
    );
    // An uploaded clip's hash reaches the take of the run that reads it.
    const clip = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    const video = (await (await upload(clip, "video/mp4", "clip.mp4")).json())
      .source;
    const { job } = await (
      await post("upscale-hashed", {
        ...input,
        generator: "upscale",
        sourceId: video.id,
      })
    ).json();
    expect(
      store.data.jobs.find((item) => item.id === job.id)!.take!.inputs.at(-1),
    ).toEqual({
      role: "source",
      assetId: video.id,
      sha256: createHash("sha256").update(clip).digest("hex"),
    });
  });

  it("offers the bundled library to a first-time local visitor", async () => {
    const { base, cookie } = await setup(path.resolve("public"));
    const history = await (
      await fetch(`${base}/api/history`, { headers: { cookie } })
    ).json();
    expect(history.jobs).toEqual([]);
    expect(history.sources.map((source: { id: string }) => source.id)).toEqual([
      "library-05",
      "library-06",
      "library-07",
      "library-02",
      "library-04",
    ]);
    expect(JSON.stringify(history.sources)).not.toContain("bytes");
  });

  it("upscales a library clip locally from its own catalogue entry", async () => {
    const { post, bfl } = await setup(path.resolve("public"));
    const response = await post("library-upscale", {
      ...input,
      generator: "upscale",
      sourceId: "library-02",
    });
    expect(response.status).toBe(202);
    // Priced from the real file the catalogue points at, inspected on the server.
    expect((await response.json()).job.costEstimateUsd).toBe(0.69);
    expect(bfl.requests[0]).toMatchObject({ generator: "upscale" });
    expect(typeof bfl.requests[0].body.input_video).toBe("string");
  });
});
