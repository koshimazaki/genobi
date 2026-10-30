import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComfySdkWorkflows } from "../server/comfy-sdk";
import { saveResult } from "../server/job-output";
import { inspectAudio, inspectStoredAudio } from "../shared/audio";
import { CREDITS_PER_USD } from "../shared/comfy/ltx";
import type { Project } from "../shared/director/types";
import type { Job } from "../shared/types";
import { MUSIC_ESTIMATE_CREDITS } from "../shared/music";
import { mp3, wav } from "./audio-fixtures";
import { studio } from "./project-copy-harness";

// MiniMax Music 3 through the local server, the whole lifecycle with nothing
// paid: four candidates are four quotes and four submissions through the
// official SDK on a fake Comfy Cloud; a finished song is saved as an MP3,
// measured by the shared reader, served as audio, listed as an audio source,
// and handed into a project as a production audio asset.
const key = "comfyui-test-key-music";
const music = {
  generator: "audio",
  model: "minimax-music-3",
  description: "Synthwave anime teaser, driving bass, 128 BPM, no vocals.",
  lyrics: "",
  duration: 20,
};
// 766 frames of 1,152 samples at 44.1 kHz, stated in a Xing header: 20.01 s.
const song = mp3(320_000, 766);

function fakeCloud(bytes: Uint8Array<ArrayBuffer> = song) {
  const graphs: Record<string, { inputs: Record<string, unknown> }>[] = [];
  const keys: string[] = [];
  const job = (id: string, status: string, outputs: object[] = []) => ({
    id,
    status,
    created_at: "2026-10-27T00:00:00Z",
    started_at: null,
    completed_at: null,
    expires_at: "2026-10-28T00:00:00Z",
    queue_position: null,
    progress: null,
    outputs,
    error: null,
    urls: { self: `/api/v2/jobs/${id}`, events: "", cancel: "" },
  });
  const signed = "https://storage.googleapis.com/comfy-out/song.mp3?sig=abc";
  const fetcher: typeof fetch = async (target, init) => {
    const url = String(target);
    if (url === "https://cloud.comfy.org/api/v2/jobs") {
      graphs.push(JSON.parse(String(init?.body)).workflow);
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return Response.json(job(`m-${graphs.length}`, "queued"), {
        status: 201,
      });
    }
    const read = /\/api\/v2\/jobs\/(m-\d+)$/.exec(url);
    if (read)
      return Response.json(
        job(read[1], "succeeded", [
          // A preview of another kind is never taken for the song.
          {
            id: "asset-img",
            node_id: "99",
            name: "preview.png",
            type: "image",
            content_type: "image/png",
            size_bytes: 10,
          },
          {
            id: "asset-song",
            node_id: "35",
            name: "audio_minimax_music3_00001_.mp3",
            type: "audio",
            content_type: "audio/mpeg",
            size_bytes: bytes.length,
          },
        ]),
      );
    if (url === "https://cloud.comfy.org/api/v2/assets/asset-song/content")
      return new Response(null, { status: 302, headers: { Location: signed } });
    if (url === signed) return new Response(bytes);
    return new Response("unexpected", { status: 500 });
  };
  return {
    graphs,
    keys,
    client: new ComfySdkWorkflows({ fetcher, env: {} }),
  };
}

describe("local job API: MiniMax Music 3", () => {
  it("quotes four candidates, submits each once, and saves a measured MP3 take", async () => {
    const cloud = fakeCloud();
    const { base, cookie, post, directory, bfl } = await studio(cloud.client);
    const headers = {
      cookie,
      "Content-Type": "application/json",
      "x-byo-key": key,
    };
    const quotes: { id: string; estimateUsd: number; recipe: unknown }[] = [];
    for (let n = 0; n < 4; n++) {
      const response = await fetch(`${base}/api/quotes`, {
        method: "POST",
        headers,
        body: JSON.stringify(music),
      });
      expect(response.status).toBe(201);
      quotes.push((await response.json()).quote);
    }
    expect(new Set(quotes.map((q) => q.id)).size).toBe(4);
    for (const quote of quotes) {
      expect(quote.estimateUsd).toBeCloseTo(
        MUSIC_ESTIMATE_CREDITS / CREDITS_PER_USD,
      );
      expect(quote.recipe).toEqual({
        id: "minimax-music-3",
        version: 1,
        route: "workflow",
        workflow: "minimax-music-3",
        location: "cloud",
      });
    }
    // Nothing was sent while quoting.
    expect(cloud.graphs).toHaveLength(0);

    const jobs: Job[] = [];
    for (const [n, quote] of quotes.entries()) {
      const response = await post(`music-candidate-${n}`, music, {
        "x-byo-key": key,
        "Quote-Id": quote.id,
      });
      expect(response.status).toBe(202);
      jobs.push((await response.json()).job);
    }
    expect(jobs.map((job) => job.status)).toEqual(Array(4).fill("Pending"));
    expect(jobs.every((job) => job.mediaType === "audio")).toBe(true);
    // One submission per candidate, each keyed by its own reserved job.
    expect(cloud.keys).toEqual(jobs.map((job) => job.id));
    for (const graph of cloud.graphs) {
      expect(graph["37:13"].inputs).toMatchObject({
        caption: music.description,
        lyrics: "",
        max_duration: 20,
      });
      expect(graph["35"].inputs).toMatchObject({
        format: "mp3",
        "format.quality": "V0",
      });
    }
    // A fresh seed per run: four different songs from one setup.
    const seeds = cloud.graphs.map((graph) => graph["37:38"].inputs.seed);
    expect(new Set(seeds).size).toBe(4);

    const polled = await (
      await fetch(`${base}/api/jobs/${jobs[0].id}`, {
        headers: { cookie, "x-byo-key": key },
      })
    ).json();
    expect(polled.job).toMatchObject({
      status: "Ready",
      mediaType: "audio",
      resultContentType: "audio/mpeg",
      resultUrl: `/api/clips/${jobs[0].id}`,
    });
    // Cloud reports no credits, so the take keeps its estimate.
    expect(polled.job.costActualUsd).toBeUndefined();
    const media = await readdir(path.join(directory, "media"));
    expect(media).toContain(`${jobs[0].id}.mp3`);
    expect(media.some((name) => name.endsWith(".audio-download"))).toBe(false);

    const history = await (
      await fetch(`${base}/api/history`, { headers: { cookie } })
    ).json();
    const source = history.sources.find(
      (item: { id: string }) => item.id === jobs[0].id,
    );
    expect(source).toMatchObject({
      mediaType: "audio",
      contentType: "audio/mpeg",
      origin: "generated",
      width: 0,
      height: 0,
    });
    expect(source.duration).toBeCloseTo((766 * 1152) / 44100, 3);
    const served = await fetch(`${base}${polled.job.resultUrl}`, {
      headers: { cookie },
    });
    expect(served.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(song);

    const take = await (
      await fetch(`${base}/api/takes/${jobs[0].id}`, { headers: { cookie } })
    ).json();
    expect(take.take.outputs).toEqual([
      {
        assetId: jobs[0].id,
        mediaType: "audio",
        contentType: "audio/mpeg",
        available: true,
      },
    ]);
    expect(bfl.submissions).toBe(0);
  });

  it("spends a quote once, replays a key without sending, and refuses changed lyrics", async () => {
    const cloud = fakeCloud();
    const { base, cookie, post } = await studio(cloud.client);
    const { quote } = await (
      await fetch(`${base}/api/quotes`, {
        method: "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
          "x-byo-key": key,
        },
        body: JSON.stringify(music),
      })
    ).json();
    const headers = { "x-byo-key": key, "Quote-Id": quote.id };
    const { job } = await (await post("music-once-1", music, headers)).json();
    expect(job.status).toBe("Pending");
    // A spent quote cannot pay for a second run.
    const reused = await post("music-once-2", music, headers);
    expect(reused.status).toBe(409);
    expect((await reused.json()).code).toMatch(/^quote_/);
    // The same key and settings answer with the same job; nothing is sent.
    const replay = await post("music-once-1", music, { "x-byo-key": key });
    expect((await replay.json()).job.id).toBe(job.id);
    // Lyrics are part of the request: the same key with others is refused.
    const changed = await post(
      "music-once-1",
      { ...music, lyrics: "[verse]\nNeon rain" },
      { "x-byo-key": key },
    );
    expect(changed.status).toBe(409);
    expect(cloud.graphs).toHaveLength(1);
  });

  it("hands a Ready song into a linked project as a production audio asset", async () => {
    const cloud = fakeCloud();
    const { base, cookie, upload, push, send, project, fresh } = await studio(
      cloud.client,
    );
    await upload(cookie);
    await push(cookie, null, 1);
    const { code } = await send(cookie, `/${project.id}/link`, "POST");
    // The agent's own session links the copy and makes the take.
    const agent = await fresh();
    const linked = await fetch(`${base}/api/projects/link`, {
      method: "POST",
      headers: { cookie: agent, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(linked.status).toBe(200);
    const copyId = (await linked.json()).project.copyId as string;
    const submitted = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: {
        cookie: agent,
        "Content-Type": "application/json",
        "Idempotency-Key": "music-handoff-1",
        "x-byo-key": key,
      },
      body: JSON.stringify(music),
    });
    const { job } = await submitted.json();
    const ready = await (
      await fetch(`${base}/api/jobs/${job.id}`, {
        headers: { cookie: agent, "x-byo-key": key },
      })
    ).json();
    expect(ready.job.status).toBe("Ready");

    const handed = await fetch(`${base}/api/projects/${copyId}/takes`, {
      method: "POST",
      headers: { cookie: agent, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, baseRevision: 1 }),
    });
    expect(handed.status).toBe(200);
    const added = await handed.json();
    expect(added).toMatchObject({ revision: 2, added: true });

    const copy = (await send(cookie, `/${project.id}`)).project as Project;
    const asset = copy.assets[added.assetId];
    expect(asset).toMatchObject({
      kind: "audio",
      use: "production",
      origin: "generated",
    });
    expect(asset.file.path).toMatch(/\.mp3$/);
    expect(asset.durationSeconds).toBeCloseTo((766 * 1152) / 44100, 3);
    expect(copy.generations.at(-1)).toMatchObject({
      outputAssetIds: [added.assetId],
      prompt: music.description,
    });
  });
});

describe("a song whose MP3 states no length", () => {
  // Variable bitrate with no Xing, Info or VBRI frame: the strict reader
  // refuses it, so it is measured by walking every frame header.
  const vbr = mp3(320_000, undefined, 0, true);
  let frames = 0;
  for (let at = 0; at + 4 <= vbr.length; frames++) at += frames % 2 ? 626 : 417;
  const seconds = (frames * 1152) / 44100;

  it("goes Ready, keeps the file, and hands in with the same length", async () => {
    const cloud = fakeCloud(vbr);
    const { base, cookie, upload, push, send, project, fresh, directory } =
      await studio(cloud.client);
    await upload(cookie);
    await push(cookie, null, 1);
    const { code } = await send(cookie, `/${project.id}/link`, "POST");
    const agent = await fresh();
    const linked = await fetch(`${base}/api/projects/link`, {
      method: "POST",
      headers: { cookie: agent, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const copyId = (await linked.json()).project.copyId as string;
    const { job } = await (
      await fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: {
          cookie: agent,
          "Content-Type": "application/json",
          "Idempotency-Key": "music-vbr-1",
          "x-byo-key": key,
        },
        body: JSON.stringify(music),
      })
    ).json();
    const polled = await (
      await fetch(`${base}/api/jobs/${job.id}`, {
        headers: { cookie: agent, "x-byo-key": key },
      })
    ).json();
    expect(polled.job).toMatchObject({
      status: "Ready",
      resultContentType: "audio/mpeg",
    });
    expect(polled.job.error).toBeUndefined();
    expect(await readdir(path.join(directory, "media"))).toEqual([
      `${job.id}.mp3`,
    ]);
    const history = await (
      await fetch(`${base}/api/history`, { headers: { cookie: agent } })
    ).json();
    const source = history.sources.find(
      (item: { id: string }) => item.id === job.id,
    );
    expect(source.duration).toBeCloseTo(seconds, 6);
    expect(cloud.graphs).toHaveLength(1);

    const handed = await fetch(`${base}/api/projects/${copyId}/takes`, {
      method: "POST",
      headers: { cookie: agent, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, baseRevision: 1 }),
    });
    expect(handed.status).toBe(200);
    const added = await handed.json();
    const copy = (await send(cookie, `/${project.id}`)).project as Project;
    expect(copy.assets[added.assetId].durationSeconds).toBeCloseTo(seconds, 6);
  });

  it("is measured exactly from its headers, while uploads stay strict", async () => {
    const read = async (offset: number, length: number) =>
      vbr.slice(offset, offset + length).buffer;
    await expect(inspectAudio(vbr.length, read)).rejects.toThrow(
      /cannot be read/,
    );
    const stored = await inspectStoredAudio(vbr.length, read);
    expect(stored).toEqual({
      width: 0,
      height: 0,
      duration: seconds,
      contentType: "audio/mpeg",
    });
    // A file with a Xing frame count is read from it, unchanged.
    const stated = await inspectStoredAudio(
      song.length,
      async (offset, length) => song.slice(offset, offset + length).buffer,
    );
    expect(stated.duration).toBeCloseTo((766 * 1152) / 44100, 9);
  });
});

describe("the copy step for a song", () => {
  it("names the file by the format its header proves, and keeps what it cannot measure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "genobi-music-"));
    try {
      await mkdir(path.join(root, "media"));
      const job = { id: "song-wav", generator: "audio" } as const;
      const saved = await saveResult(root, job, new Response(wav(2)));
      expect(saved).toMatchObject({
        file: path.join(root, "media", "song-wav.wav"),
        mediaType: "audio",
        metadata: { contentType: "audio/wav", duration: 2 },
      });
      // A paid result no header measures is kept as the graph's MP3, with no
      // length, rather than deleted and fetched again.
      const kept = await saveResult(
        root,
        { id: "song-bad", generator: "audio" },
        new Response(new Uint8Array(4096).fill(7)),
      );
      expect(kept).toMatchObject({
        file: path.join(root, "media", "song-bad.mp3"),
        metadata: { contentType: "audio/mpeg", duration: 0 },
      });
      expect((await readdir(path.join(root, "media"))).sort()).toEqual([
        "song-bad.mp3",
        "song-wav.wav",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
