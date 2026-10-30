// The local media service under test: a fresh .local directory and a listener on
// a random loopback port per test, with an optional fake in place of ffmpeg.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { createApp } from "../server/app";
import type { Run } from "../server/ffmpeg";

/** The render cases run only where ffmpeg and ffprobe are installed. */
export const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Registered by each test file that imports this module.
export const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export async function setup(run?: Run) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-ffmpeg-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, ".local");
  const created = await createApp({
    directory,
    publicDirectory: directory,
    mediaTools: run ? { run } : undefined,
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = created.app.listen(0, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const cookie = (await fetch(`${base}/api/health`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const upload = async (
    body: Uint8Array<ArrayBuffer>,
    type: string,
    name: string,
  ) =>
    (
      (await (
        await fetch(`${base}/api/uploads?filename=${name}`, {
          method: "POST",
          headers: { cookie, "Content-Type": type },
          body,
        })
      ).json()) as { source: { id: string; duration: number } }
    ).source;
  const media = (operation: string, body: object, session = cookie) =>
    fetch(`${base}/api/media/${operation}`, {
      method: "POST",
      headers: { cookie: session, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { ...created, base, cookie, upload, media, directory };
}

export const clip = async () =>
  new Uint8Array(await readFile(path.resolve("tests/fixtures/metadata.mp4")));
