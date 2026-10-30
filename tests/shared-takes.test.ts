// Takes made from a terminal or an agent appear in the studio (29 Oct 2026):
// on the local server the studio's history lists another session's Ready
// take that the CLI or an MCP client made, marked with where it came from,
// and the studio may read its file, take and job. Studio sessions stay apart,
// an agent-marked request reads nothing new, and spending is unchanged.
// Fake providers only: nothing is paid.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { Job, Source } from "../shared/types";
import { mp3 } from "./audio-fixtures";
import { input, setup } from "./server-harness";

type Harness = Awaited<ReturnType<typeof setup>>;
const fresh = async (base: string) =>
  (await fetch(`${base}/api/health`)).headers.get("set-cookie")!.split(";")[0];

/** A finished take in `cookie`'s session, sent with `marks` on every request. */
async function finished(
  { base }: Harness,
  cookie: string,
  marks: Record<string, string>,
  body: object = input,
) {
  const headers = { cookie, ...marks };
  const made = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  expect(made.status).toBe(202);
  const id = ((await made.json()) as { job: Job }).job.id;
  const polled = await fetch(`${base}/api/jobs/${id}`, { headers });
  expect(((await polled.json()) as { job: Job }).job.status).toBe("Ready");
  return id;
}

/** A response's status, its body read so the test server can close. */
async function statusOf(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  await response.arrayBuffer();
  return response.status;
}

const historyOf = async (base: string, headers: Record<string, string>) =>
  (await (await fetch(`${base}/api/history`, { headers })).json()) as {
    jobs: Job[];
    sources: Source[];
  };

async function videoStudio() {
  const harness = await setup();
  harness.bfl.media = new Uint8Array(
    await readFile(path.resolve("tests/fixtures/metadata.mp4")),
  );
  harness.bfl.ready = true;
  return harness;
}

describe("local server: takes from a terminal or an agent in the studio", () => {
  it("lists a terminal's Ready take in the studio's history, marked, and serves it", async () => {
    const harness = await videoStudio();
    const { base, cookie: studio } = harness;
    const terminal = await fresh(base);
    const id = await finished(harness, terminal, {
      "X-Genobi-Client": "cli",
    });

    const seen = await historyOf(base, { cookie: studio });
    const job = seen.jobs.find((item) => item.id === id);
    expect(job).toMatchObject({
      origin: "terminal",
      shared: true,
      status: "Ready",
      resultUrl: `/api/clips/${id}`,
    });
    expect(JSON.stringify(job)).not.toContain(terminal.slice(15));
    expect(seen.sources.some((source) => source.id === id)).toBe(true);

    // The gallery plays it, Recreate reads its take, a click reads the job.
    const clip = await fetch(`${base}/api/clips/${id}`, {
      headers: { cookie: studio },
    });
    expect(clip.status).toBe(200);
    expect(clip.headers.get("content-type")).toBe("video/mp4");
    await clip.arrayBuffer();
    for (const route of [`/api/takes/${id}`, `/api/jobs/${id}`])
      expect(await statusOf(`${base}${route}`, { cookie: studio })).toBe(200);
    const direct = await fetch(`${base}/api/jobs/${id}`, {
      headers: { cookie: studio },
    });
    expect((await direct.json()).job).toMatchObject({
      id,
      origin: "terminal",
      shared: true,
    });

    // An upscale of it reads the source and runs in the studio's own session.
    const polls = harness.bfl.polls;
    const upscale = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: {
        cookie: studio,
        "Content-Type": "application/json",
        "Idempotency-Key": "upscale-shared",
      },
      body: JSON.stringify({ ...input, generator: "upscale", sourceId: id }),
    });
    expect(upscale.status).toBe(202);
    await upscale.arrayBuffer();
    const made = harness.store.data.jobs.find(
      (item) => item.idempotencyKey === "upscale-shared",
    )!;
    expect(made.sessionId).toBe(studio.slice(15));
    expect(made.origin).toBeUndefined();
    expect(harness.bfl.polls).toBe(polls);

    // The terminal's own history holds its take, unmarked as shared.
    const own = await historyOf(base, { cookie: terminal });
    expect(own.jobs.find((item) => item.id === id)).toMatchObject({
      origin: "terminal",
    });
    expect(own.jobs.find((item) => item.id === id)?.shared).toBeUndefined();
  });

  it("keeps studio sessions apart and gives a marked agent nothing new", async () => {
    const harness = await videoStudio();
    const { base, cookie: studio } = harness;
    const other = await fresh(base);
    const theirs = await finished(harness, other, {});
    const fromMcp = await finished(harness, await fresh(base), {
      "X-Genobi-Client": "mcp",
    });

    const seen = await historyOf(base, { cookie: studio });
    expect(seen.jobs.map((job) => job.id)).toEqual([fromMcp]);
    expect(seen.jobs[0]).toMatchObject({ origin: "agent", shared: true });
    expect(
      await statusOf(`${base}/api/clips/${theirs}`, { cookie: studio }),
    ).toBe(404);

    // An agent-marked session, the CLI and an MCP client see their own only.
    for (const marks of <Record<string, string>[]>[
      { "X-Genobi-Agent-Session": "1" },
      { "X-Genobi-Client": "cli" },
      { "X-Genobi-Client": "mcp" },
    ]) {
      const headers = { cookie: await fresh(base), ...marks };
      expect((await historyOf(base, headers)).jobs).toEqual([]);
      for (const route of [
        `/api/clips/${fromMcp}`,
        `/api/takes/${fromMcp}`,
        `/api/jobs/${fromMcp}`,
      ])
        expect(await statusOf(`${base}${route}`, headers)).toBe(404);
    }
  });

  it("still refuses spending to an agent-marked request, whatever its client says", async () => {
    const harness = await videoStudio();
    const submissions = harness.bfl.submissions;
    for (const client of [undefined, "cli", "mcp"]) {
      const response = await fetch(`${harness.base}/api/jobs`, {
        method: "POST",
        headers: {
          cookie: await fresh(harness.base),
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-Genobi-Agent-Session": "1",
          ...(client ? { "X-Genobi-Client": client } : {}),
        },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe(
        "agent_cannot_spend",
      );
    }
    expect(harness.bfl.submissions).toBe(submissions);
  });

  it("shows a song from the terminal as an audio take the studio can play", async () => {
    // 766 frames of 1,152 samples at 44.1 kHz: a measured 20 s MP3.
    const song = mp3(320_000, 766);
    const music: WorkflowClient = {
      run: async () => "https://cloud.comfy.org/api/v2/jobs/song-1",
      poll: async () => ({
        id: "song-1",
        status: "Ready",
        result: { sample: "https://storage.googleapis.com/out/song.mp3" },
      }),
      download: async () => new Response(song),
    };
    const harness = await setup(undefined, music);
    const terminal = await fresh(harness.base);
    const id = await finished(
      harness,
      terminal,
      { "X-Genobi-Client": "cli", "x-byo-key": "comfyui-test-key-music" },
      {
        generator: "audio",
        model: "minimax-music-3",
        description: "Synthwave teaser, driving bass, no vocals.",
        lyrics: "",
        duration: 20,
      },
    );
    const seen = await historyOf(harness.base, { cookie: harness.cookie });
    expect(seen.jobs.find((job) => job.id === id)).toMatchObject({
      generator: "audio",
      mediaType: "audio",
      origin: "terminal",
      shared: true,
    });
    expect(seen.sources.find((source) => source.id === id)).toMatchObject({
      mediaType: "audio",
      contentType: "audio/mpeg",
      origin: "generated",
    });
    // Send to Director copies the file the studio reads here.
    const clip = await fetch(`${harness.base}/api/clips/${id}`, {
      headers: { cookie: harness.cookie },
    });
    expect(clip.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await clip.arrayBuffer())).toEqual(song);
  });
});
