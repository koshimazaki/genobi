import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  cameraSections,
  cameraTerms,
  emptyCamera,
  type CameraTermId,
} from "../shared/camera";
import { parseLibrary } from "../shared/library";
import { composePrompt } from "../shared/presets";
import {
  composerInput,
  composerReducer,
  initialComposer,
  markEdit,
} from "../src/useComposer";
import { validateInput } from "../server/validation";
import { librarySetupJob } from "../src/library";
import {
  jobIdFromUrl,
  selectedJob,
  jobHistoryState,
  cleanJobUrl,
} from "../src/job-links";
import type { Job } from "../shared/types";

describe("section camera contract", () => {
  it("has a unique catalog with complete user-facing and pose data", () => {
    expect(new Set(cameraTerms.map((t) => t.id)).size).toBe(33);
    for (const section of cameraSections)
      for (const term of section.terms) {
        expect(
          term.description &&
            term.example &&
            term.clause &&
            term.ltx &&
            section.anchor,
        ).toBeTruthy();
        // A static frame is the one term with nothing to animate.
        if (term.id !== "static")
          expect(Object.keys(term.pose).length).toBeGreaterThan(0);
        expect(term.clause[0]).toMatch(/[A-Z]/);
        expect(term.ltx[0]).toMatch(/[A-Z]/);
        expect(term.ltx.endsWith(".")).toBe(true);
      }
  });
  it("composes scene, shot size, angle and movement in order", () => {
    const state = {
      ...initialComposer,
      description: "A chair.",
      camera: {
        "shot-sizes": "wide",
        angles: "low-angle",
        movements: "orbit",
      } as const,
    };
    const valid = validateInput(composerInput(state));
    expect(composePrompt(valid)).toBe(
      "A chair.\n\nWide shot with space around the subject.\n\nLow angle looking up at the subject.\n\nSlow orbit around the subject.",
    );
    expect(composePrompt({ ...valid, camera: emptyCamera })).toBe("A chair.");
    expect(composePrompt({ ...valid, cameraEnabled: false })).toBe("A chair.");
    expect(composePrompt({ ...valid, generator: "upscale" })).toBe("");
  });
  it("keeps optional upscale text separate, validates it and restores it", () => {
    const state = {
      ...initialComposer,
      generator: "upscale" as const,
      sourceId: "library-01",
      upscalePrompt: "  Fine fabric texture.  ",
    };
    const valid = validateInput(composerInput(state));
    expect(composePrompt(valid)).toBe("Fine fabric texture.");
    expect(valid.cameraEnabled).toBe(false);
    expect(
      composerReducer(initialComposer, { type: "restore", job: valid as Job })
        .upscalePrompt,
    ).toBe("Fine fabric texture.");
    expect(composePrompt({ ...valid, upscalePrompt: "" })).toBe("");
    expect(composePrompt({ ...valid, upscalePrompt: undefined })).toBe("");
    expect(
      composePrompt(composerInput({ ...state, generator: "video" })),
    ).not.toContain("Fine fabric texture.");
    for (const upscalePrompt of [42, null, "x".repeat(1201)])
      expect(() => validateInput({ ...valid, upscalePrompt })).toThrow();
  });
  it("loads video prompt and camera without changing generation settings, while Recreate restores them", () => {
    const state = {
      ...initialComposer,
      generator: "upscale" as const,
      draft: true,
      duration: 13,
      aspectRatio: "21:9" as const,
      resolution: "uhd" as const,
      sourceId: "keep-source",
      upscalePrompt: "Keep this guidance.",
      upscaleFactor: 2.5,
      upscaleCreativity: 1 as const,
      cameraEdits: { orbit: "Unrelated current wording." },
    };
    const job = {
      ...composerInput(initialComposer),
      description: "A motorcycle in the forest.",
      camera: {
        "shot-sizes": "macro",
        angles: "high-angle",
        movements: "orbit",
      },
      cameraEdits: { macro: "A chrome detail.", "high-angle": "" },
      duration: 9,
      resolution: "fhd",
      aspectRatio: "9:16",
      draft: false,
    } as Job;
    const promptOnly = composerReducer(state, { type: "restore-prompt", job });
    expect(composePrompt(composerInput(promptOnly))).toBe(composePrompt(job));
    expect(promptOnly).toEqual({
      ...state,
      generator: "video",
      description: job.description,
      cameraEnabled: job.cameraEnabled,
      camera: job.camera,
      cameraEdits: {
        macro: "A chrome detail.",
        "high-angle": "",
        orbit: "Slow orbit around the subject.",
      },
    });
    const recreated = composerReducer(state, { type: "restore", job });
    expect(recreated).toMatchObject({
      draft: false,
      duration: 9,
      resolution: "fhd",
      aspectRatio: "9:16",
      sourceId: "",
    });
  });
  it("switches to upscale for prompt reuse while preserving source and all other controls", () => {
    const state = {
      ...initialComposer,
      sourceId: "current-source",
      upscaleFactor: 3,
      upscaleCreativity: 1 as const,
    };
    const job = {
      ...composerInput(initialComposer),
      generator: "upscale",
      upscalePrompt: "Fine wood grain.",
      sourceId: "saved-source",
      upscaleFactor: 1.5,
    } as Job;
    expect(composerReducer(state, { type: "restore-prompt", job })).toEqual({
      ...state,
      generator: "upscale",
      upscalePrompt: "Fine wood grain.",
    });
    expect(composerReducer(state, { type: "restore", job })).toMatchObject({
      generator: "upscale",
      sourceId: "saved-source",
      upscaleFactor: 1.5,
    });
  });
  it("rejects mixed sections, extra sections, missing sections and malformed edits", () => {
    const input = composerInput(initialComposer);
    for (const camera of [
      null,
      [],
      {},
      { ...emptyCamera, angles: "orbit" },
      { ...emptyCamera, movements: ["orbit", "pan"] },
      { ...emptyCamera, lenses: "macro" },
    ])
      expect(() => validateInput({ ...input, camera })).toThrow();
    for (const cameraEdits of [
      null,
      [],
      { orbit: "x".repeat(601) },
      { orbit: 1 },
      // A term the composer does not have selected, so it must not reach the
      // provider. `orbit` is not part of the opening camera; the opening clip's
      // own terms are checked to be selected in the test below.
      { orbit: "Not selected" },
    ])
      expect(() => validateInput({ ...input, cameraEdits })).toThrow();
  });
  it("retains per-term edits while submitting only the selected terms", () => {
    // Camera edits reach the reducer the way CameraDialog sends them.
    const editCamera = (id: CameraTermId, text: string) => ({
      type: "update" as const,
      patch: { cameraEdits: { [id]: text } },
    });
    let state = composerReducer(
      { ...initialComposer, description: "A creature in a forest." },
      editCamera("orbit", "Custom orbit."),
    );
    state = composerReducer(state, {
      type: "update",
      patch: { camera: { ...emptyCamera, movements: "pan" } },
    });
    expect(composePrompt(composerInput(state))).not.toContain("Custom orbit.");
    expect(composerInput(state).cameraEdits).not.toHaveProperty("orbit");
    state = composerReducer(state, {
      type: "update",
      // The subject here is the reducer's own edit handling, so the camera is
      // stated instead of taken from whatever the studio happens to open on.
      patch: { camera: { ...emptyCamera, movements: "orbit" } },
    });
    expect(composePrompt(composerInput(state))).toContain("Custom orbit.");
    state = composerReducer(state, editCamera("orbit", ""));
    expect(composePrompt(validateInput(composerInput(state)))).toBe(
      state.description,
    );
  });
  it("restores a saved default clause instead of an unrelated current edit", () => {
    const state = {
      ...initialComposer,
      cameraEdits: { orbit: "Unrelated edit." },
    };
    const restored = composerReducer(state, {
      type: "restore",
      job: {
        ...composerInput({
          ...initialComposer,
          camera: { ...emptyCamera, movements: "orbit" },
        }),
        cameraEdits: {},
      } as Job,
    });
    expect(composePrompt(composerInput(restored))).toContain(
      "Slow orbit around the subject.",
    );
    expect(composePrompt(composerInput(restored))).not.toContain(
      "Unrelated edit.",
    );
  });
  it("restores settings and empty historical edits without leaking the old source", () => {
    const restored = composerReducer(
      { ...initialComposer, sourceId: "stale" },
      {
        type: "restore",
        job: {
          ...composerInput(initialComposer),
          camera: undefined,
          cameraEdits: undefined,
          presetId: "low",
          cameraText: "",
          resolution: "fhd",
          draft: true,
        } as Job,
      },
    );
    expect(restored.camera.angles).toBe("low-angle");
    expect(restored.sourceId).toBe("");
    expect(restored.resolution).toBe("fhd");
    expect(composerInput(restored).resolution).toBe("hd");
    expect(composePrompt(composerInput(restored))).toBe(restored.description);
    expect(
      composerReducer(restored, { type: "update", patch: { draft: false } })
        .resolution,
    ).toBe("fhd");
  });
});

describe("the composer opens on the run the studio features", () => {
  it("starts on the whole run of the first catalogue clip, not just its scene", async () => {
    const shipped = parseLibrary(
      JSON.parse(await readFile("public/media/gallery.json", "utf8")),
    );
    const featured = shipped[0];
    // The main view opens on the first catalogue clip, so the composer's first
    // state has to be that clip's run, or no run at all: a scene text that
    // merely matches is not the same run, and shows a clip over a prompt that
    // made something else — the motorbike clip used to sit above a five-second
    // orbit that never made it. Reordering the catalogue is therefore a
    // deliberate change to what the studio opens on, not a silent mismatch.
    const setup = featured?.setup;
    if (!setup) {
      // A clip made outside the studio has no recorded prompt, so the composer
      // opens empty rather than borrowing another clip's run.
      expect(featured?.model).toBeDefined();
      expect(initialComposer).toMatchObject({
        generator: "video",
        description: "",
      });
      return;
    }
    expect(composerInput(initialComposer)).toMatchObject({
      generator: setup.generator,
      description: setup.description,
      camera: setup.camera,
      cameraEdits: setup.cameraEdits,
      cameraEnabled: setup.cameraEnabled,
      duration: setup.duration,
      resolution: setup.resolution,
      aspectRatio: setup.aspectRatio,
      draft: setup.draft,
    });
    // The strongest form of the same claim: what the composer would submit on
    // first paint is the prompt the featured clip recorded verbatim.
    expect(composePrompt(composerInput(initialComposer))).toBe(setup.prompt);
    // And the composer holds what the clip's own run restores, as Recreate does
    // it, rather than a second copy of the same numbers.
    expect(initialComposer).toEqual(
      composerReducer(initialComposer, {
        type: "restore",
        job: librarySetupJob(featured!)!,
      }),
    );
  });
});

describe("every control that edits the composer travels one path", () => {
  it("marks the edit and dispatches it as one write", () => {
    // The camera dialogue's `Done` dispatched its own "update" action, so its
    // edits did not mark the composer as edited. A run arriving while the
    // visitor was still choosing a camera was then restored over their choice:
    // the restore effect in `src/App.tsx` only stands aside for edits made here.
    const actions: unknown[] = [];
    const edited = { current: false };
    markEdit((action) => actions.push(action), edited, {
      camera: { ...emptyCamera, movements: "orbit" },
      cameraEdits: { orbit: "Custom orbit around the subject." },
      cameraEnabled: true,
    });
    expect(edited.current).toBe(true);
    expect(actions).toEqual([
      {
        type: "update",
        patch: {
          camera: { ...emptyCamera, movements: "orbit" },
          cameraEdits: { orbit: "Custom orbit around the subject." },
          cameraEnabled: true,
        },
      },
    ]);
  });
  it("leaves the studio no second way to dispatch an update", async () => {
    // The bug is only fixed while every edit goes through `markEdit`, and the
    // studio is the one file that can dispatch an update of its own. Reading it
    // is the only check the suite can make without a browser, and it fails on
    // exactly the line that caused this.
    const studio = await readFile("src/App.tsx", "utf8");
    expect(studio).not.toContain('type: "update"');
    expect(studio).toContain("update({");
  });
});

describe("job links", () => {
  it("reads safe IDs and preserves other URL state when selecting a job", () => {
    expect(jobIdFromUrl("http://localhost/?job=abc-123")).toBe("abc-123");
    expect(jobIdFromUrl("http://localhost/?job=../../private")).toBeNull();
    expect(jobIdFromUrl("http://localhost/")).toBeNull();
    expect(
      cleanJobUrl("http://localhost/studio?theme=dark&job=abc-123#video"),
    ).toBe("/studio?theme=dark#video");
  });
  it("restores the selected clip from tab history and accepts old links", () => {
    const state = jobHistoryState({ theme: "dark" }, "clip-42");
    expect(state).toEqual({ theme: "dark", studioJobId: "clip-42" });
    expect(selectedJob("https://studio.test/", state)).toBe("clip-42");
    expect(selectedJob("https://studio.test/?job=legacy", state)).toBe(
      "legacy",
    );
    for (const state of [
      null,
      [],
      "clip-42",
      { studioJobId: "../secret" },
      { studioJobId: 42 },
    ])
      expect(selectedJob("https://studio.test/", state)).toBeNull();
    expect(
      selectedJob("https://studio.test/", jobHistoryState(state, null)),
    ).toBeNull();
  });
});
