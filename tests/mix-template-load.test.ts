import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { adaptiveReverb } from "../shared/templates/adaptive-reverb";
import { loadMixTemplate } from "../src/director/mix-template";

afterEach(() => vi.unstubAllGlobals());
it("loads real mix assets once for concurrent opens without unrelated starter media", async () => {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(await readFile(new URL(`../public${url}`, import.meta.url))),
  );
  vi.stubGlobal("fetch", fetcher);
  const [first, second] = await Promise.all([
    loadMixTemplate(adaptiveReverb),
    loadMixTemplate(adaptiveReverb),
  ]);
  expect(first).toBe(second);
  const media = Object.values(adaptiveReverb.mix!.media);
  expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual(
    media.map((m) => m.url).sort(),
  );
  for (const asset of Object.values(first.project.assets)) {
    const bytes = first.files.get(asset.file.path)!;
    expect(bytes.byteLength).toBeGreaterThan(100);
  }
  await loadMixTemplate(adaptiveReverb);
  expect(fetcher).toHaveBeenCalledTimes(media.length * 2);
});
it("releases a failed load so opening the template again can recover", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadMixTemplate(adaptiveReverb)).rejects.toThrow(
    "Template media unavailable",
  );
  const calls = fetcher.mock.calls.length;
  await expect(loadMixTemplate(adaptiveReverb)).rejects.toThrow(
    "Template media unavailable",
  );
  expect(fetcher.mock.calls.length).toBe(calls * 2);
});
