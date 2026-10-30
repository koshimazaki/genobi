import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Job, Source } from "../shared/types";
import { wav } from "./audio-fixtures";
import {
  mf,
  submissions,
  lastSubmission,
  routerRequests,
  input,
  call,
  newSession,
  post,
  useWorker,
} from "./worker-harness";

// Media through the Worker: verified uploads, upscale inputs and capability
// links, and the bundled library.
useWorker();

describe("Cloudflare adapter media: uploads, upscale sources and the library", () => {
  it("quotes an upscale on a Comfy key and sends it to Router with a lent link", async () => {
    const session = newSession();
    const before = submissions;
    const upscale = { ...input, generator: "upscale", sourceId: "library-02" };
    const headers = {
      cookie: session,
      "x-byo-key": "comfyui-test-key-0004",
      "content-type": "application/json",
    };
    const quoted = await call("/api/quotes", {
      method: "POST",
      headers,
      body: JSON.stringify(upscale),
    });
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as {
      quote: { id: string; recipe: { route: string } };
    };
    expect(quote.recipe.route).toBe("router");
    const submitted = await call("/api/jobs", {
      method: "POST",
      headers: {
        ...headers,
        "idempotency-key": "worker-comfy-upscale",
        "quote-id": quote.id,
      },
      body: JSON.stringify(upscale),
    });
    expect(submitted.status).toBe(202);
    const sent = routerRequests.at(-1)!;
    expect(sent).toMatchObject({
      path: "/v2/models/bfl/video-upscale-v1/requests",
      apiKey: true,
      idempotency: "worker-comfy-upscale",
    });
    // A library clip is public: its own https URL, and no user field.
    expect(sent.body).toEqual({
      input_video: expect.stringMatching(/^https:\/\/studio\.test\//),
      upscale_factor: 2,
      creativity: 0,
      safety_tolerance: 2,
    });
    expect(submissions).toBe(before);
  });

  it("refuses to spend a BFL upscale quote on Router after the key changes", async () => {
    const session = newSession();
    const before = { bfl: submissions, router: routerRequests.length };
    const upscale = { ...input, generator: "upscale", sourceId: "library-02" };
    const with_ = (key: string) => ({
      cookie: session,
      "x-byo-key": key,
      "content-type": "application/json",
    });
    const quoted = await call("/api/quotes", {
      method: "POST",
      headers: with_("test-only-key"),
      body: JSON.stringify(upscale),
    });
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as {
      quote: { id: string; recipe: { route: string } };
    };
    expect(quote.recipe.route).toBe("bfl");
    const submitted = await call("/api/jobs", {
      method: "POST",
      headers: {
        ...with_("comfyui-test-key-0005"),
        "idempotency-key": "worker-key-swap-upscale",
        "quote-id": quote.id,
      },
      body: JSON.stringify(upscale),
    });
    expect(submitted.status).toBe(409);
    expect(((await submitted.json()) as { code: string }).code).toBe(
      "route_changed",
    );
    expect(submissions).toBe(before.bfl);
    expect(routerRequests.length).toBe(before.router);
  });
  it("inspects the stored MP4 before submitting upscale and grants only a temporary input link", async () => {
    const response = await post("worker-upscale-test", {
      ...input,
      generator: "upscale",
      sourceId: "fixture-source",
      upscalePrompt: "  Fine linen texture.  ",
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      job: { costEstimateUsd: 1.36, status: "Pending" },
    });
    expect(lastSubmission.prompt).toBe("Fine linen texture.");
    const url = String(lastSubmission.input_video);
    expect(url).toMatch(/^https:\/\/studio.test\/api\/input\//);
    const media = await mf.dispatchFetch(url, {
      headers: { range: "bytes=0-9" },
    });
    expect(media.status).toBe(206);
    const db = await mf.getD1Database("DB");
    await db.prepare("UPDATE shares SET expires=0").run();
    expect((await mf.dispatchFetch(url)).status).toBe(404);
  });
  it("checks uploaded bytes rather than browser-supplied metadata", async () => {
    const bytes = await readFile("tests/fixtures/metadata.mp4");
    const response = await call(
      "/api/uploads?filename=test.mp4&width=1&height=1&duration=1",
      {
        method: "POST",
        headers: {
          "x-byo-key": "test-only-key",
          "content-type": "video/mp4",
          "content-length": String(bytes.length),
        },
        body: bytes,
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      source: { width: 960, height: 528, origin: "upload" },
    });
  });
  it("streams audio uploads into R2 with their hash and verified type", async () => {
    const session = newSession();
    const upload = (body: Uint8Array, type: string) =>
      call("/api/uploads?filename=beat.wav", {
        method: "POST",
        headers: {
          cookie: session,
          "x-byo-key": "test-only-key",
          "content-type": type,
          "content-length": String(body.length),
        },
        body,
      });
    const track = wav(2);
    const response = await upload(track, "audio/wav");
    expect(response.status).toBe(201);
    const { source } = (await response.json()) as { source: Source };
    expect(source).toMatchObject({
      mediaType: "audio",
      contentType: "audio/wav",
      duration: 2,
    });
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT data, sha256, object_key FROM sources WHERE id=?")
      .bind(source.id)
      .first<{ data: string; sha256: string; object_key: string }>();
    expect(row!.sha256).toBe(createHash("sha256").update(track).digest("hex"));
    expect(row!.data).not.toContain(row!.sha256);
    expect(row!.object_key.endsWith(".audio")).toBe(true);
    const served = await call(source.url, { headers: { cookie: session } });
    expect(served.headers.get("content-type")).toBe("audio/wav");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(track);
    // A mislabelled file is refused and its object removed.
    const lying = await upload(track, "audio/flac");
    expect(lying.status).toBe(400);
    const sources = await db
      .prepare("SELECT COUNT(*) AS n FROM sources WHERE session=?")
      .bind(session.slice(15))
      .first<{ n: number }>();
    expect(sources!.n).toBe(1);
    const upscaleAudio = await post(
      "worker-upscale-audio",
      { ...input, generator: "upscale", sourceId: source.id },
      session,
    );
    expect(((await upscaleAudio.json()) as { error: string }).error).toBe(
      "Choose a video to upscale.",
    );
  });

  it("records an uploaded clip's hash in the take of the run that reads it", async () => {
    const session = newSession();
    const clip = new Uint8Array(await readFile("tests/fixtures/metadata.mp4"));
    const uploaded = await call("/api/uploads?filename=clip.mp4", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": "test-only-key",
        "content-type": "video/mp4",
        "content-length": String(clip.length),
      },
      body: clip,
    });
    const { source } = (await uploaded.json()) as { source: Source };
    const { job } = (await (
      await post(
        "worker-upscale-hashed",
        { ...input, generator: "upscale", sourceId: source.id },
        session,
      )
    ).json()) as { job: Job };
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT take FROM jobs WHERE id=?")
      .bind(job.id)
      .first<{ take: string }>();
    expect(JSON.parse(row!.take).inputs.at(-1)).toEqual({
      role: "source",
      assetId: source.id,
      sha256: createHash("sha256").update(clip).digest("hex"),
    });
  });
  it("gives a first-time visitor the bundled library rather than an empty studio", async () => {
    // No cookie: exactly what a stranger opening the URL cold receives.
    const response = await mf.dispatchFetch("https://studio.test/api/history");
    const data = (await response.json()) as { jobs: Job[]; sources: Source[] };
    expect(data.jobs).toEqual([]);
    expect(data.sources.map((source) => source.id)).toEqual([
      "library-05",
      "library-06",
      "library-07",
      "library-02",
      "library-04",
    ]);
    expect(
      data.sources.every(
        (source) => source.origin === "sample" && source.poster,
      ),
    ).toBe(true);
    // `bytes` exists only to limit-check the catalogue; it is never published.
    expect(JSON.stringify(data.sources)).not.toContain("bytes");
    // Library clips are served as static assets. The API media route stays
    // private, so a catalogue id is not a way into someone else's storage.
    expect((await call("/api/clips/library-05")).status).toBe(404);
  });
  it("upscales a bundled library clip without minting a capability link", async () => {
    const response = await post(
      "worker-library-upscale",
      { ...input, generator: "upscale", sourceId: "library-02" },
      newSession(),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      job: { costEstimateUsd: 0.69, status: "Pending" },
    });
    // A public asset is lent to BFL directly: no private token to leak or expire.
    expect(lastSubmission.input_video).toBe(
      "https://studio.test/media/library-02.mp4",
    );
    const db = await mf.getD1Database("DB");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM shares WHERE object_key LIKE 'library/%'",
        )
        .first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
  });
});

describe("curated public gallery pages", () => {
  it("serves GET and HEAD with no session cookie or provider submission", async () => {
    const before = submissions;
    for (const method of ["GET", "HEAD"]) {
      const response = await call("/embed/product-video", {
        method,
        headers: { cookie: "" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("content-security-policy")).toContain(
        "frame-ancestors *",
      );
      expect(Boolean(await response.text())).toBe(method === "GET");
    }
    expect(submissions).toBe(before);
    expect(
      (await call("/embed/product-video", { method: "POST" })).status,
    ).toBe(405);
    expect((await call("/watch/private-job")).status).toBe(404);
    // The watch page keeps framing off and names absolute HTTPS media.
    const watch = await call("/watch/audio-visual");
    expect(watch.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    const html = await watch.text();
    expect(html).toContain(
      '<meta name="twitter:player" content="https://studio.test/embed/audio-visual">',
    );
    expect(html).toContain(
      '<meta property="og:video:secure_url" content="https://studio.test/media/template-gallery/audio-visual-h3.mp4">',
    );
  });
});
