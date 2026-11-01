import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  entriesFor,
  entryFor,
  entryLabel,
  menuId,
  readyEntry,
  registry,
  runOptions,
  selectionFor,
} from "../shared/registry";
import { fitControls, kleinOpenControls } from "../shared/controls";
import { composePrompt } from "../shared/presets";
import { estimateImageUsd, KLEIN_PRICE_USD } from "../shared/image";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import { imagePrompt } from "../src/image-regions";
import ImageControls from "../src/components/ImageControls";
import GenerateAction from "../src/components/GenerateAction";
import ComposerActions from "../src/components/ComposerActions";
import ModeBadge from "../src/components/ModeBadge";
import CameraDialog from "../src/components/CameraDialog";
import { cameraClauses, defaultCamera } from "../shared/camera";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import { generatorFoot, modelSignature } from "../src/generators";
import { validateInput } from "../server/validation";
import type { Job } from "../shared/types";

const video = (patch: Partial<ComposerState> = {}): ComposerState => ({
  ...initialComposer,
  generator: "video",
  model: "flux-3",
  description: "A lighthouse at dusk.",
  openOnly: false,
  ...patch,
});
const update = (from: ComposerState, patch: Partial<ComposerState>) =>
  composerReducer(from, { type: "update", patch });
const klein = (patch: Partial<ComposerState> = {}) =>
  update(video(patch), selectionFor("flux-3-klein")!);

describe("FLUX 3 Image Klein in the registry", () => {
  it("is the first image row, open, with an open and an API run", () => {
    const open = readyEntry("flux-3-klein")!;
    const api = readyEntry("flux-3-klein-api")!;
    expect(open).toMatchObject({
      family: "flux",
      generator: "image",
      route: "workflow",
      model: "workflow/flux-3-klein-t2i",
      camera: "flux-3",
      open: true,
    });
    expect(api).toMatchObject({
      generator: "image",
      route: "bfl",
      model: "flux-3-image-klein",
      runOf: "flux-3-klein",
      open: true,
    });
    const images = entriesFor("flux").filter(
      (e) => e.status === "ready" && e.generator === "image",
    );
    expect(images[0].id).toBe("flux-3-klein");
    expect(entriesFor("flux").map((e) => e.id)).not.toContain(api.id);
    // Agents still see both runs: the MCP model list reads the whole registry.
    expect(registry.map((e) => e.id)).toContain(api.id);
    expect(menuId(api)).toBe("flux-3-klein");
    expect(runOptions(api)).toMatchObject({ held: "api" });
    expect(runOptions(open)).toMatchObject({ held: "open" });
    expect(runOptions(readyEntry("flux-3-image")!)).toBeNull();
  });

  it("resolves a pair no entry makes to the generator's FLUX 3 entry", () => {
    expect(entryFor("video", "flux-3-klein").id).toBe("flux-3-video");
    expect(entryFor("edit", "flux-3-klein").id).toBe("flux-3-klein");
    expect(entryFor("image", "flux-3-klein-api").id).toBe("flux-3-klein-api");
  });
});

describe("switching between video and Klein", () => {
  it("keeps the camera, drops motion and fits the still's controls", () => {
    const from = video({
      cameraEnabled: true,
      imageAspectRatio: "auto",
      imageResolution: "4k",
      imageGrounding: true,
      duration: 12,
      draft: true,
    });
    const held = update(from, selectionFor("flux-3-klein")!);
    expect(held).toMatchObject({
      generator: "image",
      model: "flux-3-klein",
      cameraEnabled: true,
      // The open graph is sized by the studio, so auto becomes a named ratio.
      imageAspectRatio: "auto",
      imageResolution: "4k",
      imageGrounding: false,
    });
    // The video values wait for the next video run, untouched.
    expect(held).toMatchObject({ duration: 12, draft: true });
    // Back on FLUX 3 Image, a Klein-only tier falls to 1k.
    const flux = update(
      update(held, { imageResolution: "1.5k" }),
      selectionFor("flux-3-image")!,
    );
    expect(flux.imageResolution).toBe("1k");
    // Applying the fit twice changes nothing.
    expect(fitControls(kleinOpenControls, held)).toBe(held);
  });

  it("moves between the open and API runs with the Run control", () => {
    const held = klein({ imageReferences: ["ref"] });
    const html = renderToStaticMarkup(
      <ImageControls state={held} update={() => {}} />,
    );
    expect(html).not.toContain('id="image-run-label"');
    const action = renderToStaticMarkup(
      <GenerateAction
        state={held}
        jobs={[]}
        submitting={false}
        hasKey
        recreating={false}
        disabled={false}
        onSubmit={() => {}}
        onResume={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(action).toContain('aria-label="Generation provider"');
    expect(action).toContain("BFL API");
    expect(action).toContain("Comfy workflow");
    expect(html).toContain('id="camera-label"');
    expect(html).not.toContain("Web grounding");
    // Both runs now receive the source and references.
    expect(composerInput(held).imageReferences).toEqual(["ref"]);
    const api = update(held, { model: "flux-3-klein-api" });
    expect(composerInput(api).imageReferences).toEqual(["ref"]);
    const flux = renderToStaticMarkup(
      <ImageControls
        state={update(held, selectionFor("flux-3-image")!)}
        update={() => {}}
      />,
    );
    expect(flux).toContain("Web grounding");
    expect(flux).not.toContain("image-run-label");
    expect(flux).toContain("camera-label");
  });

  it("names Klein in the badge, the foot, the gallery and the menu", () => {
    expect(
      renderToStaticMarkup(
        <ModeBadge generator="image" model="flux-3-klein" />,
      ),
    ).toContain("FLUX 3 Image Klein · Image");
    expect(generatorFoot("image", "Precise", "flux-3-klein")).toBe(
      "FLUX 3 Image Klein · Image · open workflow · open weights",
    );
    expect(generatorFoot("image", "Precise", "flux-3-klein-api")).toBe(
      "FLUX 3 Image Klein · Image · API · paid API · open weights",
    );
    expect(generatorFoot("image", "Precise")).toBe("FLUX 3 · Image · paid API");
    expect(
      modelSignature({ generator: "image", model: "flux-3-klein" }),
    ).toEqual({ tag: "KLEIN", title: entryLabel(readyEntry("flux-3-klein")!) });
    const menu = renderToStaticMarkup(
      <FamilyModelSelector
        generator="image"
        model="flux-3-klein-api"
        openOnly={false}
        onChoose={() => {}}
        onOpenOnlyChange={() => {}}
      />,
    );
    expect(menu).toContain("Change model: FLUX 3 Image Klein · Image · API");
    expect(
      renderToStaticMarkup(
        <ComposerActions
          generator="image"
          model="flux-3-klein"
          onOpenCamera={() => {}}
          onOpenAcoustic={() => {}}
        />,
      ),
    ).toContain("Camera controls");
    expect(
      renderToStaticMarkup(
        <ComposerActions
          generator="image"
          model="flux-3"
          onOpenCamera={() => {}}
          onOpenAcoustic={() => {}}
        />,
      ),
    ).toContain("Camera controls");
  });

  it("moves a closed still to open Klein when Open only is switched on", () => {
    const flux = update(video(), selectionFor("flux-3-image")!);
    expect(update(flux, { openOnly: true })).toMatchObject({
      generator: "image",
      model: "flux-3-klein",
      openOnly: true,
    });
  });

  it("keeps Movements for FLUX 3 video and hides it for a still", () => {
    // The panel reads its layout from the page URL.
    vi.stubGlobal("location", new URL("http://127.0.0.1/"));
    const dialog = (still: boolean) =>
      renderToStaticMarkup(
        <CameraDialog
          model="flux-3"
          still={still}
          selected={defaultCamera}
          edits={{}}
          onApply={() => {}}
          onClose={() => {}}
        />,
      );
    // FLUX 3 makes stills too, so the model alone must not decide.
    const video = dialog(false);
    expect(video).toContain('aria-label="Movements: Orbit"');
    expect(video).toContain("Choose any combination");
    const still = dialog(true);
    expect(still).not.toContain("Movements:");
    expect(still).toContain("A still keeps shot size and angle");
    vi.unstubAllGlobals();
  });

  it("restores a saved Klein run's own wording, not another run's phrase", () => {
    const camera = {
      "shot-sizes": "close-up",
      angles: null,
      movements: null,
    } as const;
    const saved = {
      ...validateInput(composerInput(klein({ camera }))),
      id: "saved",
    } as Job;
    // The composer holds a custom phrase for the same term from another run.
    const edited = klein({
      camera,
      cameraEdits: { "close-up": "An extreme macro of the lens itself." },
    });
    const restored = composerReducer(edited, { type: "restore", job: saved });
    const [clause] = cameraClauses(camera, {}, "flux-3-klein");
    expect(restored.cameraEdits["close-up"]).toBe(clause.text);
    expect(composePrompt(composerInput(restored))).not.toContain(
      "extreme macro",
    );
  });

  it("restores a Klein run as Klein, with its framing", () => {
    const input = composerInput(
      klein({
        camera: { "shot-sizes": "close-up", angles: null, movements: "orbit" },
      }),
    );
    const job = { ...validateInput(input), id: "j" } as Job;
    const restored = composerReducer(video(), { type: "restore", job });
    expect(restored).toMatchObject({
      generator: "image",
      model: "flux-3-klein",
      cameraEnabled: true,
    });
    expect(restored.camera["shot-sizes"]).toBe("close-up");
  });
});

describe("a Klein still's prompt", () => {
  const camera = {
    "shot-sizes": "close-up",
    angles: "low-angle",
    movements: "orbit",
  } as const;

  it("keeps shot size and angle, drops movement, and keeps the rows last", () => {
    const description = imagePrompt(
      "A lighthouse at dusk.",
      [
        {
          id: "lamp_1",
          box: [0, 400, 200, 600],
          action: "change",
          description: "a lamp",
        },
      ],
      false,
    );
    const input = validateInput(
      composerInput(klein({ camera, description: "A lighthouse at dusk." })),
    );
    expect(input.camera?.movements).toBeNull();
    const prompt = composePrompt({ ...input, description });
    const [caption, rows] = [
      prompt.slice(0, prompt.indexOf(" [{")),
      prompt.slice(prompt.indexOf(" [{") + 1),
    ];
    expect(caption).toContain("Close-up of the subject.");
    expect(caption).toMatch(/low/i);
    expect(prompt).not.toMatch(/orbit/i);
    expect(JSON.parse(rows)).toEqual([
      { id: "lamp_1", bbox: [0, 400, 200, 600], desc: "a lamp" },
    ]);
    // Camera off sends the description as is. FLUX Image keeps framing too.
    expect(composePrompt({ ...input, cameraEnabled: false, description })).toBe(
      description,
    );
    const flux = validateInput({
      ...composerInput(klein({ camera })),
      model: "flux-3",
    });
    expect(flux.cameraEnabled).toBe(true);
    expect(flux.camera?.movements).toBeNull();
  });

  it("prices each Klein tier at BFL's rate", () => {
    for (const [tier, usd] of Object.entries(KLEIN_PRICE_USD))
      expect(
        estimateImageUsd({
          model: "flux-3-klein",
          imageResolution: tier as never,
        }),
      ).toBe(usd);
    expect(estimateImageUsd({ model: "flux-3", imageResolution: "1k" })).toBe(
      0.048,
    );
  });
});

describe("a Klein request", () => {
  const base = {
    generator: "image",
    model: "flux-3-klein",
    description: "A lighthouse.",
    imageAspectRatio: "16:9",
  };
  it("takes Klein's tiers and ratios, and nothing FLUX 3 alone takes", () => {
    expect(validateInput({ ...base, imageResolution: "1.5k" })).toMatchObject({
      model: "flux-3-klein",
      imageResolution: "1.5k",
      imageGrounding: false,
    });
    expect(() =>
      validateInput({ ...base, model: "flux-3", imageResolution: "1.5k" }),
    ).toThrow();
    expect(() => validateInput({ ...base, imageGrounding: true })).toThrow(
      "supported image settings",
    );
    // The open graph needs a named ratio; the API takes auto.
    expect(
      validateInput({ ...base, imageAspectRatio: "auto" }).imageAspectRatio,
    ).toBe("auto");
    expect(
      validateInput({
        ...base,
        model: "flux-3-klein-api",
        imageAspectRatio: "auto",
      }).imageAspectRatio,
    ).toBe("auto");
    expect(
      validateInput({ ...base, imageAspectRatio: undefined }),
    ).toMatchObject({ imageAspectRatio: "auto" });
  });
  it("refuses invalid reference bytes, source-less edits and unknown models", () => {
    expect(() =>
      validateInput({
        ...base,
        imageReferences: ["data:image/png;base64,AAAA"],
      }),
    ).toThrow("Use a PNG, JPEG, or WebP");
    expect(() => validateInput({ ...base, generator: "edit" })).toThrow(
      "Edits need a source image",
    );
    expect(() => validateInput({ ...base, model: "ltx-2.5" })).toThrow(
      "FLUX 3 Image Klein",
    );
    expect(() => validateInput({ ...base, model: 7 })).toThrow();
  });
});
