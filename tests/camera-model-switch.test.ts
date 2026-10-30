import { describe, expect, it } from "vitest";
import { cameraSections, emptyCamera, termsFor } from "../shared/camera";
import { fitCamera } from "../shared/camera-fit";
import { composePrompt } from "../shared/presets";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";

const update = (
  patch: Parameters<typeof composerReducer>[1] extends infer A
    ? A extends { type: "update"; patch: infer P }
      ? P
      : never
    : never,
) => ({ type: "update" as const, patch });

describe("a model switch keeps only the camera terms the new model shows", () => {
  it("drops Macro and Dutch angle when FLUX switches to LTX", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "flux-3" }),
    );
    state = composerReducer(
      state,
      update({
        camera: { "shot-sizes": "macro", angles: "dutch", movements: "pan" },
      }),
    );
    expect(state.camera).toEqual({
      "shot-sizes": "macro",
      angles: "dutch",
      movements: "pan",
    });
    state = composerReducer(state, update({ model: "ltx-2.5" }));
    // The panel, the preview and the request all read this selection.
    expect(state.camera).toEqual({
      "shot-sizes": null,
      angles: null,
      movements: "pan",
    });
    const prompt = composePrompt(composerInput(state));
    expect(prompt).toContain("pans across");
  });
  it("drops an LTX-only move when LTX switches to FLUX", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    state = composerReducer(
      state,
      update({ camera: { ...emptyCamera, movements: "jib-down" } }),
    );
    expect(state.camera.movements).toBe("jib-down");
    state = composerReducer(state, update({ model: "flux-3" }));
    expect(state.camera.movements).toBeNull();
  });
  it("leaves a selection both models show untouched, as the same object", () => {
    const camera = { ...emptyCamera, movements: "pan" as const };
    expect(fitCamera(camera, "ltx-2.5")).toBe(camera);
    expect(fitCamera(camera, "flux-3")).toBe(camera);
  });

  it("keeps a parked LTX movement through a still and back", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    state = composerReducer(
      state,
      update({ camera: { ...emptyCamera, movements: "pull-back" } }),
    );
    state = composerReducer(
      state,
      update({ generator: "image", model: "flux-3-klein" }),
    );
    expect(state.camera.movements).toBe("pull-back");
    state = composerReducer(
      state,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    expect(state.camera.movements).toBe("pull-back");
  });
  it("checks a parked movement when the still returns to a video model without it", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    state = composerReducer(
      state,
      update({ camera: { ...emptyCamera, movements: "pull-back" } }),
    );
    state = composerReducer(
      state,
      update({ generator: "image", model: "flux-3-klein" }),
    );
    state = composerReducer(
      state,
      update({ generator: "video", model: "flux-3" }),
    );
    expect(state.camera.movements).toBeNull();
  });

  it("keeps a parked LTX movement through Upscale and back", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    state = composerReducer(
      state,
      update({ camera: { ...emptyCamera, movements: "pull-back" } }),
    );
    state = composerReducer(
      state,
      update({ generator: "upscale", model: "flux-3" }),
    );
    expect(state.camera.movements).toBe("pull-back");
    state = composerReducer(
      state,
      update({ generator: "video", model: "ltx-2.5" }),
    );
    expect(state.camera.movements).toBe("pull-back");
  });
});

describe("FLUX 3 from a start image", () => {
  // BFL's camera guide names no limit for image-to-video, so the panel
  // offers it every shot size, angle and move FLUX 3 text-to-video has.
  it("shows the same terms as FLUX 3 text-to-video in every section", () => {
    for (const section of cameraSections)
      expect(termsFor(section, "flux-3-i2v").map((t) => t.id)).toEqual(
        termsFor(section, "flux-3").map((t) => t.id),
      );
  });
  it("keeps Macro, Dutch angle and Arc shot when text-to-video switches to it", () => {
    let state = composerReducer(
      initialComposer,
      update({ generator: "video", model: "flux-3" }),
    );
    const camera = {
      "shot-sizes": "macro",
      angles: "dutch",
      movements: "arc",
    } as const;
    state = composerReducer(state, update({ camera }));
    state = composerReducer(state, update({ model: "flux-3-i2v" }));
    expect(state.camera).toEqual(camera);
    const prompt = composePrompt(composerInput(state));
    expect(prompt).toContain("Macro detail");
    expect(prompt).toContain("Arc shot");
  });
});
