import { describe, expect, it } from "vitest";
import { CREDITS_PER_USD, estimateVideoCredits } from "../shared/comfy/ltx";
import { estimateImageUsd } from "../shared/image";
import { estimateUpscaleUsd, estimateVideoUsd } from "../shared/presets";
import {
  estimateRunUsd,
  newQuote,
  publicQuote,
  QUOTE_TTL_MS,
  settingsHash,
  type QuoteRecord,
} from "../shared/quote";
import { startTake } from "../shared/take";
import type { GenerateInput } from "../shared/types";
import { requireQuote } from "../server/take";

const video: GenerateInput = {
  generator: "video",
  model: "flux-3",
  description: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 10,
  resolution: "fhd",
  aspectRatio: "16:9",
  draft: false,
  upscaleFactor: 2,
  upscaleCreativity: 0,
};
const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return [
      (error as { status: number }).status,
      (error as { code: string }).code,
    ];
  }
  return null;
};

describe("quotes", () => {
  it("price every run the way the adapters always have", () => {
    expect(estimateRunUsd(video)).toBe(estimateVideoUsd(false, 10, "fhd"));
    expect(estimateRunUsd({ ...video, model: "ltx-2.5-pro" })).toBe(
      estimateVideoCredits("ltx-2.5-pro", 10, "fhd") / CREDITS_PER_USD,
    );
    const image = {
      ...video,
      generator: "image" as const,
      imageResolution: "2k" as const,
    };
    expect(estimateRunUsd(image)).toBe(estimateImageUsd(image));
    const clip = { width: 960, height: 528, duration: 10 };
    expect(
      estimateRunUsd(
        { ...video, generator: "upscale", upscaleCreativity: 1 },
        clip,
      ),
    ).toBe(estimateUpscaleUsd(clip, 2, 1));
  });

  it("carry the take's settings hash and recipe, and live ten minutes", async () => {
    const take = await startTake(video, false);
    const quote = newQuote(take, 1.2, Date.parse("2026-10-20T10:00:00Z"));
    expect(quote).toMatchObject({
      estimateUsd: 1.2,
      recipe: take.recipe,
      settings: settingsHash(take),
      expiresAt: new Date(
        Date.parse("2026-10-20T10:00:00Z") + QUOTE_TTL_MS,
      ).toISOString(),
    });
    expect(quote.id).toMatch(/^[0-9a-f-]{36}$/);
    // The settings hash is the adapters' business, not the caller's.
    const spent: QuoteRecord = { ...quote, jobId: "job-1" };
    expect(publicQuote(spent)).toEqual({
      id: quote.id,
      estimateUsd: 1.2,
      recipe: take.recipe,
      expiresAt: quote.expiresAt,
    });
  });

  it("are spent once, before they expire, on the settings they priced", async () => {
    const take = await startTake(video, false);
    const now = Date.parse("2026-10-20T10:00:00Z");
    const quote = newQuote(take, 1.2, now);
    const settings = settingsHash(take);
    expect(requireQuote(quote, settings, now)).toBe(quote);
    expect(code(() => requireQuote(undefined, settings, now))).toEqual([
      404,
      "quote_missing",
    ]);
    expect(
      code(() => requireQuote({ ...quote, jobId: "job-1" }, settings, now)),
    ).toEqual([409, "quote_used"]);
    expect(
      code(() => requireQuote(quote, settings, now + QUOTE_TTL_MS)),
    ).toEqual([410, "quote_expired"]);
    const other = settingsHash(
      await startTake({ ...video, duration: 5 }, false),
    );
    expect(code(() => requireQuote(quote, other, now))).toEqual([
      409,
      "quote_mismatch",
    ]);
  });
});
