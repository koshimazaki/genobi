import { describe, expect, it, vi } from "vitest";
import { checkRouter, MODELS, validKey } from "../scripts/lib/router-check.mjs";
import { registry, type ReadyEntry } from "../shared/registry";

// The Router enablement check, against a fake Router: free reads only.
const key = "comfyui-check-router-key";
const answer =
  (status: number, type?: string) => async (): Promise<Response> =>
    type
      ? Response.json(
          { error_type: type, detail: "x" },
          { status, headers: { "X-Comfy-Error-Type": type } },
        )
      : Response.json({ data: [] }, { status });

describe("scripts/check-router.mjs", () => {
  it("asks only free GET reads, with the key in a header", async () => {
    const fetcher = vi.fn<typeof fetch>(answer(200));
    const result = await checkRouter(key, fetcher);
    expect(result.code).toBe(0);
    expect(result.line).toMatch(/^ENABLED/);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.comfy\.org\/v2\/models/);
      expect(String(url)).not.toContain(key);
      expect(init?.method).toBeUndefined();
      expect(init?.body).toBeUndefined();
    }
    // The catalogue, then each model Genobi runs on Router.
    expect(fetcher).toHaveBeenCalledTimes(1 + MODELS.length);
    expect(MODELS).toContain("minimax/minimax-h3");
    // Every Router model the registry runs is read, the upscale included.
    const paths = fetcher.mock.calls.map(
      ([url]) => new URL(String(url)).pathname,
    );
    const routerModels = registry
      .filter((e): e is ReadyEntry => e.status === "ready")
      .filter((e) => e.route === "router");
    for (const entry of routerModels)
      expect(paths).toContain(`/v2/models/${entry.model}`);
    expect(MODELS).toContain("bfl/video-upscale-v1");
  });
  it("reports not_enabled, and anything else as inconclusive", async () => {
    expect(
      (await checkRouter(key, vi.fn(answer(403, "not_enabled")))).code,
    ).toBe(1);
    expect(
      (await checkRouter(key, vi.fn(answer(401, "unauthorized")))).code,
    ).toBe(2);
    expect(
      (
        await checkRouter(
          key,
          vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
        )
      ).code,
    ).toBe(2);
  });
  it("accepts only a well-formed Comfy key", () => {
    expect(validKey(key)).toBe(true);
    for (const bad of [
      undefined,
      "",
      "bfl-key-123456789",
      "comfyui-a b-cdefgh",
      "comfyui-",
    ])
      expect(validKey(bad)).toBe(false);
  });
});
