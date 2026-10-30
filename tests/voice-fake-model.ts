import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { vi } from "vitest";
import type { ModelFile } from "../server/voice-model";

/**
 * A fake model: three small files with their own sizes and SHA-256, so the
 * reuse, re-download and cancel paths run without the real 1.9 GB snapshot.
 */
export const fakeBytes = {
  "config.json": Buffer.from('{"model":"fake"}'),
  "vocab.json": Buffer.from("x".repeat(300)),
  "model.safetensors": Buffer.from("w".repeat(4096)),
};
export type FakeName = keyof typeof fakeBytes;
export const FAKE_NAMES = Object.keys(fakeBytes) as FakeName[];
export const FAKE_FILES: ModelFile[] = Object.entries(fakeBytes).map(
  ([name, data]) => ({
    name,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  }),
);
export const FAKE_TOTAL = FAKE_FILES.reduce((n, file) => n + file.size, 0);

export async function writeFakeModel(folder: string, except: FakeName[] = []) {
  for (const name of FAKE_NAMES)
    if (!except.includes(name))
      await writeFile(path.join(folder, name), fakeBytes[name], {
        mode: 0o600,
      });
}

/** Serves the fake model as the Hub would; records which files were fetched. */
export function fakeHub() {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const name = url.split("/").pop() as FakeName;
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return new Response(new Uint8Array(fakeBytes[name]));
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    fetcher,
    fetched: () =>
      fetcher.mock.calls.map(([url]) => String(url).split("/").pop()),
  };
}
