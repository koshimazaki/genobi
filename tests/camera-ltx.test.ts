import { describe, expect, it } from "vitest";
import {
  cameraClauses,
  cameraGuide,
  cameraLabel,
  cameraSections,
  cameraTerms,
  termExample,
  termName,
  termsFor,
  LTX_MODELS,
} from "../shared/camera";
import type { VideoModel } from "../shared/types";
import { composePrompt } from "../shared/presets";
import {
  estimateVideoCredits,
  ltxBody,
  ltxDuration,
  ltxResolution,
} from "../shared/comfy/ltx";
import { canonicalInput } from "../shared/idempotency";

const selection = {
  "shot-sizes": "wide",
  angles: "low-angle",
  movements: "orbit",
} as const;

describe("one camera panel, two wordings", () => {
  it("writes every term for LTX as one present-tense sentence about the subject", () => {
    for (const term of cameraTerms) {
      expect(term.ltx).toMatch(/subject|frame|camera/);
      expect(term.ltx).not.toMatch(/\n/);
    }
  });
  it("picks the wording by model and lets a user edit win over either", () => {
    const flux = cameraClauses(selection, {}, "flux-3").map((c) => c.text);
    const ltx = cameraClauses(selection, {}, "ltx-2.5").map((c) => c.text);
    expect(flux).toEqual([
      "Wide shot with space around the subject.",
      "Low angle looking up at the subject.",
      "Slow orbit around the subject.",
    ]);
    expect(ltx[2]).toBe(
      "The camera circles slowly around the subject. At the end the subject faces the camera from the other side.",
    );
    expect(ltx).not.toEqual(flux);
    const edited = cameraClauses(
      selection,
      { orbit: "My own orbit." },
      "ltx-2.5",
    );
    expect(edited[2].text).toBe("My own orbit.");
    // Default wording restored from another model's run is not an edit.
    const orbit = cameraTerms.find((t) => t.id === "orbit")!;
    expect(
      cameraClauses(selection, { orbit: orbit.clause }, "ltx-2.5")[2].text,
    ).toBe(orbit.ltx);
    expect(cameraClauses(selection)).toEqual(
      cameraClauses(selection, {}, "flux-3"),
    );
  });
  it("gives each model the moves its guide names", () => {
    const movements = cameraSections.find((s) => s.id === "movements")!;
    const forFlux = termsFor(movements, "flux-3").map((t) => t.id);
    const forLtx = termsFor(movements, "ltx-2.5").map((t) => t.id);
    // BFL names Steadicam follow and Handheld; Trucking is split by direction for LTX.
    expect(forFlux).toEqual([
      "orbit",
      "arc",
      "dolly-in",
      "pan",
      "tilt",
      "crane",
      "trucking",
      "lazy-susan",
      "follow",
      "handheld",
    ]);
    // LTX's seven camera presets: dolly in, out, left, right; jib up, down; static.
    expect(forLtx).toEqual(
      expect.arrayContaining([
        "dolly-in",
        "pull-back",
        "dolly-left",
        "dolly-right",
        "crane",
        "jib-down",
        "static",
      ]),
    );
    // BFL-only moves stay off the LTX panel so it offers only what LTX
    // documents; Follow needs a moving subject a scene cannot promise.
    for (const id of ["trucking", "arc", "lazy-susan", "follow"])
      expect(forLtx).not.toContain(id);
    for (const model of LTX_MODELS)
      expect(termsFor(movements, model)).toHaveLength(11);
    // Overlapping or contradicting shot sizes and angles stay with FLUX.
    const ids = (id: string, model: VideoModel) =>
      termsFor(
        cameraSections.find((s) => s.id === id)!,
        model,
      ).map((t) => t.id);
    expect(ids("shot-sizes", "ltx-2.5")).toEqual([
      "extreme-close-up",
      "close-up",
      "medium",
      "full",
      "wide",
      "establishing",
    ]);
    expect(ids("angles", "ltx-2.5")).toEqual([
      "eye-level",
      "low-angle",
      "high-angle",
      "birds-eye",
      "profile",
    ]);
    for (const model of ["flux-3", "flux-3-klein", "flux-3-klein-api"] as const)
      for (const section of cameraSections.filter((s) => s.id !== "movements"))
        expect(termsFor(section, model)).toHaveLength(8);
  });
  it("leaves a term the chosen model does not offer out of the prompt", () => {
    const hidden = {
      "shot-sizes": "macro",
      angles: "dutch",
      movements: "follow",
    } as const;
    expect(cameraClauses(hidden, {}, "ltx-2.5")).toEqual([]);
    expect(
      cameraClauses({ ...hidden, movements: "arc" }, {}, "ltx-2.5"),
    ).toEqual([]);
    // Klein keeps the stills' terms LTX leaves out.
    expect(
      cameraClauses(hidden, {}, "flux-3-klein").map(({ term }) => term.id),
    ).toEqual(["macro", "dutch", "follow"]);
  });
  it("names moves the way the chosen model's guide does", () => {
    const movements = cameraSections.find((s) => s.id === "movements")!;
    const named = (model: VideoModel) =>
      Object.fromEntries(
        termsFor(movements, model).map((t) => [t.id, termName(t, model)]),
      );
    expect(named("ltx-2.5")).toMatchObject({
      orbit: "Circle around",
      "dolly-in": "Dolly in",
      "pull-back": "Dolly out",
      "dolly-left": "Dolly left",
      crane: "Jib up",
      "jib-down": "Jib down",
      pan: "Pan across",
    });
    const angles = cameraSections.find((s) => s.id === "angles")!;
    const birdsEye = angles.terms.find((t) => t.id === "birds-eye")!;
    expect(termName(birdsEye, "ltx-2.5")).toBe("Overhead view");
    expect(termName(birdsEye, "flux-3")).toBe("Bird's eye");
    expect(named("flux-3")).toMatchObject({
      orbit: "Orbit",
      crane: "Crane / boom",
      trucking: "Trucking",
    });
    expect(
      cameraLabel({ ...selection, movements: "crane" }, "ltx-2.5"),
    ).toContain("Jib up");
    expect(cameraGuide("ltx-2.5").name).toBe("LTX guide");
    expect(cameraGuide("flux-3").anchored).toBe(true);
    const crane = movements.terms.find((t) => t.id === "crane")!;
    expect(termExample(crane, "ltx-2.5")).toContain(crane.ltx);
    expect(termExample(crane, "flux-3")).toContain(crane.clause);
  });
  it("composes one flowing paragraph for LTX and separate lines for FLUX", () => {
    const base = {
      generator: "video" as const,
      description: "A log cabin stands in a snowy pine forest at dusk.",
      cameraEnabled: true,
      camera: selection,
      cameraEdits: {},
    };
    expect(composePrompt({ ...base, model: "flux-3" })).toContain("\n\n");
    const ltx = composePrompt({ ...base, model: "ltx-2.5" });
    expect(ltx).not.toContain("\n");
    expect(ltx).toBe(
      "A log cabin stands in a snowy pine forest at dusk. A wide shot gives the subject room in its surroundings. The camera looks up at the subject from a low angle. The camera circles slowly around the subject. At the end the subject faces the camera from the other side.",
    );
  });
});

describe("the LTX request", () => {
  it("snaps duration to the Router list, ties to the shorter clip", () => {
    expect(ltxDuration(5)).toBe(5);
    expect(ltxDuration(7)).toBe(6);
    expect(ltxDuration(9)).toBe(8);
    expect(ltxDuration(20)).toBe(20);
  });
  it("maps aspect and resolution to a Router frame size", () => {
    expect(ltxResolution("16:9", "hd")).toBe("1280x720");
    expect(ltxResolution("9:16", "hd")).toBe("720x1280");
    expect(ltxResolution("21:9", "fhd")).toBe("1920x1080");
    expect(ltxResolution("3:4", "uhd")).toBe("2160x3840");
  });
  it("holds only the fields the schema accepts", () => {
    const body = ltxBody(
      { duration: 5, aspectRatio: "16:9", resolution: "hd" },
      "A log cabin.",
    );
    expect(Object.keys(body).sort()).toEqual([
      "duration",
      "fps",
      "generate_audio",
      "prompt",
      "resolution",
    ]);
    expect(body).toMatchObject({ fps: 25, generate_audio: true });
  });
  it("always asks for audio, whatever an old run recorded", () => {
    const input = {
      duration: 7,
      aspectRatio: "16:9",
      resolution: "hd",
    } as const;
    expect(ltxBody(input, "x").generate_audio).toBe(true);
    // A run recorded while Audio was a switch may still carry the field.
    const recorded = { ...input, audio: false } as typeof input;
    expect(ltxBody(recorded, "x").generate_audio).toBe(true);
  });
  it("estimates credits from the published per-second rates", () => {
    expect(estimateVideoCredits("ltx-2.5", 5, "hd")).toBe(135.8);
    expect(estimateVideoCredits("ltx-2.5-pro", 5, "hd")).toBe(181.05);
    expect(estimateVideoCredits("ltx-2.5", 10, "fhd")).toBe(392.2);
  });
  it("makes the model part of what a replay must match", () => {
    const a = canonicalInput({
      generator: "video",
      description: "x",
      model: "flux-3",
    });
    const b = canonicalInput({
      generator: "video",
      description: "x",
      model: "ltx-2.5",
    });
    const legacy = canonicalInput({ generator: "video", description: "x" });
    expect(a).not.toBe(b);
    expect(legacy).toBe(a);
  });
  it("leaves a recorded audio setting out of the replay", () => {
    const ltx = {
      generator: "video",
      description: "x",
      model: "ltx-2.5",
    } as const;
    // Runs recorded while Audio was a switch carry it; every run now has audio.
    const recorded = (audio: boolean) =>
      canonicalInput({ ...ltx, audio } as typeof ltx);
    expect(recorded(true)).toBe(canonicalInput(ltx));
    expect(recorded(false)).toBe(canonicalInput(ltx));
  });
});
