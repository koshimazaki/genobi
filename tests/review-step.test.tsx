import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChainView } from "../shared/chain";
import { estimateUpscaleUsd } from "../shared/presets";
import { estimateRunUsd } from "../shared/quote";
import { takeUpscale } from "../shared/review";
import type { Job, Source } from "../shared/types";
import { validateInput } from "../server/validation";
import { validateChain } from "../server/validate-chain";
import type { ChainEntry } from "../src/chain-state";
import ReviewStep from "../src/components/ReviewStep";
import { fastChain, fastFrame, reviewable, studioUpscale } from "../src/review";
import GenerationControls from "../src/components/GenerationControls";
import { OUTPUT_TARGETS } from "../shared/output-targets";
import { composerInput, initialComposer } from "../src/useComposer";

const hd = { width: 1280, height: 720, duration: 5 };

describe("the review step's output targets for a take that has run", () => {
  it("upscales a 16:9 HD draft to 1080p or the largest frame", () => {
    expect(takeUpscale("1080p", hd)).toMatchObject({
      ok: true,
      factor: 1.5,
      shortEdge: 1080,
    });
    // 3× of HD stays under BFL's 13.75 MP ceiling: 3840 × 2160.
    expect(takeUpscale("big-screen", hd)).toMatchObject({
      ok: true,
      factor: 3,
      shortEdge: 2160,
    });
    // QHD reaches the ceiling at 2×, as the chain's own target does.
    expect(
      takeUpscale("big-screen", { width: 2560, height: 1440, duration: 5 }),
    ).toMatchObject({ ok: true, factor: 2 });
  });

  it("refuses a target the upscaler cannot reach from this frame", () => {
    expect(takeUpscale("phone", hd)).toMatchObject({ ok: false });
    expect(takeUpscale("social", hd)).toMatchObject({ ok: false });
    expect(
      takeUpscale("1080p", { width: 1920, height: 1080, duration: 5 }),
    ).toEqual({ ok: false, reason: "This take already reaches 1080p." });
    expect(
      takeUpscale("phone", { width: 720, height: 1280, duration: 5 }),
    ).toMatchObject({ ok: true, factor: 1.5 });
  });
});

describe("Fast and Studio requests pass the server's own allowlist", () => {
  const input = {
    ...composerInput({ ...initialComposer, draft: true }),
    description: "A chrome motorbike.",
  };

  it("Fast: a drafted run finishes on the target through an upscale stage", () => {
    const { stages, target } = validateChain(fastChain(input, "1080p"));
    expect(target).toBe("1080p");
    expect(stages.map((stage) => stage.input.generator)).toEqual([
      "video",
      "upscale",
    ]);
    expect(stages[1]).toMatchObject({
      consumes: 0,
      input: { upscaleFactor: 1.5 },
    });
  });

  it("Fast: a full-size run reaches 1080p in one stage, so nothing follows", () => {
    const full = { ...input, draft: false, resolution: "hd" as const };
    const { stages } = validateChain(fastChain(full, "1080p"));
    expect(stages).toHaveLength(1);
    expect(stages[0].input.resolution).toBe("fhd");
  });

  it("Studio: the review's upscale reads the take by its asset id", () => {
    const job = {
      ...input,
      id: "take-0001",
      prompt: "A chrome motorbike.",
      status: "Ready",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
      costEstimateUsd: 0.3,
      keyMode: "byo",
    } as Job;
    const source = {
      ...hd,
      id: job.id,
      label: "A chrome motorbike.",
      url: "/api/clips/take-0001",
      origin: "generated",
    } as Source;
    expect(reviewable(job)).toBe(true);
    const body = studioUpscale(job, source, "1080p");
    if ("reason" in body) throw new Error(body.reason);
    const checked = validateInput(body.stages[0].input);
    expect(checked).toMatchObject({
      generator: "upscale",
      sourceId: "take-0001",
      upscaleFactor: 1.5,
      upscaleCreativity: 0,
    });
    expect(studioUpscale(job, source, "phone")).toHaveProperty("reason");
    expect(validateChain(body).stages).toHaveLength(1);
  });
});

describe("Fast's frame follows the Output target", () => {
  it("shows the ratio and size the server will make, on FLUX and LTX", () => {
    for (const composer of [
      { ...initialComposer, draft: false },
      { ...initialComposer, draft: true },
      { ...initialComposer, model: "ltx-2.5" as const, draft: false },
    ])
      for (const target of OUTPUT_TARGETS) {
        const input = {
          ...composerInput(composer),
          description: "A chrome motorbike.",
        };
        const [video] = validateChain(fastChain(input, target)).stages;
        expect(
          fastFrame(target, composer),
          `${composer.model} ${target}`,
        ).toMatchObject({
          aspectRatio: video.input.aspectRatio,
          resolution: video.input.resolution,
        });
      }
    // Social is 1:1 on FLUX; LTX takes 16:9 and 9:16 only.
    expect(fastFrame("social", initialComposer)?.aspectRatio).toBe("1:1");
    expect(
      fastFrame("social", { ...initialComposer, model: "ltx-2.5" })
        ?.aspectRatio,
    ).toBe("16:9");
  });

  it("locks the toolbar's ratio and resolution to it, with the reason", () => {
    const html = (frameLock: ReturnType<typeof fastFrame>) =>
      renderToStaticMarkup(
        <GenerationControls
          generator="video"
          model="flux-3"
          duration={5}
          onDurationChange={() => {}}
          aspectRatio="16:9"
          onAspectRatioChange={() => {}}
          resolution="hd"
          onResolutionChange={() => {}}
          cameraEnabled
          onCameraEnabledChange={() => {}}
          draft={false}
          onDraftChange={() => {}}
          frameLock={frameLock}
        />,
      );
    const locked = html(
      fastFrame("phone", { ...initialComposer, draft: false }),
    );
    expect(locked).toMatch(/<button[^>]*id="aspect-ratio"[^>]*disabled=""/);
    expect(locked).toMatch(/<button[^>]*id="resolution"[^>]*disabled=""/);
    expect(locked).toContain(">9:16<");
    expect(locked).toContain(">Full HD<");
    expect(locked).toContain("Fast makes the frame the Finish at target sets.");
    // Studio: the composer's own frame, free to change.
    const free = html(null);
    expect(free).not.toMatch(/<button[^>]*id="aspect-ratio"[^>]*disabled=""/);
    expect(free).toContain(">16:9<");
  });
});

describe("a short LTX take can be reviewed", () => {
  it("quotes a 3 s take's upscale, priced from the measured clip", () => {
    const short = {
      ...composerInput({ ...initialComposer, model: "ltx-2.5", duration: 3 }),
      description: "A three-second take.",
      id: "take-ltx-03",
      prompt: "A three-second take.",
      status: "Ready",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
      costEstimateUsd: 0.1,
      keyMode: "byo",
    } as Job;
    expect(short.duration).toBe(3);
    const clip = {
      ...hd,
      duration: 3,
      id: short.id,
      label: short.description,
      url: "/api/clips/take-ltx-03",
      origin: "generated",
    } as Source;
    const body = studioUpscale(short, clip, "1080p");
    if ("reason" in body) throw new Error(body.reason);
    const [stage] = validateChain(body).stages;
    expect(stage.input).toMatchObject({
      generator: "upscale",
      sourceId: "take-ltx-03",
      duration: 5,
      upscaleFactor: 1.5,
    });
    // The quote prices the clip's own three seconds, not the placeholder.
    expect(estimateRunUsd(stage.input, clip)).toBe(
      estimateUpscaleUsd(clip, 1.5),
    );
    expect(estimateRunUsd(stage.input, clip)).toBeLessThan(
      estimateUpscaleUsd({ ...clip, duration: 5 }, 1.5),
    );
  });
});

describe("the review step shows the quote before Approve", () => {
  const paused: ChainView = {
    id: "chain-1",
    status: "paused",
    pausedAt: 1,
    createdAt: "",
    updatedAt: "",
    quote: {
      id: "quote-1",
      estimateUsd: 0.45,
      recipe: { id: "flux-video-upscale", version: 1, route: "bfl" },
      expiresAt: "2026-10-21T10:10:00.000Z",
    },
    stages: [
      {
        status: "ready",
        input: { ...composerInput(initialComposer), draft: true },
      },
      {
        status: "paused",
        consumes: 0,
        input: {
          ...composerInput(initialComposer),
          generator: "upscale",
          upscaleFactor: 1.5,
        },
      },
    ],
  };
  const render = (
    entry: ChainEntry,
    now = Date.parse("2026-10-21T10:00:00Z"),
  ) =>
    renderToStaticMarkup(
      <ReviewStep
        entry={entry}
        target="1080p"
        onTarget={() => {}}
        quoting={false}
        quoteError=""
        now={now}
        onQuote={() => {}}
        onApprove={() => {}}
        onCancel={() => {}}
        onRefresh={() => {}}
        onConnectKey={() => {}}
        onClose={() => {}}
      />,
    );

  it("names the recipe, the estimate and the expiry beside Approve", () => {
    const html = render({ chain: paused, origin: "fast" });
    expect(html).toContain("FLUX Video Upscale · $0.45 est.");
    expect(html).toContain("quote expires");
    expect(html).toContain("Approve $0.45");
    expect(html).toContain(
      "Stage 2 of 2 · Upscale 1.5× · waiting for approval",
    );
  });

  it("offers no Approve on an expired quote, a missing key or a refusal's own message", () => {
    const expired = render(
      { chain: paused },
      Date.parse("2026-10-21T10:11:00Z"),
    );
    expect(expired).toContain("quote expired");
    expect(expired).toContain("Refresh quote");
    expect(expired).not.toContain("Approve $");
    const keyless = render({
      chain: { ...paused, quote: undefined },
      needsKey: true,
    });
    expect(keyless).toContain("Connect your key to price this stage.");
    expect(keyless).not.toContain("Approve $");
    const refused = render({
      chain: paused,
      refusal: {
        message: "This quote is not the one.",
        code: "quote_mismatch",
      },
    });
    expect(refused).toContain('role="alert"');
    expect(refused).toContain("This quote is not the one.");
  });
});
