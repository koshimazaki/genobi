import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cameraClauses,
  cameraGuide,
  cameraLabel,
  cameraSections,
  emptyCamera,
  guideSectionUrl,
  termExample,
  termName,
  termsFor,
  H3_GUIDE_URL,
  type CameraSelection,
} from "../shared/camera";
import { H3_CAMERA_MODELS, h3Sentence } from "../shared/camera-h3";
import { fitCamera } from "../shared/camera-fit";
import { describeCameraPath } from "../shared/camera-path-terms";
import { validateCameraPath } from "../shared/camera-path";
import { joinSegments, ltxSegments } from "../shared/ltx-prompt";
import { composePrompt } from "../shared/presets";
import { readyEntry } from "../shared/registry";
import type { VideoModel } from "../shared/types";
import { validateInput } from "../server/validation";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import { ltxState } from "../src/ltx-composer";

// Box 2.6: every H3 entry speaks MiniMax's prompt guide (base guide 4.1 and
// 4.3, docs/minimax-h3-camera.md), in H3's names, sentences and order.
const section = (id: string) => cameraSections.find((s) => s.id === id)!;
const ids = (id: string, model: VideoModel) =>
  termsFor(section(id), model).map((t) => t.id);
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const picked: CameraSelection = {
  "shot-sizes": "close-up",
  angles: "low-angle",
  movements: "dolly-in",
};

describe("the H3 camera panel", () => {
  it("is every H3 entry's, and only theirs", () => {
    expect([...H3_CAMERA_MODELS].sort()).toEqual(
      [
        "minimax-h3",
        "minimax-h3-canny",
        "minimax-h3-combined",
        "minimax-h3-depth",
        "minimax-h3-router",
      ].sort(),
    );
    for (const model of H3_CAMERA_MODELS) {
      const entry = readyEntry(model)!;
      expect(entry.camera, model).toBe("minimax-h3");
      expect(entry.controls.kind === "video" && entry.controls.camera).toBe(
        true,
      );
    }
    expect(readyEntry("openjutsu-swap")!.camera).toBeNull();
  });

  it("shows LTX's narrowed framing without Profile, and the moves in the guide's order", () => {
    for (const model of H3_CAMERA_MODELS) {
      expect(ids("shot-sizes", model)).toEqual([
        "extreme-close-up",
        "close-up",
        "medium",
        "full",
        "wide",
        "establishing",
      ]);
      expect(ids("angles", model)).toEqual([
        "eye-level",
        "low-angle",
        "high-angle",
        "birds-eye",
      ]);
      // Push/Pull, Pan, Truck, Tilt, Pedestal, Arc, Tracking, Static, Shake.
      expect(
        termsFor(section("movements"), model).map((t) => termName(t, model)),
      ).toEqual([
        "Push in",
        "Pull out",
        "Pan left",
        "Pan right",
        "Truck left",
        "Truck right",
        "Tilt up",
        "Pedestal up",
        "Pedestal down",
        "Arc shot",
        "Tracking shot",
        "Static shot",
        "Shake slightly",
      ]);
    }
    // Orbit, the undirected Pan and Trucking, and Lazy Susan stay out.
    for (const hidden of ["orbit", "pan", "trucking", "lazy-susan"])
      expect(ids("movements", "minimax-h3-router")).not.toContain(hidden);
    // The directed pans are H3's alone.
    for (const model of ["flux-3", "ltx-2.5"] as const) {
      expect(ids("movements", model)).not.toContain("pan-left");
      expect(ids("movements", model)).toContain("pan");
    }
  });

  it("writes each sentence as plain English: no brackets, modifiers or line breaks", () => {
    for (const s of cameraSections)
      for (const term of termsFor(s, "minimax-h3-router")) {
        const text = h3Sentence(term.id)!;
        expect(text).toMatch(/^[A-Z][^\n[\]]+\.$/);
        expect(text).not.toMatch(/amplitude|speed|slow|fast/);
      }
  });

  it("links each section to its section of MiniMax's pinned guide", () => {
    expect(H3_GUIDE_URL).toContain("42ed227ee7df40d41602854ae760620d6eb651fe");
    const guide = cameraGuide("minimax-h3-depth");
    expect(guide.url).toBe(H3_GUIDE_URL);
    expect(guide.note).toMatch(/MiniMax/);
    expect(guideSectionUrl(section("movements"), "minimax-h3")).toBe(
      `${H3_GUIDE_URL}#43-camera-motion-motion-type--amplitude--speed`,
    );
    expect(guideSectionUrl(section("shot-sizes"), "minimax-h3")).toBe(
      `${H3_GUIDE_URL}#41-develop-the-multimodal-description-along-the-timeline`,
    );
    // The other guides keep their links.
    expect(guideSectionUrl(section("movements"), "flux-3")).toMatch(
      /#camera-movements$/,
    );
    expect(guideSectionUrl(section("movements"), "ltx-2.5")).not.toContain("#");
  });

  it("names and exemplifies in H3's order", () => {
    expect(cameraLabel(picked, "minimax-h3-router")).toBe(
      "Close-up · Low angle · Push in",
    );
    const dolly = termsFor(section("movements"), "minimax-h3")[0];
    const close = termsFor(section("shot-sizes"), "minimax-h3")[1];
    expect(termExample(dolly, "minimax-h3")).toMatch(
      /gallery\. The camera pushes in toward the subject\.$/,
    );
    expect(termExample(close, "minimax-h3")).toMatch(
      /^A close-up frames the upper part of the subject\. A chrome chair/,
    );
  });
});

describe("the H3 prompt", () => {
  const request = (model: VideoModel, camera = picked) => ({
    generator: "video" as const,
    model,
    description: "A ninja crouches on a rooftop.",
    cameraEnabled: true,
    camera,
    cameraEdits: {},
  });

  it("opens with the composition, then the text, then the move, for every H3 entry", () => {
    for (const model of H3_CAMERA_MODELS)
      expect(composePrompt(request(model))).toBe(
        "A close-up frames the upper part of the subject. The camera looks up at the subject from a low angle. A ninja crouches on a rooftop. The camera pushes in toward the subject.",
      );
    expect(
      composePrompt(
        request("minimax-h3", { ...emptyCamera, movements: "static" }),
      ),
    ).toBe(
      "A ninja crouches on a rooftop. The camera holds a static shot on the subject.",
    );
    expect(
      composePrompt({ ...request("minimax-h3"), cameraEnabled: false }),
    ).toBe("A ninja crouches on a rooftop.");
  });

  it("never sends a term the H3 panel hides, nor a legacy preset", () => {
    const hidden: CameraSelection = {
      "shot-sizes": "macro",
      angles: "profile",
      movements: "orbit",
    };
    expect(composePrompt(request("minimax-h3-router", hidden))).toBe(
      "A ninja crouches on a rooftop.",
    );
    expect(
      composePrompt({
        ...request("minimax-h3-router"),
        camera: undefined,
        presetId: "orbit_l",
      }),
    ).toBe("A ninja crouches on a rooftop.");
  });

  it("follows the chosen model for another model's default, and keeps a person's edit", () => {
    const flux = cameraClauses(picked, {}, "flux-3")[2].text;
    expect(
      cameraClauses(picked, { "dolly-in": flux }, "minimax-h3")[2].text,
    ).toBe("The camera pushes in toward the subject.");
    expect(
      cameraClauses(
        picked,
        { "dolly-in": "The camera creeps in." },
        "minimax-h3",
      )[2].text,
    ).toBe("The camera creeps in.");
    // H3's own default is not an edit on LTX either.
    expect(
      cameraClauses(
        picked,
        { "dolly-in": h3Sentence("dolly-in") },
        "ltx-2.5",
      )[2].text,
    ).toMatch(/At the end the subject fills the frame\.$/);
  });

  it("previews exactly the prompt the request sends", () => {
    const state = {
      ...initialComposer,
      generator: "video" as const,
      model: "minimax-h3-router" as const,
      description: "A ninja crouches on a rooftop.",
      cameraEnabled: true,
      camera: picked,
    };
    const preview = joinSegments(ltxSegments(ltxState(state)));
    expect(preview).toBe(composePrompt(composerInput(state)));
    expect(ltxSegments(ltxState(state)).map((s) => s.part)).toEqual([
      "shot",
      "angle",
      "main",
      "movement",
    ]);
  });

  it("drops the terms H3 leaves out when the composer switches to it", () => {
    let state = composerReducer(initialComposer, {
      type: "update",
      patch: { generator: "video", model: "flux-3" },
    });
    state = composerReducer(state, {
      type: "update",
      patch: {
        camera: { "shot-sizes": "close-up", angles: "dutch", movements: "pan" },
      },
    });
    state = composerReducer(state, {
      type: "update",
      patch: { model: "minimax-h3-router" },
    });
    expect(state.camera).toEqual({
      "shot-sizes": "close-up",
      angles: null,
      movements: null,
    });
    const kept = { ...emptyCamera, movements: "dolly-left" as const };
    expect(fitCamera(kept, "minimax-h3")).toBe(kept);
  });
});

describe("both adapters' validation", () => {
  it("keeps the camera on for every H3 entry", () => {
    for (const model of H3_CAMERA_MODELS) {
      const omni = model !== "minimax-h3-router";
      const valid = validateInput({
        generator: "video",
        model,
        description: "A ninja crouches on a rooftop.",
        camera: picked,
        cameraEnabled: true,
        draft: false,
        duration: omni ? 5 : 8,
        resolution: "hd",
        aspectRatio: "16:9",
        upscaleFactor: 2,
        imageReferences: [ref, ref],
        ...(omni ? { sourceId: "guide" } : {}),
      });
      expect(valid, model).toMatchObject({
        cameraEnabled: true,
        camera: picked,
      });
      expect(composePrompt(valid)).toMatch(
        /^A close-up .* pushes in toward the subject\.$/,
      );
    }
  });
});

describe("a camera path on H3", () => {
  it("names the pan's direction, where FLUX and LTX keep Pan", () => {
    const key = (target: [number, number, number], t: number) => ({
      t,
      position: [0, 1, 10] as [number, number, number],
      target,
      fov: 50,
    });
    const right = validateCameraPath({
      version: 1,
      duration: 4,
      keys: [key([0, 1, 0], 0), key([4, 1, 0], 1)],
    });
    const left = validateCameraPath({
      version: 1,
      duration: 4,
      keys: [key([0, 1, 0], 0), key([-4, 1, 0], 1)],
    });
    expect(describeCameraPath(right, { model: "minimax-h3" }).movements).toBe(
      "pan-right",
    );
    expect(describeCameraPath(left, { model: "minimax-h3" }).movements).toBe(
      "pan-left",
    );
    expect(describeCameraPath(right).movements).toBe("pan");
    expect(describeCameraPath(left, { model: "ltx-2.5" }).movements).toBe(
      "pan",
    );
  });
});
