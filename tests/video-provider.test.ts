import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validateInput } from "../server/validation";
import { canonicalInput } from "../shared/idempotency";
import { publicGenerationSettings } from "../shared/director/generation-settings";
import { providerPreference, recordedKeyKind } from "../shared/provider";
import { settingsHash } from "../shared/quote";
import { startTake } from "../shared/take";
import type { Generator, Job, VideoModel } from "../shared/types";
import GenerateAction from "../src/components/GenerateAction";
import { runPayer } from "../src/run-mode";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";

const video = {
  ...composerInput({ ...initialComposer, generator: "video", model: "flux-3" }),
  generator: "video",
  model: "flux-3",
  description: "A ceramic vessel.",
};

describe("independent FLUX video provider choice", () => {
  it("validates only the two selectable lanes before any mode-specific early return", () => {
    for (const generator of ["video", "upscale"])
      for (const videoProvider of ["auto", "bfl", "comfy"])
        expect(
          validateInput({
            ...video,
            generator,
            sourceId: "library-01",
            videoProvider,
          }).videoProvider,
        ).toBe(videoProvider);
    for (const videoProvider of [null, true, "router", "", 3])
      expect(() => validateInput({ ...video, videoProvider })).toThrow(
        "provider",
      );
    for (const [generator, model] of [
      ["video", "ltx-2.5"],
      ["video", "flux-3-i2v"],
      ["video", "minimax-h3"],
      ["video", "openjutsu-swap"],
      ["upscale", "seedvr2-upscale"],
      ["image", "flux-3"],
      ["audio", "minimax-music-3"],
    ])
      expect(() =>
        validateInput({ ...video, generator, model, videoProvider: "auto" }),
      ).toThrow("provider");
  });

  it("preserves the legacy fingerprint for omitted/Auto and binds explicit quote choices", async () => {
    const original = validateInput(video);
    expect(canonicalInput({ ...original, videoProvider: "auto" })).toBe(
      canonicalInput(original),
    );
    expect(canonicalInput({ ...original, imageProvider: "comfy" })).toBe(
      canonicalInput(original),
    );
    const legacy = await startTake(original, false);
    expect(
      settingsHash(
        await startTake({ ...original, videoProvider: "auto" }, false),
      ),
    ).toBe(settingsHash(legacy));
    const bfl = settingsHash(
      await startTake({ ...original, videoProvider: "bfl" }, false),
    );
    const comfy = settingsHash(
      await startTake({ ...original, videoProvider: "comfy" }, true),
    );
    expect(bfl).not.toBe(settingsHash(legacy));
    expect(bfl).not.toBe(comfy);
  });

  it("keeps video and image choices separate through composer, payer and restore", () => {
    const state = {
      ...initialComposer,
      model: "flux-3" as const,
      videoProvider: "comfy" as const,
      imageProvider: "bfl" as const,
    };
    expect(providerPreference(state)).toBe("comfy");
    expect(composerInput(state).videoProvider).toBe("comfy");
    expect(
      composerInput({ ...state, model: "ltx-2.5" }).videoProvider,
    ).toBeUndefined();
    expect(
      composerInput({ ...state, generator: "image" }).videoProvider,
    ).toBeUndefined();
    expect(composerInput({ ...state, generator: "image" }).imageProvider).toBe(
      "bfl",
    );
    expect(providerPreference({ ...state, videoProvider: undefined })).toBe(
      "auto",
    );
    expect(
      runPayer("", { comfy: true, bfl: true }, "video", "flux-3", "auto"),
    ).toBe("bfl");
    expect(
      runPayer("", { comfy: true, bfl: true }, "video", "flux-3", "comfy"),
    ).toBe("comfy");
    expect(
      runPayer("bfl-test-key", { comfy: true }, "video", "flux-3", "comfy"),
    ).toBeNull();
    const job = {
      ...composerInput(state),
      id: "video-job",
      prompt: "A vessel.",
    } as Job;
    expect(
      composerReducer(initialComposer, { type: "restore", job }).videoProvider,
    ).toBe("comfy");
    expect(publicGenerationSettings(job)?.videoProvider).toBe("comfy");
    expect(
      composerReducer(state, {
        type: "restore",
        job: { ...job, videoProvider: undefined },
      }).videoProvider,
    ).toBe("auto");
  });

  it("offers the accessible menu only for eligible video modes", () => {
    const render = (generator: Generator, model: VideoModel) =>
      renderToStaticMarkup(
        createElement(GenerateAction, {
          state: { ...initialComposer, generator, model },
          jobs: [],
          submitting: false,
          hasKey: false,
          recreating: false,
          disabled: false,
          onSubmit() {},
          onResume() {},
          onUpdate() {},
        }),
      );
    for (const generator of ["video", "upscale"] as const)
      expect(render(generator, "flux-3")).toContain(
        'aria-label="Generation provider: Auto (BFL preferred)"',
      );
    for (const model of [
      "ltx-2.5",
      "flux-3-i2v",
      "openjutsu-swap",
      "minimax-h3",
    ] as const)
      expect(render("video", model)).not.toContain(
        'aria-label="Generation provider:',
      );
    expect(render("upscale", "seedvr2-upscale")).not.toContain(
      'aria-label="Generation provider:',
    );
  });

  it("uses actual take routes and retains the pre-take polling fallback", () => {
    expect(recordedKeyKind("upscale", "router")).toBe("comfy");
    expect(recordedKeyKind("video", "bfl")).toBe("bfl");
    expect(
      recordedKeyKind(
        "video",
        undefined,
        "https://api.bfl.ai/v1/get_result?id=old",
      ),
    ).toBe("bfl");
    expect(
      recordedKeyKind(
        "video",
        undefined,
        "https://api.comfy.org/router/jobs/old",
      ),
    ).toBe("comfy");
    expect(recordedKeyKind("upscale")).toBe("bfl");
  });
});
