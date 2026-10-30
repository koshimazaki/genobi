import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  acousticCaption,
  acousticText,
  chooseAcoustic,
  acousticSections,
  appendAcoustic,
  defaultAcoustic,
  readAcoustic,
  type AcousticSetting,
} from "../shared/acoustic";
import { acousticSwitch, readyEntry, registry } from "../shared/registry";
import { akuspaceValues } from "../shared/comfy/akuspace";
import type { Job } from "../shared/types";
import { composePrompt } from "../shared/presets";
import { canonicalInput } from "../shared/idempotency";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import GenerationControls, {
  ACOUSTIC_TITLE,
} from "../src/components/GenerationControls";
import AcousticDialog from "../src/components/AcousticDialog";
import PromptInput from "../src/components/PromptInput";
import KeyDialog from "../src/components/KeyDialog";
import Topbar, { SOURCE_URL } from "../src/components/Topbar";
import { validateInput } from "../server/validation";
import { emptyCamera } from "../shared/camera";
import type { VideoModel } from "../shared/types";

const state = (patch: Partial<ComposerState> = {}): ComposerState => ({
  ...initialComposer,
  generator: "video",
  model: "ltx-2.5",
  description: "A lighthouse at dusk.",
  acoustic: null,
  openOnly: false,
  ...patch,
});
const update = (from: ComposerState, patch: Partial<ComposerState>) =>
  composerReducer(from, { type: "update", patch });
const club: AcousticSetting = {
  mode: "room",
  preset: "empty_club",
  level: "high",
};

describe("the AKUSPACE treatment matches the node", () => {
  // Expected strings come from running `_conditioned_prompt` in
  // ComfyUI-Koshi-Nodes/nodes/audio/akuspace.py (presets.json v4, release 0.5)
  // with application "Off" and source "none", on 10 October 2026.
  it("composes the same text as the AKUSPACE Prompt node", () => {
    const cases: [string, AcousticSetting, string][] = [
      [
        "A dancer turns under a single spotlight.",
        { mode: "room", preset: "cathedral", level: "high" },
        "A dancer turns under a single spotlight. AKUSPACE through synthetic cathedral reverb, heavy wide diffuse reflections and a long decaying tail, no background ambience",
      ],
      [
        "Rain on a tin roof.",
        { mode: "outside", preset: "outdoor_night", level: "high" },
        "Rain on a tin roof. AKUSPACE outdoors at night, heavy open-air acoustics with crickets and distant car ambience",
      ],
      [
        "A synth stab",
        { mode: "sfx", preset: "dual_delay", level: "high" },
        "A synth stab, AKUSPACE through a modular granular delay, heavy scattered grains and unpredictable modulated echoes, no background ambience",
      ],
      [
        "A dancer turns",
        { mode: "room", preset: "small_room", level: "low" },
        "A dancer turns, AKUSPACE in a small bathroom-like room, gentle bright close reflections and a short 0.67-second reverb decay, no background ambience",
      ],
      [
        "",
        { mode: "room", preset: "empty_club", level: "mid" },
        "AKUSPACE in an empty club, moderate broad hard-surface reflections and a 1.2-second reverb decay, no crowd",
      ],
    ];
    for (const [base, setting, expected] of cases)
      expect(appendAcoustic(base, acousticCaption(setting))).toBe(expected);
  });

  it("offers the node's modes, presets and levels, and nothing else", () => {
    expect(
      acousticSections.map(({ id, label, presets, levels }) => ({
        id,
        label,
        presets,
        levels,
      })),
    ).toEqual([
      {
        id: "room",
        label: "Room",
        presets: ["small_room", "empty_club", "medium_room", "cathedral"],
        levels: ["low", "mid", "high"],
      },
      {
        id: "outside",
        label: "Space",
        presets: ["outdoor_day", "outdoor_night"],
        levels: ["low", "high"],
      },
      {
        id: "sfx",
        label: "Sound effects",
        presets: ["dual_delay"],
        levels: ["low", "high"],
      },
    ]);
    expect(defaultAcoustic).toEqual({
      mode: "room",
      preset: "medium_room",
      level: "mid",
    });
    expect(readAcoustic(club)).toEqual(club);
    expect(readAcoustic({ ...club, extra: 1 })).toEqual(club);
    expect(readAcoustic({ ...club, preset: "large_room" })).toBeUndefined();
    expect(
      readAcoustic({ mode: "outside", preset: "outdoor_day", level: "mid" }),
    ).toBeUndefined();
    expect(readAcoustic("AKUSPACE, large room")).toBeUndefined();
  });

  it("closes the LTX paragraph in composePrompt, and only with a treatment", () => {
    const input = {
      generator: "video" as const,
      model: "ltx-2.5-akuspace" as VideoModel,
      description: "A drummer warms up.",
      cameraEnabled: true,
      camera: { ...emptyCamera, movements: "static" as const },
      cameraEdits: {},
    };
    expect(composePrompt({ ...input, acoustic: club })).toBe(
      "A drummer warms up. The camera holds a static frame on the subject for the whole shot. AKUSPACE in an empty club, heavy broad hard-surface reflections and a 1.2-second reverb decay, no crowd",
    );
    expect(composePrompt({ ...input, acoustic: null })).toBe(
      "A drummer warms up. The camera holds a static frame on the subject for the whole shot.",
    );
  });

  it("is part of the replay, defaulting to none", () => {
    const run = { generator: "video", description: "x", model: "ltx-2.5" };
    expect(canonicalInput({ ...run, acoustic: null } as never)).toBe(
      canonicalInput(run as never),
    );
    const roomed = { ...run, model: "ltx-2.5-akuspace", acoustic: club };
    expect(canonicalInput(roomed as never)).not.toBe(
      canonicalInput({ ...roomed, acoustic: null } as never),
    );
    // Key order inside the treatment does not decide a replay.
    expect(
      canonicalInput({
        ...roomed,
        acoustic: { level: "high", preset: "empty_club", mode: "room" },
      } as never),
    ).toBe(canonicalInput(roomed as never));
  });
});

describe("Acoustic Space is its own workflow entry", () => {
  it("registers the Cloud entry beside LTX-2.5 Fast", () => {
    expect(readyEntry("ltx-2-5-akuspace")).toMatchObject({
      family: "ltx",
      label: "LTX-2.5 · Acoustic Space",
      route: "workflow",
      model: "workflow/ltx-2-5-akuspace-t2v",
      open: true,
      videoModel: "ltx-2.5-akuspace",
      controls: { kind: "video", acoustic: true },
    });
    expect(readyEntry("ltx-2-5-fast")!.controls).toMatchObject({
      acoustic: false,
    });
    const withSwitch = registry.filter((entry) => acousticSwitch(entry));
    expect(withSwitch.map((entry) => entry.id)).toEqual([
      "ltx-2-5-fast",
      "ltx-2-5-akuspace",
    ]);
  });

  it("moves with the switch, a chosen space and None", () => {
    const on = update(state(), { model: "ltx-2.5-akuspace" });
    expect(on).toMatchObject({ model: "ltx-2.5-akuspace" });
    expect(on.acoustic).toEqual(defaultAcoustic);
    expect(update(on, { model: "ltx-2.5" }).acoustic).toBeNull();
    // Choosing a space on Fast moves to the workflow; None moves back.
    const chosen = update(state(), { acoustic: club });
    expect(chosen).toMatchObject({ model: "ltx-2.5-akuspace", acoustic: club });
    expect(update(chosen, { acoustic: null })).toMatchObject({
      model: "ltx-2.5",
      acoustic: null,
    });
    // Open only keeps it: the LoRA and LTX-2.5 Fast are open.
    expect(update(chosen, { openOnly: true })).toMatchObject({
      model: "ltx-2.5-akuspace",
      acoustic: club,
    });
  });

  it("is coerced off by every entry without the control", () => {
    const chosen = update(state(), { acoustic: club });
    for (const model of ["flux-3", "ltx-2.5-pro"] as VideoModel[])
      expect(update(chosen, { model }).acoustic).toBeNull();
    expect(update(chosen, { generator: "upscale" }).acoustic).toBeNull();
    // Only the workflow is sent a treatment.
    expect(composerInput(chosen).acoustic).toEqual(club);
    expect(composerInput(state())).not.toHaveProperty("acoustic");
  });

  it("is validated for the workflow only", () => {
    const roomed = composerInput(update(state(), { acoustic: club }));
    expect(validateInput(roomed)).toMatchObject({
      model: "ltx-2.5-akuspace",
      acoustic: club,
    });
    const fast = composerInput(state());
    expect(validateInput(fast)).not.toHaveProperty("acoustic");
    expect(validateInput({ ...fast, acoustic: null })).not.toHaveProperty(
      "acoustic",
    );
    expect(() => validateInput({ ...fast, acoustic: club })).toThrow(
      "its own LTX-2.5 workflow",
    );
    expect(() => validateInput({ ...roomed, acoustic: null })).toThrow();
    // Audio is always on, so a stray switch no longer refuses the room.
    expect(validateInput({ ...roomed, audio: false })).toMatchObject({
      acoustic: club,
    });
    expect(() =>
      validateInput({ ...roomed, acoustic: { ...club, level: "loud" } }),
    ).toThrow("supported acoustic space");
  });
});

describe("the Acoustic Space controls", () => {
  const row = (model: VideoModel) =>
    renderToStaticMarkup(
      <GenerationControls
        generator="video"
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

  it("shows the switch on LTX-2.5 Fast and the workflow only", () => {
    const fast = row("ltx-2.5");
    expect(fast).toContain('id="acoustic-label"');
    expect(fast).toContain(">Acoustic space<");
    expect(fast).toContain(`title="${ACOUSTIC_TITLE}"`);
    expect(fast).toMatch(
      /aria-checked="false" aria-labelledby="acoustic-label"/,
    );
    expect(row("ltx-2.5-akuspace")).toMatch(
      /aria-checked="true" aria-labelledby="acoustic-label"/,
    );
    expect(row("ltx-2.5-pro")).not.toContain("acoustic-label");
    expect(row("flux-3")).not.toContain("acoustic-label");
  });

  it("adds the treatment as its own prompt line, opening the dialog", () => {
    const html = (acoustic: AcousticSetting | null) =>
      renderToStaticMarkup(
        <PromptInput
          description="A drummer warms up."
          onChange={() => {}}
          cameraEnabled
          camera={emptyCamera}
          cameraEdits={{}}
          model="ltx-2.5-akuspace"
          onOpenCamera={() => {}}
          acoustic={acoustic}
        />,
      );
    expect(html(club)).toContain('class="acoustic-sentence"');
    expect(html(club)).toContain(acousticCaption(club));
    expect(html(null)).not.toContain("acoustic-sentence");
  });

  it("lays the dialog out by mode, with None and the caption line", () => {
    const html = renderToStaticMarkup(
      <AcousticDialog selected={club} onApply={() => {}} onClose={() => {}} />,
    );
    for (const label of ["Room", "Space", "Sound effects"])
      expect(html).toContain(`<span>${label}</span>`);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain(">None<");
    for (const label of [
      "Small room",
      "Empty club",
      "Medium room",
      "Cathedral",
    ])
      expect(html).toContain(`<span>${label}</span>`);
    expect(html).toContain(">Moderate<");
    expect(html).toContain('aria-pressed="true" title="Filtered');
    expect(html).toContain(acousticText(club));
    expect(html).toContain('id="acoustic-text"');
    expect(html).toContain("Replay acoustic preview");
  });
});

describe("the toolbar and the top bar", () => {
  it("combines family and model before the controls and Generate", async () => {
    vi.stubGlobal("location", new URL("http://127.0.0.1/"));
    vi.stubGlobal("history", { state: null, replaceState() {} });
    vi.stubGlobal("stop", () => {});
    try {
      const { default: App } = await import("../src/App");
      const html = renderToStaticMarkup(<App />);
      const model = html.indexOf("family-model");
      expect(model).toBeGreaterThan(-1);
      expect(html).toContain("family-model__summary");
      expect(html).toContain("toolbar-action");
      expect(html).not.toContain('id="generator"');
      const generate = html.indexOf('class="generate-button');
      expect(generate).toBeGreaterThan(model);
      expect(html.indexOf('class="cost"')).toBeGreaterThan(generate);
      expect(html).not.toContain("audio-label");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says open source once under Connect key, and links it from the key dialogue", () => {
    const bar = renderToStaticMarkup(
      <Topbar
        apiKey=""
        hasServerKey={false}
        connection={0}
        keyVerified={false}
        onVerified={() => {}}
        revision=""
        onOpenKey={() => {}}
      />,
    );
    expect(bar).toContain(
      `<a class="source-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer"><span>Run your own</span><span>Open source ↗</span></a>`,
    );
    expect(bar.indexOf("Connect key")).toBeLessThan(bar.indexOf("source-link"));
    const key = renderToStaticMarkup(
      <KeyDialog
        value=""
        onSave={() => {}}
        onClose={() => {}}
        serverKey={false}
      />,
    );
    expect(key).toContain("Connect with your Comfy API key");
    expect(key).not.toContain("Paste your");
    expect(key).toContain(
      `<a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">read the code</a>`,
    );
  });
});

describe("custom acoustic wording", () => {
  it("protects the trigger and carries text through validation, composition and replay", () => {
    const custom = { ...club, text: "Close bright echoes behind the singer." };
    const input = composerInput(update(state(), { acoustic: custom }));
    expect(validateInput(input).acoustic).toEqual(custom);
    const prompt = composePrompt(input);
    expect(akuspaceValues(input, prompt, () => 0).prompt).toBe(prompt);
    const job = { ...input, prompt } as Job;
    for (const type of ["restore", "restore-prompt"] as const) {
      const restored = composerReducer(state(), { type, job });
      expect(restored.acoustic).toEqual(custom);
      expect(composePrompt(composerInput(restored))).toContain(
        "AKUSPACE Close bright echoes behind the singer.",
      );
    }
    expect(composePrompt(input)).toContain(
      "AKUSPACE Close bright echoes behind the singer.",
    );
    expect(canonicalInput(input)).not.toBe(
      canonicalInput({ ...input, acoustic: club }),
    );
    expect(
      canonicalInput({ ...input, acoustic: { ...club, text: undefined } }),
    ).toBe(canonicalInput({ ...input, acoustic: club }));
    expect(
      chooseAcoustic(acousticSections[1], "outdoor_night", custom).text,
    ).toBe(custom.text);
    for (const text of [null, 4, {}, "", "  ", "x".repeat(601)]) {
      expect(readAcoustic({ ...club, text })).toBeUndefined();
      expect(() =>
        validateInput({ ...input, acoustic: { ...club, text } }),
      ).toThrow("supported acoustic space");
    }
    expect(readAcoustic({ ...club, text: "x".repeat(600) })?.text).toHaveLength(
      600,
    );
  });
});
