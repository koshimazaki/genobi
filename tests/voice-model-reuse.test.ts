import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadVoiceModel,
  MODEL_BYTES,
  MODEL_FILES,
} from "../server/voice-model";
import {
  FAKE_FILES as FILES,
  FAKE_TOTAL as TOTAL,
  fakeBytes as bytes,
  fakeHub as hub,
  type FakeName as Name,
  writeFakeModel as writeModel,
} from "./voice-fake-model";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function folders() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-model-reuse-"));
  roots.push(root);
  const source = path.join(root, "genobi-voice-old", "Qwen3-ASR-0.6B");
  const target = path.join(root, "genobi-voice-new", "Qwen3-ASR-0.6B");
  await mkdir(source, { recursive: true });
  await mkdir(target, { recursive: true });
  return { root, source, target };
}
const run = (target: string, sources: string[], signal?: AbortSignal) => {
  const progress = vi.fn();
  return {
    progress,
    result: downloadVoiceModel(
      target,
      signal ?? new AbortController().signal,
      progress,
      sources,
      FILES,
    ),
  };
};

describe("the pinned voice model", () => {
  it("pins a size and SHA-256 for every file of the real snapshot", () => {
    expect(MODEL_FILES).toHaveLength(8);
    for (const file of MODEL_FILES) {
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(MODEL_BYTES).toBe(1_880_560_703);
  });
});

describe("model already on disk, absent, partial or cancelled", () => {
  it("model present: verifies and links every file without a request", async () => {
    const { source, target } = await folders();
    await writeModel(source);
    const { fetcher } = hub();
    const { result, progress } = run(target, [source]);
    await expect(result).resolves.toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(TOTAL);
    for (const [name, data] of Object.entries(bytes))
      expect(await readFile(path.join(target, name))).toEqual(data);
  });

  it("model absent: downloads every file and checks each hash", async () => {
    const { target } = await folders();
    const { fetched } = hub();
    const { result, progress } = run(target, []);
    await expect(result).resolves.toBe(TOTAL);
    expect(fetched()).toEqual(Object.keys(bytes));
    expect(progress).toHaveBeenLastCalledWith(TOTAL);
    expect((await readdir(target)).sort()).toEqual(Object.keys(bytes).sort());
  });

  it("re-downloads a partial, oversized or wrong-hash file and keeps the rest", async () => {
    const { source, target } = await folders();
    await writeModel(source);
    // Partial weights in the old install, an oversized vocab beside them.
    await writeFile(
      path.join(source, "model.safetensors"),
      bytes["model.safetensors"].subarray(0, 1000),
    );
    await writeFile(path.join(source, "vocab.json"), "x".repeat(301));
    // A same-size config with different bytes is not the pinned file either.
    await writeFile(path.join(target, "config.json"), '{"model":"evil"}');
    await writeFile(path.join(source, "config.json"), '{"model":"evil"}');
    const { fetched } = hub();
    const { result } = run(target, [source]);
    await expect(result).resolves.toBe(TOTAL);
    expect(fetched()).toEqual(Object.keys(bytes));
    for (const [name, data] of Object.entries(bytes))
      expect(await readFile(path.join(target, name))).toEqual(data);
  });

  it("downloads only the file that does not verify", async () => {
    const { source, target } = await folders();
    await writeModel(source, ["vocab.json"]);
    await writeFile(path.join(source, "vocab.json"), "x".repeat(120));
    const { fetched } = hub();
    const { result } = run(target, [source]);
    await expect(result).resolves.toBe(bytes["vocab.json"].length);
    expect(fetched()).toEqual(["vocab.json"]);
  });

  it("does not trust a symbolic link to model bytes", async () => {
    const { root, source, target } = await folders();
    const elsewhere = path.join(root, "elsewhere");
    await mkdir(elsewhere);
    await writeModel(elsewhere);
    await writeModel(source, ["model.safetensors"]);
    await symlink(
      path.join(elsewhere, "model.safetensors"),
      path.join(source, "model.safetensors"),
    );
    const { fetched } = hub();
    await expect(run(target, [source]).result).resolves.toBe(
      bytes["model.safetensors"].length,
    );
    expect(fetched()).toEqual(["model.safetensors"]);
  });

  it("cancel mid-download stops, and the next attempt starts clean", async () => {
    const { root, target } = await folders();
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("vocab.json")) {
          controller.abort();
          throw init?.signal?.reason ?? new Error("aborted");
        }
        return new Response(
          new Uint8Array(bytes[String(url).split("/").pop() as Name]),
        );
      }),
    );
    await expect(run(target, [], controller.signal).result).rejects.toThrow();
    // The installer removes this attempt's folder; the next one is fresh.
    await rm(path.dirname(target), { recursive: true, force: true });
    const next = path.join(root, "genobi-voice-next", "Qwen3-ASR-0.6B");
    await mkdir(next, { recursive: true });
    const { fetched } = hub();
    await expect(run(next, [target]).result).resolves.toBe(TOTAL);
    expect(fetched()).toEqual(Object.keys(bytes));
  });
});
