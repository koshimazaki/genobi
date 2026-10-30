import { describe, expect, it } from "vitest";
import { composePrompt } from "../shared/presets";
import { emptyCamera, type CameraSelection } from "../shared/camera";
import { emptyLight } from "../shared/light";
import {
  DESCRIPTION_LIMIT,
  emptySlots,
  fitSegments,
  joinSegments,
  ltxSegments,
  type LtxPromptState,
} from "../shared/ltx-prompt";
import { insertChip } from "../shared/ltx-vocabulary";
import { acousticCaption, type AcousticSetting } from "../shared/acoustic";
import {
  composerBlocked,
  composerInput,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import type { GenerateInput } from "../shared/types";

const camera = (
  shot: CameraSelection["shot-sizes"],
  angle: CameraSelection["angles"],
  move: CameraSelection["movements"],
): CameraSelection => ({ "shot-sizes": shot, angles: angle, movements: move });
const club: AcousticSetting = {
  mode: "room",
  preset: "empty_club",
  level: "high",
};

/**
 * Prompts composed by `origin/main` before the gaps existed (e04382e), for
 * the same inputs: FLUX in every form, and LTX from the main field alone.
 */
const baseline: [string, Partial<GenerateInput>, string][] = [
  [
    "flux default orbit",
    {
      model: "flux-3",
      description: "A lighthouse at dusk.",
      camera: camera(null, null, "orbit"),
    },
    "A lighthouse at dusk.\n\nSlow orbit around the subject.",
  ],
  [
    "flux all three",
    {
      model: "flux-3",
      description: "A chrome chair on a plinth.",
      camera: camera("wide", "low-angle", "dolly-in"),
    },
    "A chrome chair on a plinth.\n\nWide shot with space around the subject.\n\nLow angle looking up at the subject.\n\nDolly in toward the subject.",
  ],
  [
    "flux edited",
    {
      model: "flux-3",
      description: "  A dancer on a roof.  ",
      camera: camera("close-up", null, "pan"),
      cameraEdits: { pan: "Pan left, fast." },
    },
    "A dancer on a roof.\n\nClose-up of the subject.\n\nPan left, fast.",
  ],
  [
    "flux camera off",
    {
      model: "flux-3",
      description: "A quiet street.",
      cameraEnabled: false,
      camera: camera("wide", null, "orbit"),
    },
    "A quiet street.",
  ],
  [
    "flux image still",
    {
      generator: "image",
      model: "flux-3",
      description: "A teapot.",
      camera: camera("close-up", "high-angle", "orbit"),
    },
    "A teapot.\n\nClose-up of the subject.\n\nHigh angle looking down at the subject.",
  ],
  [
    "klein still",
    {
      generator: "image",
      model: "flux-3-klein",
      description: "A teapot.",
      camera: camera("close-up", "high-angle", "orbit"),
    },
    "A teapot.\n\nClose-up of the subject.\n\nHigh angle looking down at the subject.",
  ],
  [
    "ltx main only",
    {
      model: "ltx-2.5",
      description: "A rough motorbike in the woods.",
      camera: camera("close-up", "low-angle", "pan"),
    },
    "A rough motorbike in the woods. A close-up frames the upper part of the subject. The camera looks up at the subject from a low angle. The camera pans across the subject from a fixed position, the subject passing through the frame.",
  ],
  [
    "ltx main only, edited",
    {
      model: "ltx-2.5-pro",
      description: "A harbour at night",
      camera: camera("wide", null, "orbit"),
      cameraEdits: { orbit: "The camera circles twice." },
    },
    "A harbour at night A wide shot gives the subject room in its surroundings. The camera circles twice.",
  ],
  [
    "ltx akuspace main only",
    {
      model: "ltx-2.5-akuspace",
      description: "A drummer warms up",
      camera: camera(null, null, "static"),
      acoustic: club,
    },
    "A drummer warms up The camera holds a static frame on the subject for the whole shot. AKUSPACE in an empty club, heavy broad hard-surface reflections and a 1.2-second reverb decay, no crowd",
  ],
];
/** This unchanged-caption case explicitly turns camera framing off. */
const viaComposer: Record<string, string> = { "flux image still": "A teapot." };
const asInput = (patch: Partial<GenerateInput>): GenerateInput =>
  ({
    generator: "video",
    cameraEnabled: true,
    cameraEdits: {},
    ...patch,
  }) as GenerateInput;
const state = (patch: Partial<ComposerState>): ComposerState => ({
  ...initialComposer,
  generator: "video",
  description: "",
  camera: emptyCamera,
  cameraEdits: {},
  cameraEnabled: true,
  acoustic: null,
  slots: emptySlots,
  light: emptyLight,
  lightEdits: {},
  ...patch,
});
const ltx = (patch: Partial<LtxPromptState> = {}): LtxPromptState => ({
  generator: "video",
  model: "ltx-2.5",
  description: "",
  cameraEnabled: true,
  camera: camera("wide", "low-angle", "dolly-in"),
  cameraEdits: {},
  acoustic: null,
  slots: emptySlots,
  light: emptyLight,
  lightEdits: {},
  ...patch,
});

describe("prompts the gaps do not touch", () => {
  it.each(baseline)("%s composes as it did before", (_, patch, expected) => {
    expect(composePrompt(asInput(patch))).toBe(expected);
  });

  it.each(baseline)(
    "%s goes through the composer unchanged, gaps or not",
    (name, patch, expected) => {
      // FLUX ignores the gaps and Light; LTX with empty gaps is today's request.
      const filled = !patch.model?.startsWith("ltx");
      const composer = state({
        ...(name === "flux image still" ? { cameraEnabled: false } : {}),
        ...(patch as Partial<ComposerState>),
        generator: patch.generator ?? "video",
        model: patch.model ?? "flux-3",
        ...(filled
          ? {
              slots: {
                scene: "Fog.",
                character: "A child.",
                action: "Runs.",
                audio: "Rain.",
              },
              light: { ...emptyLight, lighting: "neon-glow" as const },
            }
          : {}),
      });
      const input = composerInput(composer);
      expect(input).not.toHaveProperty("ltxPrompt");
      expect(input.description).toBe(patch.description);
      expect(composePrompt(input)).toBe(viaComposer[name] ?? expected);
    },
  );
});

describe("the LTX paragraph", () => {
  it("follows the guide: shot, scene and light, action, character, movement, audio", () => {
    const segments = ltxSegments(
      ltx({
        description: "A lamp maker's workshop",
        slots: {
          scene: "rough stone walls",
          character: "A woman in her twenties, jaw clenched",
          action: "She lifts the lamp",
          audio: 'She whispers, "Now."',
        },
        light: { lighting: "neon-glow", palette: null, atmosphere: "fog" },
      }),
    );
    expect(segments.map((s) => s.part)).toEqual([
      "shot",
      "angle",
      "main",
      "scene",
      "light",
      "light",
      "action",
      "character",
      "movement",
      "audio",
    ]);
    expect(joinSegments(segments)).toBe(
      'A wide shot gives the subject room in its surroundings. The camera looks up at the subject from a low angle. A lamp maker\'s workshop. Rough stone walls. A neon glow bathes the scene in saturated colour that reflects off nearby surfaces. A thin fog hangs in the air, softening the background. She lifts the lamp. A woman in her twenties, jaw clenched. The camera pushes in toward the subject. At the end the subject fills the frame. She whispers, "Now."',
    );
  });

  it("skips an empty gap, leaving its picker's sentence in its place", () => {
    const segments = ltxSegments(
      ltx({
        slots: { ...emptySlots, action: "She turns" },
        light: { ...emptyLight, palette: "muted" },
      }),
    );
    expect(segments.map((s) => s.part)).toEqual([
      "shot",
      "angle",
      "light",
      "action",
      "movement",
    ]);
    // Camera off: no shot or movement sentence at all.
    expect(
      ltxSegments(
        ltx({
          cameraEnabled: false,
          slots: { ...emptySlots, scene: "A pier" },
        }),
      ).map((s) => s.part),
    ).toEqual(["scene"]);
  });

  it("puts the Acoustic Space caption first in Audio, then the gap's text", () => {
    const input = ltx({
      model: "ltx-2.5-akuspace",
      acoustic: club,
      slots: { ...emptySlots, audio: "Drums echo" },
    });
    const segments = ltxSegments(input);
    // The caption is never reworded; a full stop joins the gap's text to it.
    expect(segments.slice(-2)).toEqual([
      {
        part: "audio",
        text: acousticCaption(club),
        separator: " ",
        verbatim: true,
      },
      { part: "audio", text: "Drums echo.", separator: ". " },
    ]);
    // Without audio text the caption ends the paragraph in its own words.
    const bare = ltxSegments({
      ...input,
      slots: { ...emptySlots, scene: "A club" },
    });
    expect(bare.at(-1)).toEqual({
      part: "audio",
      text: acousticCaption(club),
      separator: " ",
      verbatim: true,
    });
  });

  it("is the request's description, recorded, and composePrompt adds nothing", () => {
    const composer = state({
      model: "ltx-2.5",
      description: "A pier",
      camera: camera("wide", null, "orbit"),
      slots: { ...emptySlots, audio: "Gulls cry" },
    });
    const input = composerInput(composer);
    expect(input.description).toBe(
      "A wide shot gives the subject room in its surroundings. A pier. The camera circles slowly around the subject. At the end the subject faces the camera from the other side. Gulls cry.",
    );
    expect(input.ltxPrompt).toEqual({
      main: "A pier",
      scene: "",
      character: "",
      action: "",
      audio: "Gulls cry",
      light: emptyLight,
      lightEdits: {},
    });
    expect(composePrompt(input)).toBe(input.description);
  });

  it("lets a person's light edit win, and keeps only edits that differ", () => {
    const composer = state({
      model: "ltx-2.5",
      description: "A pier",
      light: { ...emptyLight, atmosphere: "rain" },
      lightEdits: { rain: "A drizzle softens the lights.", fog: "Unused." },
    });
    const input = composerInput(composer);
    expect(input.description).toContain("A drizzle softens the lights.");
    expect(input.ltxPrompt?.lightEdits).toEqual({
      rain: "A drizzle softens the lights.",
    });
  });

  it("lets the gaps alone carry a run", () => {
    const empty = state({ model: "ltx-2.5" });
    expect(composerBlocked(empty, "", "")).toBe(true);
    const gap = state({
      model: "ltx-2.5",
      slots: { ...emptySlots, scene: "A pier" },
    });
    expect(composerBlocked(gap, "", "")).toBe(false);
    // FLUX does not read the gaps, so it still needs the main field.
    expect(composerBlocked({ ...gap, model: "flux-3" }, "", "")).toBe(true);
  });
});

describe("the 1,200-character limit", () => {
  it("counts the paragraph and names the parts a cut would shorten", () => {
    const long = "She walks slowly along the corridor. ".repeat(30);
    const fitted = fitSegments(
      ltxSegments(
        ltx({ slots: { ...emptySlots, action: long, audio: "Rain falls." } }),
      ),
    );
    expect(fitted.length).toBeGreaterThan(DESCRIPTION_LIMIT);
    expect(fitted.over).toBe(fitted.length - DESCRIPTION_LIMIT);
    expect(fitted.text.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(fitted.text.endsWith(" ")).toBe(false);
    expect(fitted.cut).toEqual(["action", "movement", "audio"]);
    expect(fitted.blocked).toBe(false);
    const short = fitSegments(
      ltxSegments(ltx({ slots: { ...emptySlots, action: "Runs." } })),
    );
    expect(short).toMatchObject({ over: 0, cut: [], blocked: false });
    expect(short.length).toBe(short.text.length);
  });

  it("holds a run whose cut would reach the Acoustic Space caption", () => {
    const composer = state({
      model: "ltx-2.5-akuspace",
      acoustic: club,
      description: "A club",
      slots: { ...emptySlots, scene: "Low red light. ".repeat(80) },
    });
    expect(composerBlocked(composer, "", "")).toBe(true);
  });
});

describe("chips", () => {
  it("insert after what the gap holds and never replace it", () => {
    expect(insertChip("", "rough stone surfaces", "fragment")).toBe(
      "Rough stone surfaces",
    );
    expect(
      insertChip("A workshop at night", "rough stone surfaces", "fragment"),
    ).toBe("A workshop at night, rough stone surfaces");
    expect(insertChip("A workshop.", "rough stone surfaces", "fragment")).toBe(
      "A workshop. Rough stone surfaces",
    );
    expect(insertChip("A woman", "walks toward", "verb")).toBe(
      "A woman walks toward",
    );
    expect(insertChip("She sits", "A moment later, ", "starter")).toBe(
      "She sits. A moment later, ",
    );
    expect(insertChip("Rain.", 'A voice whispers, "…"', "sentence")).toBe(
      'Rain. A voice whispers, "…"',
    );
    for (const text of ["", "Anything at all", "Ends.", "trailing,  "])
      expect(insertChip(text, "x", "fragment").startsWith(text.trimEnd())).toBe(
        true,
      );
  });
});
