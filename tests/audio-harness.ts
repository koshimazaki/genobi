// The local app for the audio analysis tests: a fresh .local directory, an
// optional fake ffmpeg and librosa worker, a listener on a random port.
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { createApp } from "../server/app";
import type { AudioAnalysisOptions } from "../server/audio-analysis";
import type { Run } from "../server/ffmpeg";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export async function audioApp(run?: Run, audio: AudioAnalysisOptions = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-audio-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, ".local");
  const created = await createApp({
    directory,
    publicDirectory: directory,
    mediaTools: run ? { run } : undefined,
    // No Python unless a test names one: the machine's own setting is ignored.
    audio: { python: "", ...audio },
  });
  // Any analysis thread still running is stopped with the app.
  cleanups.push(() => created.audio.close());
  const server = await new Promise<Server>((resolve) => {
    const listener = created.app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const session = async () =>
    (await fetch(`${base}/api/health`)).headers
      .get("set-cookie")!
      .split(";")[0];
  const cookie = await session();
  const upload = async (body: Uint8Array, type: string, as = cookie) => {
    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { cookie: as, "Content-Type": type },
      body: new Uint8Array(body),
    });
    return ((await response.json()) as { source: { id: string } }).source;
  };
  const analyze = (body: unknown, as = cookie) =>
    fetch(`${base}/api/audio/analyze`, {
      method: "POST",
      headers: { cookie: as, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { ...created, base, cookie, session, upload, analyze, temporary };
}
