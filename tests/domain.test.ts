import { describe, expect, it } from "vitest";
import {
  composePrompt,
  estimateUpscaleOutput,
  estimateUpscaleUsd,
  estimateVideoUsd,
  presets,
} from "../shared/presets";
import { access, readFile } from "node:fs/promises";
import { canonicalInput } from "../shared/idempotency";
import { parseLibrary } from "../shared/library";
import { librarySetupJob } from "../src/library";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import {
  expireStaleJob,
  JOB_MAX_AGE_MS,
  MAX_RESULT_BYTES,
  SESSION_STORAGE_BYTES,
  TOTAL_STORAGE_BYTES,
} from "../shared/lifecycle";
import { providerUrl } from "../server/bfl";
import { validateInput } from "../server/validation";
import type { GenerateInput, Job, VideoResolution } from "../shared/types";

const input = {
  generator: "video",
  description: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
};

describe("request contract", () => {
  it("appends only the selected camera clause and removes it for upscale", () => {
    const valid = validateInput(input);
    expect(presets).toHaveLength(8);
    expect(composePrompt(valid)).toContain(presets[0].clause);
    expect(composePrompt({ ...valid, cameraEnabled: false })).toBe(
      "A ceramic vessel.",
    );
    const upscale = validateInput({
      ...input,
      generator: "upscale",
      sourceId: "library-01",
    });
    expect(upscale.cameraEnabled).toBe(false);
    expect(composePrompt(upscale)).toBe("");
  });
  it("rejects expensive or arbitrary upstream controls", () => {
    expect(() => validateInput({ ...input, duration: 21 })).toThrow();
    expect(() => validateInput({ ...input, presetId: "unknown" })).toThrow();
    expect(() =>
      validateInput({
        ...input,
        generator: "upscale",
        sourceId: "https://example.com/file.mp4",
      }),
    ).toThrow();
    expect(() => validateInput({ ...input, description: "" })).toThrow();
  });
  it("preserves editable camera text, including an intentionally empty instruction", () => {
    const custom = validateInput({
      ...input,
      cameraText: "Pan slowly across the horizon.",
    });
    expect(composePrompt(custom)).toBe(
      "A ceramic vessel.\n\nPan slowly across the horizon.",
    );
    expect(composePrompt({ ...custom, cameraText: "" })).toBe(
      "A ceramic vessel.",
    );
    expect(composePrompt({ ...custom, cameraEnabled: false })).toBe(
      "A ceramic vessel.",
    );
    expect(composePrompt({ ...custom, generator: "upscale" })).toBe("");
    expect(composePrompt(validateInput(input))).toContain(presets[0].clause);
    for (const cameraText of [null, true, 42, "a".repeat(601)]) {
      expect(() => validateInput({ ...input, cameraText })).toThrow();
    }
  });
  it("validates real duration, aspect and resolution options while normalising drafts to HD", () => {
    expect(validateInput(input).aspectRatio).toBe("16:9");
    for (const duration of [5, 12, 20])
      expect(validateInput({ ...input, duration }).duration).toBe(duration);
    for (const duration of [4, 21, 5.5, Infinity, NaN, "5", null]) {
      expect(() => validateInput({ ...input, duration })).toThrow();
    }
    for (const aspectRatio of [
      "21:9",
      "2:1",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
    ]) {
      expect(validateInput({ ...input, aspectRatio }).aspectRatio).toBe(
        aspectRatio,
      );
    }
    for (const aspectRatio of ["auto", "4:5", null, 1])
      expect(() => validateInput({ ...input, aspectRatio })).toThrow();
    for (const resolution of ["hd", "fhd", "qhd", "uhd"]) {
      expect(validateInput({ ...input, resolution }).resolution).toBe(
        resolution,
      );
      expect(
        validateInput({ ...input, resolution, draft: true }).resolution,
      ).toBe("hd");
    }
    for (const resolution of ["4k", "HD", null, 720])
      expect(() => validateInput({ ...input, resolution })).toThrow();
  });
  it("prices the requested duration and resolution and ignores resolution for draft pricing", () => {
    const rates: Record<VideoResolution, number> = {
      hd: 0.17,
      fhd: 0.29,
      qhd: 0.4,
      uhd: 0.8,
    };
    for (const resolution of Object.keys(rates) as VideoResolution[]) {
      expect(estimateVideoUsd(false, 20, resolution)).toBeCloseTo(
        rates[resolution] * 20,
      );
      expect(estimateVideoUsd(true, 20, resolution)).toBe(1.2);
    }
    expect(estimateVideoUsd(false, 7, "fhd")).toBe(2.03);
    expect(estimateVideoUsd()).toBe(0.85);
    expect(estimateVideoUsd(true)).toBe(0.3);
  });
  it("prices upscale from delivered dimensions and seconds, using binary megapixels", () => {
    expect(estimateVideoUsd()).toBe(0.85);
    expect(estimateVideoUsd(true)).toBe(0.3);
    expect(estimateUpscaleUsd({ width: 1280, height: 720, duration: 5 })).toBe(
      1.24,
    );
    expect(
      estimateUpscaleUsd({ width: 1280, height: 720, duration: 5 }, 2, 1),
    ).toBe(1.76);
    expect(
      estimateUpscaleUsd({ width: 1024, height: 1024, duration: 10 }, 3, 0),
    ).toBe(6.3);
    expect(
      estimateUpscaleUsd({ width: 2560, height: 1440, duration: 5 }, 3, 0),
    ).toBe(4.82);
    expect(
      estimateUpscaleUsd({ width: 2560, height: 1440, duration: 5 }, 3, 1),
    ).toBe(6.88);
  });
  it("validates upscale bounds and defaults old requests to Precise", () => {
    const upscale = { ...input, generator: "upscale", sourceId: "library-01" };
    expect(validateInput(upscale).upscaleCreativity).toBe(0);
    for (const factor of [1.5, 2.4, 3]) {
      expect(
        validateInput({
          ...upscale,
          upscaleFactor: factor,
          upscaleCreativity: 1,
        }),
      ).toMatchObject({ upscaleFactor: factor, upscaleCreativity: 1 });
    }
    for (const factor of [1.49, 3.01, NaN, Infinity, "2", null]) {
      expect(() =>
        validateInput({ ...upscale, upscaleFactor: factor }),
      ).toThrow();
    }
    for (const creativity of [-1, 2, "1", true, null]) {
      expect(() =>
        validateInput({ ...upscale, upscaleCreativity: creativity }),
      ).toThrow();
    }
  });
  it("estimates output size with an aspect-preserving 13.75MP ceiling", () => {
    expect(
      estimateUpscaleOutput({ width: 1280, height: 720 }, 1.5),
    ).toMatchObject({
      width: 1920,
      height: 1080,
      effectiveFactor: 1.5,
      capped: false,
    });
    const capped = estimateUpscaleOutput({ width: 2560, height: 1440 }, 3);
    expect(capped.capped).toBe(true);
    expect(capped.megapixels).toBe(13.75);
    expect(capped.effectiveFactor).toBeLessThan(3);
    expect(capped.width * capped.height).toBeLessThanOrEqual(13.75 * 1048576);
    expect(capped.width / capped.height).toBeCloseTo(16 / 9, 3);
  });
});

describe("provider trust boundary", () => {
  it("allows documented BFL regional hosts and denies arbitrary URLs", () => {
    expect(
      providerUrl("https://api.eu.bfl.ai/v1/get_result?id=123", "poll")
        .hostname,
    ).toBe("api.eu.bfl.ai");
    expect(
      providerUrl(
        "https://delivery.eu.bfl.ai/result.mp4?token=redacted",
        "media",
      ).hostname,
    ).toBe("delivery.eu.bfl.ai");
    for (const url of [
      "http://api.bfl.ai/v1/get_result",
      "https://api.bfl.ai.evil.test/v1/get_result",
      "https://api.bfl.ai:8443/v1/get_result",
      "https://key@api.bfl.ai/v1/get_result",
      "https://localhost/v1/get_result",
    ]) {
      expect(() => providerUrl(url, "poll")).toThrow();
    }
    expect(() =>
      providerUrl("https://api.bfl.ai/v1/flux-3-video", "poll"),
    ).toThrow();
  });
});

describe("shared policy", () => {
  it("compares replays by value, so both backends answer one the same way", () => {
    const base = validateInput(input);
    // Older rows may carry any key order inside camera and cameraEdits.
    const ordered = {
      ...base,
      camera: { "shot-sizes": "close-up", angles: null, movements: "pan" },
      cameraEdits: { pan: "Pan gently.", dutch: "" },
    } as GenerateInput;
    const shuffled = {
      ...base,
      camera: { movements: "pan", "shot-sizes": "close-up", angles: null },
      cameraEdits: { dutch: "", pan: "Pan gently." },
    } as GenerateInput;
    expect(canonicalInput(shuffled)).toBe(canonicalInput(ordered));
    // A job recorded before aspect ratio and creativity existed still replays.
    const legacy: Partial<GenerateInput> = { ...base };
    delete legacy.aspectRatio;
    delete legacy.upscaleCreativity;
    expect(canonicalInput(legacy)).toBe(canonicalInput(base));
    // An absent camera wording means the preset's clause, not a blank one.
    expect(canonicalInput({ ...base, cameraText: presets[0].clause })).toBe(
      canonicalInput(base),
    );
    expect(canonicalInput({ ...base, cameraText: "" })).not.toBe(
      canonicalInput(base),
    );
    // Dropping a field that was submitted is a change, not a match.
    expect(canonicalInput({ ...base, upscalePrompt: "Fine linen." })).not.toBe(
      canonicalInput(base),
    );
  });

  it("publishes only catalogue clips that pass an upload's own limits", async () => {
    const catalogue = JSON.parse(
      await readFile("public/media/gallery.json", "utf8"),
    );
    const shipped = parseLibrary(catalogue);
    expect(shipped).toHaveLength(5);
    expect(
      shipped.every(
        (clip) => clip.origin === "sample" && clip.url.startsWith("/media/"),
      ),
    ).toBe(true);
    const [first] = catalogue;
    for (const broken of [
      { ...first, url: "https://elsewhere.test/clip.mp4" },
      { ...first, poster: "https://elsewhere.test/clip.jpg", duration: 0 },
      { ...first, duration: 30 },
      { ...first, bytes: 60_000_000 },
      { ...first, bytes: undefined },
      { ...first, width: 960.5 },
      { ...first, id: "../escape" },
    ])
      expect(parseLibrary([broken])).toEqual([]);
    expect(parseLibrary("not a catalogue")).toEqual([]);
  });

  it("ships a catalogue whose recorded runs still reproduce their prompts", async () => {
    const shipped = parseLibrary(
      JSON.parse(await readFile("public/media/gallery.json", "utf8")),
    );
    // A clip made outside the studio carries no prompt it could not prove; it
    // names the model that made it instead, and offers no run to restore.
    const outside = shipped.filter((clip) => !clip.setup);
    expect(outside.map((clip) => clip.model)).toEqual(
      outside.map(() => "minimax-h3-router"),
    );
    expect(librarySetupJob(outside[0]!)).toBeUndefined();
    // Its provenance line travels instead, sanitised and bounded.
    for (const clip of outside)
      expect(clip.about).toContain("MiniMax H3 (open weights)");
    const [raw] = JSON.parse(
      await readFile("public/media/gallery.json", "utf8"),
    ) as Record<string, unknown>[];
    const [noisy] = parseLibrary([
      { ...raw, description: `a\x00b\x7f${"x".repeat(400)}` },
    ]);
    expect(noisy!.about).toMatch(/^a b /);
    expect(noisy!.about!.length).toBeLessThanOrEqual(300);
    expect(noisy!.about).not.toMatch(/[\x00-\x1f\x7f]/);
    const recorded = shipped.filter((clip) => clip.setup);
    expect(recorded.length).toBeGreaterThan(0);
    for (const clip of recorded) {
      const setup = clip.setup!;
      // The shipped inputs are a request this studio would still accept today.
      const validated = validateInput(setup);
      // And its own composer rebuilds, exactly, the prompt that made the video.
      expect(composePrompt(validated)).toBe(setup.prompt);
      // Recreate restores that run rather than approximating it.
      const job = librarySetupJob(clip)!;
      const restored = composerReducer(initialComposer, {
        type: "restore",
        job,
      });
      expect(composePrompt(composerInput(restored))).toBe(setup.prompt);
      expect(composerInput(restored)).toMatchObject({
        duration: setup.duration,
        resolution: setup.resolution,
        aspectRatio: setup.aspectRatio,
        draft: setup.draft,
      });
    }
  });

  it("keeps private provider lineage out of the public media catalogue", async () => {
    await expect(access("public/media/provenance.json")).rejects.toThrow();
    const published = await readFile("public/media/gallery.json", "utf8");
    expect(published).not.toMatch(/jobId|sha256|providerStatus/);
    expect(published).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it("keeps storage ceilings above a single result, so an arrival is never evicted", () => {
    // Eviction drops oldest first. If one generation could fill a visitor's
    // whole ceiling, the clip they just paid for could be the one removed.
    expect(SESSION_STORAGE_BYTES).toBeGreaterThanOrEqual(MAX_RESULT_BYTES);
    // And a single visitor can never fill the deployment on their own.
    expect(TOTAL_STORAGE_BYTES).toBeGreaterThan(SESSION_STORAGE_BYTES);
  });

  it("expires an abandoned job once and never touches a finished one", () => {
    const job = { status: "Generating" } as Job;
    expect(expireStaleJob(job, Date.now())).toBe(false);
    expect(expireStaleJob(job, Date.now() - JOB_MAX_AGE_MS - 1)).toBe(true);
    expect(job.status).toBe("expired");
    expect(job.error).toContain("30-minute");
    // Terminal states, and unreadable timestamps, are left exactly as they are.
    expect(expireStaleJob(job, 0)).toBe(false);
    expect(expireStaleJob({ status: "Ready" } as Job, 0)).toBe(false);
    expect(expireStaleJob({ status: "copying" } as Job, NaN)).toBe(false);
  });
});
