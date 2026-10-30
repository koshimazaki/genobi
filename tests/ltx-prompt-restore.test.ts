import { describe, expect, it } from "vitest";
import { validateInput } from "../server/validation";
import { canonicalInput } from "../shared/idempotency";
import { parseLibrary } from "../shared/library";
import { emptyCamera } from "../shared/camera";
import { emptyLight } from "../shared/light";
import { emptySlots, readLtxPrompt } from "../shared/ltx-prompt";
import { acousticCaption, type AcousticSetting } from "../shared/acoustic";
import { composePrompt } from "../shared/presets";
import { librarySetupJob } from "../src/library";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import type { Job } from "../shared/types";

const club: AcousticSetting = {
  mode: "room",
  preset: "empty_club",
  level: "high",
};
const state = (patch: Partial<ComposerState>): ComposerState => ({
  ...initialComposer,
  generator: "video",
  model: "ltx-2.5",
  description: "A pier at dawn",
  camera: { ...emptyCamera, "shot-sizes": "wide", movements: "orbit" },
  cameraEdits: {},
  cameraEnabled: true,
  acoustic: null,
  ...patch,
});
/** What the server records: the validated request as a ready job. */
const recorded = (composer: ComposerState): Job => {
  const input = validateInput(composerInput(composer));
  return {
    ...input,
    id: "job-1",
    prompt: composePrompt(input),
    status: "Ready",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    costEstimateUsd: 0.5,
    keyMode: "byo",
  };
};
const filled = state({
  slots: {
    scene: "Glossy wet boards",
    character: "A fisherman in his sixties, shoulders drop",
    action: "Initially, he coils a rope",
    audio: "Gulls cry",
  },
  light: { lighting: "natural-sunlight", palette: "muted", atmosphere: null },
  lightEdits: { muted: "Soft grey-blue tones." },
});

describe("Recreate and saved prompts", () => {
  it("bring the gaps back as gaps, and the run composes the same paragraph", () => {
    const job = recorded(filled);
    expect(job.ltxPrompt).toMatchObject({
      main: "A pier at dawn",
      audio: "Gulls cry",
    });
    for (const type of ["restore", "restore-prompt"] as const) {
      const back = composerReducer(
        { ...initialComposer, slots: { ...emptySlots, scene: "stale" } },
        { type, job },
      );
      expect(back.description).toBe("A pier at dawn");
      expect(back.slots).toEqual(filled.slots);
      expect(back.light).toEqual(filled.light);
      expect(back.lightEdits).toEqual({ muted: "Soft grey-blue tones." });
      expect(composerInput(back).description).toBe(job.description);
      expect(canonicalInput(composerInput(back))).toBe(canonicalInput(job));
    }
  });

  it("restore an older take exactly as before, with the gaps empty", () => {
    const job = recorded(state({}));
    expect(job).not.toHaveProperty("ltxPrompt");
    const back = composerReducer(
      { ...initialComposer, slots: { ...emptySlots, audio: "stale" } },
      { type: "restore", job },
    );
    expect(back.description).toBe(job.description);
    expect(back.slots).toEqual(emptySlots);
    expect(back.light).toEqual(emptyLight);
    expect(composerInput(back)).toEqual(composerInput(state({})));
  });

  it("reach a catalogue clip's setup through the same check as a request", () => {
    const job = recorded(filled);
    const {
      id: _id,
      status: _s,
      createdAt,
      updatedAt: _u,
      costEstimateUsd,
      keyMode: _k,
      ...setup
    } = job;
    const clip = {
      id: "pier",
      label: "Pier",
      url: "/media/pier.mp4",
      width: 1920,
      height: 1080,
      duration: 6,
      bytes: 1000,
      setup: { ...setup, costUsd: costEstimateUsd, generatedAt: createdAt },
    };
    const [good] = parseLibrary([clip]);
    const back = composerReducer(initialComposer, {
      type: "restore",
      job: librarySetupJob(good)!,
    });
    expect(back.slots).toEqual(filled.slots);
    // A malformed record is dropped; the clip restores its description as one text.
    const [bad] = parseLibrary([
      { ...clip, setup: { ...clip.setup, ltxPrompt: { main: 4 } } },
    ]);
    expect(bad.setup).not.toHaveProperty("ltxPrompt");
  });
});

describe("the request allowlist", () => {
  const input = composerInput(filled);

  it("records the gaps as sent, and replays on them", () => {
    expect(validateInput(input).ltxPrompt).toEqual(input.ltxPrompt);
    const other = {
      ...input,
      ltxPrompt: { ...input.ltxPrompt!, audio: "Waves" },
    };
    expect(canonicalInput(validateInput(other))).not.toBe(
      canonicalInput(validateInput(input)),
    );
  });

  it("takes them for LTX video only", () => {
    expect(() => validateInput({ ...input, model: "flux-3" })).toThrow(
      /LTX video only/,
    );
  });

  it("checks their type and length, and the Light terms", () => {
    const bad = [
      { ...input.ltxPrompt, scene: 5 },
      { ...input.ltxPrompt, action: "x".repeat(1201) },
      { ...input.ltxPrompt, extra: "" },
      { ...input.ltxPrompt, light: { ...emptyLight, lighting: "laser" } },
      { ...input.ltxPrompt, light: { lighting: null } },
      { ...input.ltxPrompt, lightEdits: { fog: "x".repeat(601) } },
      { ...input.ltxPrompt, lightEdits: { orbit: "Not light" } },
      [],
      "text",
    ];
    for (const ltxPrompt of bad) {
      expect(readLtxPrompt(ltxPrompt)).toBeNull();
      expect(() => validateInput({ ...input, ltxPrompt })).toThrow(
        /prompt gap/,
      );
    }
  });

  it("keeps the Acoustic Space caption whole in a composed run", () => {
    const akuspace = composerInput(
      state({
        model: "ltx-2.5-akuspace",
        acoustic: club,
        slots: { ...emptySlots, audio: "Drums" },
      }),
    );
    expect(akuspace.description).toContain(acousticCaption(club));
    expect(composePrompt(validateInput(akuspace))).toBe(akuspace.description);
    expect(() =>
      validateInput({ ...akuspace, description: "A drummer warms up." }),
    ).toThrow(/caption/);
  });
});
