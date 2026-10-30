// The local voice routes with a fake worker and decoder: no Python, model or
// ffmpeg is needed, and every refusal is checked to happen before a spawn.
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { voiceConfig, type VoiceConfig } from "../server/voice";
import { VOICE_LANGUAGES } from "../shared/voice-languages";
import {
  WorkerError,
  type WorkerRequest,
  type WorkerResult,
} from "../server/voice-process";
import { wav } from "./audio-fixtures";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Real files where a configured machine would have them. */
async function machine() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-voice-test-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const python = path.join(root, "python3");
  const ffmpeg = path.join(root, "ffmpeg");
  const model = path.join(root, "Qwen3-ASR-0.6B");
  for (const file of [python, ffmpeg]) {
    await writeFile(file, "#!/bin/sh\nexit 0\n");
    await chmod(file, 0o755);
  }
  await mkdir(model);
  await writeFile(path.join(model, "config.json"), "{}");
  return { root, python, ffmpeg, model };
}

const speech = () =>
  Float32Array.from(
    { length: 16_000 * 3 },
    (_, i) => Math.sin((2 * Math.PI * 220 * i) / 16_000) * 0.2,
  );

async function setup(
  config: VoiceConfig,
  result: WorkerResult | Error = {
    segments: [
      { start: 0, end: 3, text: "render with l t x at six point one seconds" },
    ],
    language: "English",
    inferSeconds: 0.5,
  },
  samples: () => Float32Array = speech,
) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-voice-app-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const counts = { spawned: 0, decoded: 0, killed: 0 };
  const requests: WorkerRequest[] = [];
  const created = await createApp({
    directory: path.join(temporary, ".local"),
    publicDirectory: temporary,
    voice: {
      config,
      decode: async () => {
        counts.decoded++;
        return samples();
      },
      start: () => {
        counts.spawned++;
        return {
          ready: Promise.resolve({
            model: "Qwen3-ASR-0.6B · Metal",
            loadSeconds: 1,
          }),
          async run(request) {
            requests.push({
              ...request,
              exists: existsSync(request.pcmPath),
            } as WorkerRequest);
            if (result instanceof Error) throw result;
            return result;
          },
          kill: () => void counts.killed++,
        };
      },
    },
  });
  cleanups.push(async () => created.voice.close());
  const server = await new Promise<Server>((resolve) => {
    const listener = created.app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}/api/voice`;
  // No cookie: each request is its own session, so the write limiter stays out of the way.
  const send = (
    body: Uint8Array<ArrayBuffer>,
    type = "audio/wav",
    query = "",
  ) =>
    fetch(`${base}/transcribe${query}`, {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  return { base, send, counts, requests };
}

describe("GET /api/voice/status", () => {
  it("says what to install when nothing is configured", async () => {
    const { base } = await setup({
      ...voiceConfig({}),
      ffmpeg: "/nonexistent/ffmpeg",
    });
    const status = await (await fetch(`${base}/status`)).json();
    expect(status).toMatchObject({
      available: false,
      python: false,
      model: false,
      ffmpeg: false,
      maxSeconds: 180,
    });
    expect(status.setup).toContain("GENOBI_VOICE_PYTHON");
    expect(status.setup).toContain("GENOBI_VOICE_MODEL");
    expect(status.setup).toContain("ffmpeg");
  });

  it("reports a configured machine without sending any path", async () => {
    const files = await machine();
    const { base } = await setup({ ...voiceConfig({}), ...files });
    const text = await (await fetch(`${base}/status`)).text();
    expect(JSON.parse(text)).toEqual({
      available: true,
      python: true,
      model: true,
      ffmpeg: true,
      maxSeconds: 180,
      languages: ["auto", ...VOICE_LANGUAGES],
      language: "auto",
    });
    expect(text).not.toContain(files.root);
  });

  it("lists the languages, with GENOBI_VOICE_LANGUAGE as the default", async () => {
    const files = await machine();
    const { base } = await setup({
      ...voiceConfig({ GENOBI_VOICE_LANGUAGE: "japanese" }),
      ...files,
    });
    const status = await (await fetch(`${base}/status`)).json();
    expect(status).toMatchObject({ available: true, language: "Japanese" });
    expect(status.languages).toHaveLength(31);
    expect(status.languages.slice(0, 3)).toEqual([
      "auto",
      "Chinese",
      "English",
    ]);
  });

  it("is not set up with a language the model does not know", async () => {
    const files = await machine();
    const { base, send, counts } = await setup({
      ...voiceConfig({ GENOBI_VOICE_LANGUAGE: "Klingon" }),
      ...files,
    });
    const status = await (await fetch(`${base}/status`)).json();
    expect(status.available).toBe(false);
    expect(status.language).toBeUndefined();
    expect(status.setup).toContain("GENOBI_VOICE_LANGUAGE");
    expect(status.setup).not.toContain("Klingon");
    expect((await send(wav(3))).status).toBe(503);
    expect(counts.spawned).toBe(0);
  });

  it("reads its configuration from the environment", () => {
    expect(
      voiceConfig({
        GENOBI_VOICE_PYTHON: " /opt/voice/bin/python ",
        GENOBI_VOICE_MODEL: "/models/Qwen3-ASR-0.6B",
        GENOBI_VOICE_LANGUAGE: "English",
      }),
    ).toMatchObject({
      python: "/opt/voice/bin/python",
      model: "/models/Qwen3-ASR-0.6B",
      language: "English",
      ffmpeg: "ffmpeg",
    });
  });
});

describe("POST /api/voice/transcribe refuses before spawning anything", () => {
  it("refuses a wrong type, an unreadable file and an overlong note", async () => {
    const files = await machine();
    const { send, counts } = await setup({ ...voiceConfig({}), ...files });
    for (const type of ["audio/webm", "video/mp4", "text/plain"]) {
      const response = await send(wav(1), type);
      expect(response.status).toBe(415);
      expect((await response.json()).code).toBe("voice_type");
    }
    const garbage = new TextEncoder().encode("RIFF....WAVEnot a real header");
    expect((await send(garbage)).status).toBe(400);
    const long = await send(wav(181));
    expect(long.status).toBe(413);
    expect((await long.json()).code).toBe("voice_too_long");
    expect(counts).toEqual({ spawned: 0, decoded: 0, killed: 0 });
  });

  it("refuses an upload over the shared audio ceiling", async () => {
    const files = await machine();
    const { send, counts } = await setup({ ...voiceConfig({}), ...files });
    const response = await send(new Uint8Array(50_000_001));
    expect(response.status).toBe(413);
    expect(counts).toEqual({ spawned: 0, decoded: 0, killed: 0 });
  });

  it("refuses on an unconfigured machine", async () => {
    const { send, counts } = await setup({
      ...voiceConfig({}),
      ffmpeg: "/nonexistent/ffmpeg",
    });
    const response = await send(wav(2));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("voice_not_configured");
    expect(counts).toEqual({ spawned: 0, decoded: 0, killed: 0 });
  });

  it("never starts the model for a recording with no speech", async () => {
    const files = await machine();
    const { send, counts } = await setup(
      { ...voiceConfig({}), ...files },
      undefined,
      () => new Float32Array(16_000 * 2),
    );
    const response = await send(wav(2));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("no_speech");
    expect(counts).toMatchObject({ spawned: 0, decoded: 1 });
  });
});

describe("POST /api/voice/transcribe", () => {
  it("returns the cleaned transcript, timing and chunk counts", async () => {
    const files = await machine();
    const { send, counts, requests } = await setup({
      ...voiceConfig({}),
      ...files,
    });
    const response = await send(wav(3));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      text: "render with LTX at 6.1 seconds",
      heard: "render with l t x at six point one seconds",
      model: "Qwen3-ASR-0.6B · Metal",
      chunks: { total: 1, transcribed: 1 },
      timing: { audioSeconds: 3, prewarmed: false, transcribeSeconds: 0.5 },
    });
    expect(requests[0]).toMatchObject({
      schema: 1,
      chunks: [[0, 48_000]],
      context: expect.stringContaining("Genobi, Ninja"),
      exists: true,
    });
    // The decoded audio is removed once the worker has answered.
    expect(existsSync(requests[0].pcmPath)).toBe(false);
    expect(counts).toEqual({ spawned: 1, decoded: 1, killed: 1 });
  });

  it("passes each note's language to the worker, or the server's default", async () => {
    const files = await machine();
    const { send, requests } = await setup({
      ...voiceConfig({ GENOBI_VOICE_LANGUAGE: "English" }),
      ...files,
    });
    for (const query of ["?language=Japanese", "?language=auto", ""])
      expect((await send(wav(3), "audio/wav", query)).status).toBe(200);
    expect(requests.map((r) => r.language)).toEqual([
      "Japanese",
      null,
      "English",
    ]);
    // Unset, a request without a language lets the model detect it.
    const unset = await setup({ ...voiceConfig({}), ...files });
    await unset.send(wav(3));
    expect(unset.requests[0].language).toBeNull();
  });

  it("refuses a language off the list before anything is decoded", async () => {
    const files = await machine();
    const { send, counts } = await setup({ ...voiceConfig({}), ...files });
    for (const query of [
      "?language=Klingon",
      "?language=english",
      "?language=English&language=French",
      `?language=${"E".repeat(500)}`,
    ]) {
      const response = await send(wav(3), "audio/wav", query);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("voice_language");
    }
    expect(counts).toMatchObject({ spawned: 0, decoded: 0 });
  });

  it("uses the prewarmed worker", async () => {
    const files = await machine();
    const { base, send, counts } = await setup({
      ...voiceConfig({}),
      ...files,
    });
    const warm = await fetch(`${base}/prewarm`, { method: "POST" });
    expect(await warm.json()).toEqual({ warming: true });
    const body = await (await send(wav(3))).json();
    expect(body.timing.prewarmed).toBe(true);
    expect(counts.spawned).toBe(1);
  });

  it("frees a prewarmed worker when the recording is discarded", async () => {
    const files = await machine();
    const { base, counts } = await setup({ ...voiceConfig({}), ...files });
    await fetch(`${base}/prewarm`, { method: "POST" });
    expect(counts).toMatchObject({ spawned: 1, killed: 0 });
    const cancel = await fetch(`${base}/prewarm`, { method: "DELETE" });
    expect(await cancel.json()).toEqual({ stopped: true });
    expect(counts).toMatchObject({ spawned: 1, killed: 1 });
    const again = await fetch(`${base}/prewarm`, { method: "DELETE" });
    expect(await again.json()).toEqual({ stopped: false });
  });

  it("stays out of the paid-write limit", async () => {
    const files = await machine();
    const { base } = await setup({ ...voiceConfig({}), ...files });
    const first = await fetch(`${base}/status`);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    // Paid writes stop at 8 a minute; ten voice POSTs in one session pass.
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${base}/prewarm`, {
        method: "POST",
        headers: { cookie },
      });
      expect(response.status).toBe(202);
    }
  });

  it("drops the dictionary echoed from a silent chunk", async () => {
    const files = await machine();
    const { send } = await setup(
      { ...voiceConfig({}), ...files },
      {
        segments: [{ start: 0, end: 3, text: "Genobi, Ninja, Klein, LTX." }],
        language: "English",
        inferSeconds: 0.4,
      },
    );
    const response = await send(wav(3));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("no_speech");
  });

  it("turns a worker failure into a fixed message", async () => {
    const files = await machine();
    const { send } = await setup(
      { ...voiceConfig({}), ...files },
      new WorkerError("packages_missing"),
    );
    const response = await send(wav(3));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ code: "packages_missing" });
    expect(text).not.toContain(files.root);
  });
});
