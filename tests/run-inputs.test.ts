import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../shared/types";
import {
  captureRunInputs,
  createRunInputStore,
  restoredRunInputs,
} from "../src/run-inputs";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";

afterEach(() => vi.useRealTimers());
const SOURCE = "data:image/png;base64,AAAA",
  STYLE = "data:image/jpeg;base64,BBBB==";
const state: ComposerState = {
  ...initialComposer,
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tower and a tree",
  imageAspectRatio: "auto",
  imageReferences: [SOURCE, STYLE],
  imageRegions: [
    {
      id: "tree",
      box: [0, 0, 500, 500],
      description: "a pine tree",
      action: "change",
      label: [20, 30],
    },
  ],
};
const input = composerInput(state);
const job = {
  ...input,
  id: "saved",
  imageReferences: undefined,
  imageReferenceCount: 2,
} as Job;

describe("Recreate input files", () => {
  it("round-trips the editable prompt, boxes and ordered references without doubling layout rows", () => {
    const inputs = captureRunInputs(job, input, state);
    const restored = composerReducer(
      { ...initialComposer, imageReferences: ["data:image/webp;base64,CC=="] },
      { type: "restore", job, inputs },
    );
    expect(restored.description).toBe(state.description);
    expect(restored.imageRegions).toEqual(state.imageRegions);
    expect(restored.imageReferences).toEqual(state.imageReferences);
    expect(composerInput(restored)).toMatchObject(input);
  });
  it("restores an edit's original source and auxiliary references instead of its output", () => {
    const edit = {
      ...state,
      generator: "edit",
      model: "flux-3",
      imageRegions: [],
    } as ComposerState;
    const sent = composerInput(edit),
      saved = {
        ...sent,
        id: "edit",
        imageReferences: undefined,
        resultUrl: "/api/clips/output",
      } as Job;
    const restored = composerReducer(initialComposer, {
      type: "restore",
      job: saved,
      inputs: captureRunInputs(saved, sent, edit),
    });
    expect(restored.imageReferences).toEqual([SOURCE, STYLE]);
    expect(composerInput(restored)).toMatchObject(sent);
  });
  it("restores video references and the saved guide id for H3", () => {
    const video = {
      ...state,
      generator: "video",
      model: "minimax-h3",
      sourceId: "guide-clip",
      camera: { "shot-sizes": null, angles: null, movements: null },
      imageRegions: [],
    } as ComposerState;
    const sent = composerInput(video),
      saved = { ...sent, id: "h3", imageReferences: undefined } as Job;
    const restored = composerReducer(initialComposer, {
      type: "restore",
      job: saved,
      inputs: captureRunInputs(saved, sent),
    });
    expect(restored.imageReferences).toEqual(video.imageReferences);
    expect(restored.sourceId).toBe("guide-clip");
    expect(composerInput(restored)).toMatchObject(sent);
  });
  it("does not overwrite LTX's restored gaps with its composed description", () => {
    const video = {
      ...initialComposer,
      model: "ltx-2.5",
      description: "A forest",
      slots: { ...initialComposer.slots, action: "Leaves sway" },
    } as ComposerState;
    const sent = composerInput(video),
      saved = { ...sent, id: "ltx" } as Job;
    const restored = composerReducer(initialComposer, {
      type: "restore",
      job: saved,
      inputs: captureRunInputs(saved, sent),
    });
    expect(composerInput(restored)).toMatchObject(sent);
  });
  it("rejects inputs belonging to another run or another recorded prompt", () => {
    const inputs = captureRunInputs(job, input, state);
    expect(restoredRunInputs({ ...job, id: "other" }, inputs)).toEqual({});
    expect(
      restoredRunInputs({ ...job, description: "different" }, inputs),
    ).toEqual({});
  });
  it("retains an immutable tab fallback when browser storage fails, without a paid retry", async () => {
    const storage = createRunInputStore(() => undefined);
    const inputs = captureRunInputs(job, input, state);
    expect(await storage.save(inputs)).toBe(false);
    inputs.imageReferences.length = 0;
    expect((await storage.load(job.id))?.imageReferences).toEqual(
      state.imageReferences,
    );
  });
  it("bounds retained inputs and expires them after 30 days", async () => {
    vi.useFakeTimers();
    const storage = createRunInputStore(() => undefined);
    for (let i = 0; i < 51; i++) {
      vi.advanceTimersByTime(1);
      await storage.save(
        captureRunInputs({ ...job, id: String(i) }, input, state),
      );
    }
    expect(await storage.load("0")).toBeUndefined();
    expect(await storage.load("50")).toBeDefined();
    vi.advanceTimersByTime(31 * 86400000);
    expect(await storage.load("50")).toBeUndefined();
  });
});
