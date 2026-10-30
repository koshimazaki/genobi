import { describe, expect, it } from "vitest";
import {
  APPROVAL_TIMEOUT_MS,
  chainShapeError,
  chainStageKey,
  chainStatus,
  chainView,
  MAX_CHAIN_STAGES,
  stageInput,
  stageStatuses,
  type ChainRecord,
} from "../shared/chain";
import { readyEntry, type ReadyEntry } from "../shared/registry";
import { IDEMPOTENCY_KEY } from "../shared/idempotency";
import { checkUpscaleLimits } from "../shared/mp4";
import { estimateUpscaleOutput } from "../shared/presets";
import { QUOTE_TTL_MS } from "../shared/quote";
import {
  effectiveFrame,
  resolveTarget,
  OUTPUT_TARGETS,
} from "../shared/output-targets";
import type { Job, JobStatus } from "../shared/types";
import { validateChain } from "../server/validate-chain";
import { validateInput } from "../server/validation";

// The chain contract (shared/chain.ts), output targets
// (shared/output-targets.ts) and the request validator both adapters share.
const video = {
  generator: "video",
  description: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
};
const upscale = { ...video, generator: "upscale", cameraEnabled: false };
const ltx = { ...video, model: "ltx-2.5", duration: 6 };
const ACOUSTIC = { mode: "room", preset: "empty_club", level: "high" };
const fitted = (body: object) => validateInput(body);
const entry = (id: string) => readyEntry(id) as ReadyEntry;
const fluxVideoControls = entry("flux-3-video");
const ltxVideoControls = entry("ltx-2-5-fast");
const ltxAcousticControls = entry("ltx-2-5-akuspace");
const upscaleControls = entry("flux-video-upscale");
const job = (id: string, status: JobStatus) => ({ id, status }) as Job;
const record = (stages: ChainRecord["stages"]): ChainRecord => ({
  id: "00000000-0000-4000-8000-000000000000",
  stages,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
});
const shape = (body: object) => {
  try {
    validateChain(body);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

describe("chain shape", () => {
  it("runs each stage under an idempotency key the job layer accepts", () => {
    expect(chainStageKey(record([]).id, 5)).toMatch(IDEMPOTENCY_KEY);
  });

  it("validates every stage with the single-submission allowlist", () => {
    const { stages } = validateChain({
      stages: [{ input: video }, { input: upscale }],
    });
    expect(stages[0].input).toEqual(fitted(video));
    // A consuming stage reads the previous one by default and stores no source.
    expect(stages[1].consumes).toBe(0);
    expect(stages[1].input.sourceId).toBeUndefined();
    expect(stages[1].input.generator).toBe("upscale");
    expect(shape({ stages: [{ input: { ...video, duration: 99 } }] })).toBe(
      "Stage 1: Choose a whole number of seconds between 5 and 20.",
    );
  });

  it("refuses shapes a stage cannot run", () => {
    const seven = Array.from({ length: MAX_CHAIN_STAGES + 1 }, () => ({
      input: video,
    }));
    expect(shape({ stages: seven })).toMatch(/between one and 6/);
    expect(shape({ stages: [] })).toMatch(/between one and 6/);
    expect(shape({ stages: "x" })).toMatch(/between one and 6/);
    expect(shape([])).toBe("Expected a chain request.");
    // Only an upscale reads an earlier stage today.
    expect(shape({ stages: [{ input: video }, { input: video }] })).toBe(
      "Stage 2: only an upscale can read an earlier stage today.",
    );
    expect(
      shape({ stages: [{ input: video }, { input: upscale, consumes: 1 }] }),
    ).toMatch(/name an earlier stage/);
    expect(
      shape({ stages: [{ input: video }, { input: upscale, consumes: "0" }] }),
    ).toMatch(/name an earlier stage/);
    expect(shape({ stages: [{ input: video, consumes: 0 }] })).toBe(
      "Stage 1 reads no earlier stage.",
    );
    expect(
      shape({
        stages: [{ input: video }, { input: { ...upscale, sourceId: "own" } }],
      }),
    ).toBe("Stage 2: It reads stage 1, so it takes no source of its own.");
    // An image is not a video to upscale.
    const image = { generator: "image", description: "A vessel." };
    expect(shape({ stages: [{ input: image }, { input: upscale }] })).toBe(
      "Stage 2 reads video output; stage 1 makes image output.",
    );
    // References would be stored until approval, so chains refuse them.
    expect(
      chainShapeError([
        { input: { ...fitted(video), imageReferences: ["sha"] } },
      ]),
    ).toMatch(/cannot hold image references/);
    expect(shape({ stages: [{ input: video }], target: "4:5" })).toMatch(
      /phone, social, 1080p, big-screen/,
    );
  });

  it("starts from an uploaded source: stage 1 may be an upscale with its own", () => {
    const { stages } = validateChain({
      stages: [{ input: { ...upscale, sourceId: "upload-1" } }],
    });
    expect(stages[0].input.sourceId).toBe("upload-1");
  });
});

describe("chain status", () => {
  const chain = record([
    { input: fitted(video), quoteId: "q1" },
    { input: fitted({ ...upscale, sourceId: "x" }), consumes: 0 },
  ]);

  it("pauses at the first stage nothing has run, and waits behind it", () => {
    expect(stageStatuses(chain, [])).toEqual(["paused", "waiting"]);
    expect(chainStatus(chain, ["paused", "waiting"])).toBe("paused");
    const approved = record([
      {
        ...chain.stages[0],
        approval: {
          quoteId: "q1",
          claimId: "c1",
          at: new Date().toISOString(),
        },
      },
      chain.stages[1],
    ]);
    expect(stageStatuses(approved, [])).toEqual(["submitting", "waiting"]);
    expect(chainStatus(approved, ["submitting", "waiting"])).toBe("running");
    const jobs = [job("a", "Generating")];
    expect(stageStatuses(approved, jobs)).toEqual(["running", "waiting"]);
    const ready = [job("a", "Ready")];
    expect(stageStatuses(approved, ready)).toEqual(["ready", "paused"]);
    expect(chainView(approved, ready).pausedAt).toBe(1);
    const done = [job("a", "Ready"), job("b", "Ready")];
    expect(chainStatus(approved, stageStatuses(approved, done))).toBe(
      "complete",
    );
  });

  it("pauses a lost approval again once its quote can no longer be spent", () => {
    const at = Date.parse("2026-10-21T00:00:00.000Z");
    const claimed = record([
      {
        ...chain.stages[0],
        approval: {
          quoteId: "q1",
          claimId: "c1",
          at: new Date(at).toISOString(),
        },
      },
      chain.stages[1],
    ]);
    // The bound outlasts the quote, so the lost submission cannot reserve.
    expect(APPROVAL_TIMEOUT_MS).toBeGreaterThan(QUOTE_TTL_MS);
    expect(stageStatuses(claimed, [], at + APPROVAL_TIMEOUT_MS)).toEqual([
      "submitting",
      "waiting",
    ]);
    expect(stageStatuses(claimed, [], at + APPROVAL_TIMEOUT_MS + 1)).toEqual([
      "paused",
      "waiting",
    ]);
    // A stage that reserved a run is never paused again, however old.
    const late = at + 10 * APPROVAL_TIMEOUT_MS;
    expect(stageStatuses(claimed, [job("a", "Error")], late)[0]).toBe("failed");
    expect(stageStatuses(claimed, [job("a", "submitting")], late)[0]).toBe(
      "running",
    );
    const cancelled = { ...claimed, cancelledAt: claimed.createdAt };
    expect(stageStatuses(cancelled, [], late)[0]).toBe("cancelled");
  });

  it("fails on any other ending and never moves past it", () => {
    for (const status of ["Error", "expired", "Content Moderated"] as const) {
      const statuses = stageStatuses(chain, [job("a", status)]);
      expect(statuses).toEqual(["failed", "waiting"]);
      expect(chainStatus(chain, statuses)).toBe("failed");
    }
  });

  it("cancels the stages nothing ran", () => {
    const cancelled = { ...chain, cancelledAt: chain.createdAt };
    const statuses = stageStatuses(cancelled, [job("a", "Ready")]);
    expect(statuses).toEqual(["ready", "cancelled"]);
    expect(chainStatus(cancelled, statuses)).toBe("cancelled");
    expect(chainView(cancelled, [job("a", "Ready")])).not.toHaveProperty(
      "pausedAt",
    );
  });

  it("feeds a consuming stage the asset of the take it reads", () => {
    expect(() => stageInput(chain, 1, [job("a", "Generating")])).toThrow();
    expect(stageInput(chain, 1, [job("a", "Ready")]).sourceId).toBe("a");
    expect(stageInput(chain, 0, [])).toBe(chain.stages[0].input);
  });

  it("shows no approval bookkeeping", () => {
    const view = chainView(chain, []);
    expect(JSON.stringify(view)).not.toContain("quoteId");
    expect(view.stages[0]).not.toHaveProperty("jobId");
  });
});

describe("output targets", () => {
  const base = fitted(video);

  it("shapes phone, social and 1080p at 1080p on FLUX 3 with no upscale", () => {
    expect(resolveTarget("phone", fluxVideoControls, base)).toMatchObject({
      value: { aspectRatio: "9:16", resolution: "fhd" },
      upscaleFactor: null,
      shortEdge: 1080,
    });
    expect(
      resolveTarget("social", fluxVideoControls, base).value,
    ).toMatchObject({ aspectRatio: "1:1", resolution: "fhd" });
    expect(resolveTarget("1080p", fluxVideoControls, base).value).toMatchObject(
      { aspectRatio: "16:9", resolution: "fhd" },
    );
  });

  it("fits a ratio the entry cannot take the way fitControls does", () => {
    // LTX takes 16:9 and 9:16, so square falls to the landscape frame.
    const ltxBase = fitted(ltx);
    expect(
      resolveTarget("social", ltxVideoControls, ltxBase).value,
    ).toMatchObject({ aspectRatio: "16:9", resolution: "fhd" });
    expect(
      resolveTarget("phone", ltxVideoControls, ltxBase).value.aspectRatio,
    ).toBe("9:16");
    // Native Acoustic Space also supports portrait.
    expect(
      resolveTarget("phone", ltxAcousticControls, ltxBase).value.aspectRatio,
    ).toBe("9:16");
    expect(() => resolveTarget("phone", upscaleControls, base)).toThrow();
  });

  it("sizes Acoustic Space's big screen from the frame the workflow makes", () => {
    const acoustic = fitted({
      ...ltx,
      model: "ltx-2.5-akuspace",
      acoustic: ACOUSTIC,
    });
    // Native QHD now uses its aligned frame without the old megapixel cap.
    const frame = effectiveFrame(ltxAcousticControls, "qhd");
    expect(frame).toEqual({ width: 2560, height: 1472 });
    expect(effectiveFrame(ltxVideoControls, "qhd")).toEqual({
      width: 2560,
      height: 1440,
    });
    // The aligned QHD frame reaches the ceiling at 2×.
    expect(estimateUpscaleOutput(frame, 2).capped).toBe(true);
    expect(estimateUpscaleOutput(frame, 3).capped).toBe(true);
    const resolved = resolveTarget("big-screen", ltxAcousticControls, acoustic);
    expect(resolved.value).toMatchObject({
      resolution: "qhd",
      aspectRatio: "16:9",
    });
    expect(resolved.upscaleFactor).toBe(2);
    // LTX-2.5 Fast makes the full QHD frame, where 2× already reaches it.
    expect(
      resolveTarget("big-screen", ltxVideoControls, fitted(ltx)).upscaleFactor,
    ).toBe(2);
    // Through the validator too.
    const chain = validateChain({
      stages: [
        { input: { ...ltx, model: "ltx-2.5-akuspace", acoustic: ACOUSTIC } },
      ],
      target: "big-screen",
    });
    expect(chain.stages[1].input.upscaleFactor).toBe(2);
  });

  it("upscales a draft, which runs at HD, up to the target", () => {
    const draft = fitted({ ...video, draft: true });
    expect(resolveTarget("1080p", fluxVideoControls, draft)).toMatchObject({
      value: { resolution: "hd", draft: true },
      upscaleFactor: 1.5,
      shortEdge: 1080,
    });
    expect(resolveTarget("big-screen", fluxVideoControls, draft)).toMatchObject(
      { upscaleFactor: 3, shortEdge: 2160 },
    );
  });

  it("finishes big screen at the upscaler's largest input and output", () => {
    const resolved = resolveTarget("big-screen", fluxVideoControls, base);
    expect(resolved.value).toMatchObject({
      aspectRatio: "16:9",
      resolution: "qhd",
    });
    // QHD is the largest frame the upscaler accepts as input.
    expect(() =>
      checkUpscaleLimits({ width: 2560, height: 1440, duration: 20 }, 1),
    ).not.toThrow();
    expect(() =>
      checkUpscaleLimits({ width: 3840, height: 2160, duration: 20 }, 1),
    ).toThrow();
    // 2× already reaches BFL's output ceiling, so it costs what 3× would.
    expect(resolved.upscaleFactor).toBe(2);
    expect(resolved.shortEdge).toBe(2847);
  });

  it("is applied by the validator: the shaped stage passes validateInput unchanged", () => {
    for (const target of OUTPUT_TARGETS) {
      const { stages } = validateChain({ stages: [{ input: video }], target });
      expect(validateInput(stages[0].input)).toEqual(stages[0].input);
    }
    const phone = validateChain({
      stages: [{ input: video }],
      target: "phone",
    });
    expect(phone.stages).toHaveLength(1);
    expect(phone.target).toBe("phone");
    // Big screen appends the upscale that reads the shaped stage.
    const big = validateChain({
      stages: [{ input: video }],
      target: "big-screen",
    });
    expect(big.stages).toHaveLength(2);
    expect(big.stages[1]).toMatchObject({
      consumes: 0,
      input: { generator: "upscale", upscaleFactor: 2, upscaleCreativity: 0 },
    });
    // A drafted phone stage runs at HD, so the validator adds a 1.5× upscale.
    const drafted = validateChain({
      stages: [{ input: { ...video, draft: true } }],
      target: "phone",
    });
    expect(drafted.stages[0].input).toMatchObject({
      aspectRatio: "9:16",
      resolution: "hd",
      draft: true,
    });
    expect(drafted.stages[1].input.upscaleFactor).toBe(1.5);
    // An upscale the person added gets the target's amount instead.
    const own = validateChain({
      stages: [{ input: video }, { input: { ...upscale, upscaleFactor: 3 } }],
      target: "big-screen",
    });
    expect(own.stages).toHaveLength(2);
    expect(own.stages[1].input.upscaleFactor).toBe(2);
  });

  it("refuses stages that would change a target's frame", () => {
    expect(
      shape({
        stages: [{ input: video }, { input: upscale }],
        target: "1080p",
      }),
    ).toBe(
      "The 1080p target is reached by stage 1; remove the stages after it.",
    );
    expect(
      shape({
        stages: [{ input: { ...upscale, sourceId: "upload-1" } }],
        target: "phone",
      }),
    ).toBe("An output target shapes a video stage; add one.");
    expect(
      shape({
        stages: [{ input: video }, { input: upscale }, { input: upscale }],
        target: "big-screen",
      }),
    ).toBe("The big-screen target finishes on one upscale of stage 1.");
  });
});
