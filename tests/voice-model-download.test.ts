import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadVoiceModel, MODEL_REVISION } from "../server/voice-model";
afterEach(() => vi.unstubAllGlobals());
it("uses a pinned official snapshot and rejects truncated bytes before activation", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-download-test-"));
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(50)));
  vi.stubGlobal("fetch", fetcher);
  const progress = vi.fn();
  try {
    await expect(
      downloadVoiceModel(folder, new AbortController().signal, progress),
    ).rejects.toThrow("failed verification");
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://huggingface.co/Qwen/Qwen3-ASR-0.6B/resolve/${MODEL_REVISION}/chat_template.json`,
    );
    expect(progress).toHaveBeenLastCalledWith(50);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
