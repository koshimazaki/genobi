import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  entriesFor,
  entryFor,
  familiesFor,
  familyDefault,
  readyEntry,
  registry,
  selectionFor,
} from "../shared/registry";
import { fitDuration } from "../shared/controls";
import { LTX_DURATIONS, ltxDuration } from "../shared/comfy/ltx";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import GenerationControls, {
  modelOptions,
} from "../src/components/GenerationControls";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import { SelectOptionRow } from "../src/components/SelectMenu";
import { generatorFoot } from "../src/generators";
import { validateInput } from "../server/validation";
import type { Generator, Job, VideoModel } from "../shared/types";

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
const state = (patch: Partial<ComposerState> = {}): ComposerState => ({
  ...initialComposer,
  generator: "video",
  model: "flux-3",
  description: "A lighthouse at dusk.",
  openOnly: false,
  ...patch,
});
const update = (from: ComposerState, patch: Partial<ComposerState>) =>
  composerReducer(from, { type: "update", patch });

describe("the registry is the menu", () => {
  it("lists each family's entries, and open-only leaves the open ones", () => {
    expect(ids(entriesFor("ltx"))).toEqual([
      "ltx-2-5-fast",
      "ltx-2-5-open",
      "ltx-2-5-akuspace",
      "ltx-2-5-pro",
      "ltx-hdr",
      "ltx-alpha",
    ]);
    // Klein is the first image row; its API run is not a row of its own.
    expect(ids(entriesFor("flux"))).toEqual([
      "flux-3-video",
      "flux-3-i2v",
      "flux-3-klein",
      "flux-3-image",
      "flux-3-edit",
      "flux-3-omni",
    ]);
    // LTX-2.5 Pro is API-only, so Open only leaves Fast and the open coming entries.
    expect(ids(entriesFor("ltx", { openOnly: true }))).toEqual([
      "ltx-2-5-fast",
      "ltx-2-5-open",
      "ltx-2-5-akuspace",
      "ltx-hdr",
      "ltx-alpha",
    ]);
    expect(readyEntry("ltx-2-5-pro")!.open).toBe(false);
    // FLUX 3 Image Klein has open weights, so open-only keeps FLUX for it.
    expect(ids(entriesFor("flux", { openOnly: true }))).toEqual([
      "flux-3-klein",
    ]);
    // Both upscalers sit in their own family, SeedVR2 (open) first; Open
    // only keeps SeedVR2 alone.
    expect(ids(entriesFor("upscale"))).toEqual([
      "seedvr2-upscale",
      "flux-video-upscale",
    ]);
    expect(ids(entriesFor("upscale", { openOnly: true }))).toEqual([
      "seedvr2-upscale",
    ]);
    expect(familyDefault("upscale").id).toBe("seedvr2-upscale");
    // MiniMax Music 3 sits under H3 as one of its generators; the family
    // switch still lands on H3's video entry.
    expect(ids(entriesFor("h3"))).toContain("minimax-music-3");
    expect(familyDefault("h3").generator).toBe("video");
    expect(familyDefault("h3").id).not.toBe("minimax-music-3");
    const all = ["ltx", "flux", "h3", "upscale"];
    expect(familiesFor()).toEqual(all);
    expect(familiesFor({ openOnly: true })).toEqual(all);
  });

  it("holds a ready entry for every selection the composer can make", () => {
    for (const generator of ["video", "upscale"] as Generator[])
      for (const model of ["flux-3", "ltx-2.5", "ltx-2.5-pro"] as VideoModel[])
        expect(entryFor(generator, model).status).toBe("ready");
    expect(entryFor("upscale", "ltx-2.5").id).toBe("flux-video-upscale");
    expect(entryFor("video", "ltx-2.5-pro").id).toBe("ltx-2-5-pro");
  });
});

describe("Open source only", () => {
  it("moves a closed selection to LTX-2.5 Fast when switched on", () => {
    const next = update(state({ generator: "video" }), { openOnly: true });
    expect(next).toMatchObject({
      openOnly: true,
      generator: "video",
      model: "ltx-2.5",
    });
    // FLUX Video Upscale moves to SeedVR2, the open upscaler, not to video.
    expect(
      update(state({ generator: "upscale" }), { openOnly: true }),
    ).toMatchObject({
      openOnly: true,
      generator: "upscale",
      model: "seedvr2-upscale",
    });
    // LTX-2.5 Pro is closed too; an open selection stays where it is.
    expect(
      update(state({ model: "ltx-2.5-pro" }), { openOnly: true }).model,
    ).toBe("ltx-2.5");
    expect(update(state({ model: "ltx-2.5" }), { openOnly: true }).model).toBe(
      "ltx-2.5",
    );
  });

  it("switches itself off when a closed run is chosen another way", () => {
    const open = update(state(), { openOnly: true });
    // A gallery Upscale sets the generator directly.
    expect(update(open, { generator: "upscale" }).openOnly).toBe(false);
    // Recreate restores the run it names, so the toggle cannot read On over it.
    const job = { ...composerInput(state()), id: "j" } as Job;
    expect(composerReducer(open, { type: "restore", job })).toMatchObject({
      openOnly: false,
      model: "flux-3",
    });
    const ltxJob = { ...job, model: "ltx-2.5" } as Job;
    expect(
      composerReducer(open, { type: "restore", job: ltxJob }).openOnly,
    ).toBe(true);
    const proJob = { ...job, model: "ltx-2.5-pro" } as Job;
    expect(
      composerReducer(open, { type: "restore", job: proJob }).openOnly,
    ).toBe(false);
  });

  it("stays out of the request and adds open weights to the foot", () => {
    const input = composerInput(update(state(), { openOnly: true }));
    expect(input).not.toHaveProperty("openOnly");
    expect(validateInput(input).model).toBe("ltx-2.5");
    expect(generatorFoot("video", "Precise", "ltx-2.5")).toBe(
      "LTX-2.5 Fast · native audio · open weights",
    );
    expect(generatorFoot("video", "Precise", "flux-3")).toBe(
      "FLUX 3 · native audio",
    );
    // API-only, so no open-weights claim.
    expect(generatorFoot("video", "Precise", "ltx-2.5-pro")).toBe(
      "LTX-2.5 Pro · native audio",
    );
  });
});

describe("coming entries", () => {
  const coming = registry.filter((e) => e.status === "coming");

  it("carry a note and never produce a selection or a submit", () => {
    expect(ids(coming)).toEqual(["ltx-hdr", "ltx-alpha", "flux-3-omni"]);
    for (const entry of coming) {
      expect(entry.status === "coming" && entry.note).toBeTruthy();
      expect(selectionFor(entry.id)).toBeNull();
    }
    expect(selectionFor("flux-video-upscale")).toEqual({
      generator: "upscale",
      model: "flux-3",
    });
    // An upscale reached from LTX still submits as FLUX, which the server takes.
    const input = composerInput(
      state({ generator: "upscale", model: "ltx-2.5", sourceId: "clip-1" }),
    );
    expect(validateInput(input).model).toBe("flux-3");
  });

  it("render disabled, tagged and titled; ready rows render choosable", () => {
    for (const family of ["ltx", "flux"] as const)
      for (const option of modelOptions(family, false)) {
        const html = renderToStaticMarkup(
          <SelectOptionRow option={option} selected={false} />,
        );
        const entry = registry.find((e) => e.id === option.value)!;
        if (entry.status === "coming") {
          expect(html).toContain('aria-disabled="true"');
          expect(html).toContain(`title="${entry.note}"`);
          expect(html).toContain(">soon<");
        } else if (entry.deploymentOnly) {
          // A deployment entry needs its own endpoint before it can run.
          expect(html).toContain('aria-disabled="true"');
          expect(html).toContain(">setup required<");
          expect(html).not.toContain(">soon<");
        } else {
          expect(html).not.toContain("aria-disabled");
          expect(html).not.toContain("soon");
        }
      }
    // Once a deployment is registered the same row is choosable.
    const deploy = modelOptions("ltx", false, false, undefined, true).find(
      (option) => option.value === "ltx-deploy-layout-to-video",
    );
    expect(deploy).toBeTruthy();
    expect(
      renderToStaticMarkup(
        <SelectOptionRow option={deploy!} selected={false} />,
      ),
    ).not.toContain("aria-disabled");
  });

  it("puts the family's ready entry in the menu and keeps FLUX open-only for Klein", () => {
    const controls = renderToStaticMarkup(
      <FamilyModelSelector
        generator="video"
        model="ltx-2.5"
        onChoose={() => {}}
        openOnly={false}
        onOpenOnlyChange={() => {}}
      />,
    );
    expect(controls).toContain("LTX-2.5 Fast · Text to video");
    const family = (openOnly: boolean, model: VideoModel) =>
      renderToStaticMarkup(
        <FamilyModelSelector
          generator="video"
          model={model}
          openOnly={openOnly}
          onChoose={() => {}}
          onOpenOnlyChange={() => {}}
        />,
      );
    expect(family(false, "flux-3")).toContain(
      'class="is-selected" aria-label="FLUX models"',
    );
    expect(family(false, "flux-3")).toContain("FLUX models");
    expect(family(true, "ltx-2.5")).toContain('aria-label="FLUX models"');
    expect(family(true, "ltx-2.5")).toContain('aria-label="LTX models"');
  });
});

describe("controls come from the registry entry", () => {
  const ready = registry.filter((e) => e.status === "ready");
  const videoControls = (id: string) => {
    const controls = readyEntry(id)!.controls;
    if (controls.kind !== "video") throw new Error(`${id} is not video`);
    return controls;
  };
  const render = (model: VideoModel, generator: Generator = "video") =>
    renderToStaticMarkup(
      <GenerationControls
        generator={generator}
        model={model}
        duration={6}
        onDurationChange={() => {}}
        aspectRatio="16:9"
        onAspectRatioChange={() => {}}
        resolution="hd"
        onResolutionChange={() => {}}
        cameraEnabled
        onCameraEnabledChange={() => {}}
        draft={false}
        onDraftChange={() => {}}
      />,
    );

  it("gives every ready entry a controls description", () => {
    for (const entry of ready)
      expect(entry.status === "ready" && entry.controls).toBeTruthy();
    expect(readyEntry("flux-video-upscale")!.controls).toEqual({
      kind: "upscale",
    });
  });

  it("keeps FLUX 3 on its fader, seven ratios and draft", () => {
    expect(videoControls("flux-3-video")).toEqual({
      kind: "video",
      duration: { min: 5, max: 20 },
      aspectRatios: ["21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"],
      resolutions: ["hd", "fhd", "qhd", "uhd"],
      draft: true,
      camera: true,
      acoustic: false,
    });
  });

  it("gives FLUX 3 from a start image the same controls and no route suffix", () => {
    expect(readyEntry("flux-3-i2v")!.controls).toEqual(
      readyEntry("flux-3-video")!.controls,
    );
    // FLUX 3 is BFL's model; the menu needs no "· BFL" to say so.
    const flux = modelOptions("flux", false).map((o) => o.label);
    expect(flux).toContain("FLUX 3 · Image to video");
    expect(flux.some((label) => label.endsWith("· BFL"))).toBe(false);
  });

  it("offers LTX only Router's durations and the two frames it keeps", () => {
    for (const id of ["ltx-2-5-fast", "ltx-2-5-pro"]) {
      const controls = videoControls(id);
      expect(controls.duration).toEqual({ choices: LTX_DURATIONS });
      expect(controls.aspectRatios).toEqual(["16:9", "9:16"]);
      expect(controls.resolutions).toEqual(
        id === "ltx-2-5-pro" ? ["hd", "fhd"] : ["hd", "fhd", "qhd", "uhd"],
      );
      expect(controls).toMatchObject({ draft: false, camera: true });
    }
    // The shared rule snaps exactly as the request body does.
    for (let seconds = 1; seconds <= 25; seconds++)
      expect(fitDuration(videoControls("ltx-2-5-fast").duration, seconds)).toBe(
        ltxDuration(seconds),
      );
  });

  it("renders the row from the entry: draft for FLUX only", () => {
    const flux = render("flux-3");
    expect(flux).toContain('id="draft-label"');
    const ltx = render("ltx-2.5");
    expect(ltx).not.toContain('id="draft-label"');
    expect(ltx).toContain('id="camera-label"');
    expect(ltx).toContain('id="duration-label"');
    // The upscale entry has no controls here; UpscaleControls follows the menu.
    expect(render("flux-3", "upscale")).toBe("");
  });

  it("shows no Audio control on any entry", () => {
    for (const entry of ready) {
      if (entry.status !== "ready") continue;
      expect(entry.controls).not.toHaveProperty("audio");
      const html = render(entry.videoModel, entry.generator);
      expect(html).not.toContain("audio-label");
      expect(html).not.toMatch(/>Audio</);
    }
  });

  it("coerces what the new entry cannot take, once, in the reducer", () => {
    const flux = state({
      duration: 7,
      aspectRatio: "21:9",
      draft: true,
      resolution: "fhd",
    });
    const ltx = update(flux, { model: "ltx-2.5" });
    expect(ltx).toMatchObject({
      duration: 6,
      aspectRatio: "16:9",
      draft: false,
      resolution: "fhd",
    });
    expect(
      update(state({ aspectRatio: "3:4" }), { model: "ltx-2.5-pro" }),
    ).toMatchObject({ aspectRatio: "9:16" });
    // Back on FLUX, an LTX-only 2s rises to the fader's floor.
    expect(
      update(update(ltx, { duration: 2 }), { model: "flux-3" }).duration,
    ).toBe(5);
    // A value both entries take is left alone.
    const settled = update(ltx, { description: "A pier at night." });
    expect(update(settled, { model: "ltx-2.5-pro" }).duration).toBe(6);
    // Open only lands on LTX and is fitted too.
    expect(update(flux, { openOnly: true })).toMatchObject({
      model: "ltx-2.5",
      duration: 6,
      draft: false,
    });
    // An LTX run recorded at 7s restores as the 6s it can repeat.
    const job = { ...composerInput(state()), id: "j" } as Job;
    expect(
      composerReducer(state(), {
        type: "restore",
        job: { ...job, model: "ltx-2.5", duration: 7, aspectRatio: "1:1" },
      }),
    ).toMatchObject({ duration: 6, aspectRatio: "16:9" });
  });

  it("chooses a menu row as one change, so a half-made selection fits nothing", () => {
    // Upscale reached from LTX; choosing FLUX 3 must keep its draft and ratio.
    const from = state({
      generator: "upscale",
      model: "ltx-2.5",
      draft: true,
      aspectRatio: "21:9",
    });
    expect(from).toMatchObject({ draft: true, aspectRatio: "21:9" });
    expect(update(from, selectionFor("flux-3-video")!)).toMatchObject({
      generator: "video",
      model: "flux-3",
      draft: true,
      aspectRatio: "21:9",
    });
  });

  it("leaves audio out of the request: every video run asks for it", () => {
    const ltx = update(state({ duration: 9 }), { model: "ltx-2.5" });
    const flux = update(ltx, { model: "flux-3" });
    const upscale = state({ generator: "upscale", sourceId: "clip-1" });
    for (const held of [ltx, flux, upscale]) {
      const input = composerInput(held);
      expect(input).not.toHaveProperty("audio");
      // A request still carrying the old switch is read without it.
      expect(validateInput({ ...input, audio: false })).not.toHaveProperty(
        "audio",
      );
    }
    expect(validateInput(composerInput(ltx))).toMatchObject({ duration: 8 });
    // A run recorded with the switch off restores like any other.
    const job = {
      ...composerInput(ltx),
      id: "j",
      audio: false,
    } as unknown as Job;
    expect(
      composerReducer(state(), { type: "restore", job }),
    ).not.toHaveProperty("audio");
    for (const model of [
      "ltx-2.5",
      "ltx-2.5-pro",
      "ltx-2.5-akuspace",
      "flux-3",
    ] as VideoModel[])
      expect(generatorFoot("video", "Precise", model)).toContain(
        " · native audio",
      );
  });

  it("validates a request against the same controls", () => {
    const ltx = composerInput(update(state(), { model: "ltx-2.5" }));
    for (const seconds of LTX_DURATIONS)
      expect(validateInput({ ...ltx, duration: seconds }).duration).toBe(
        seconds,
      );
    // A hand-made request is fitted rather than recorded as something it was not.
    expect(
      validateInput({ ...ltx, duration: 7, aspectRatio: "21:9", draft: true }),
    ).toMatchObject({
      duration: 6,
      aspectRatio: "16:9",
      draft: false,
      resolution: "hd",
    });
    expect(() => validateInput({ ...ltx, duration: 1 })).toThrow();
    expect(() => validateInput({ ...ltx, duration: 21 })).toThrow();
    // An old or stray audio field is not this allowlist's to judge.
    expect(validateInput({ ...ltx, audio: "yes" })).not.toHaveProperty("audio");
    // FLUX keeps its 5 to 20 fader.
    const flux = composerInput(state());
    expect(() => validateInput({ ...flux, duration: 2 })).toThrow();
    expect(validateInput({ ...flux, duration: 7 }).duration).toBe(7);
  });
});
