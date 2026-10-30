import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { validateInput } from "../server/validation";
import {
  acousticCaption,
  acousticSections,
  type AcousticSetting,
} from "../shared/acoustic";
import { cameraSections, type CameraSelection } from "../shared/camera";
import { lightGroups, type LightSelection } from "../shared/light";
import {
  composedRefusal,
  ltxSlots,
  SLOT_LIMIT,
  type LtxSlots,
} from "../shared/ltx-prompt";
import { chipInsertion, ltxVocabulary } from "../shared/ltx-vocabulary";
import { ltxExamples } from "../shared/ltx-examples";
import { composePrompt } from "../shared/presets";
import SlotChips from "../src/components/SlotChips";
import {
  composerBlocked,
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import type { VideoModel } from "../shared/types";

/** Generate is enabled for a video exactly when the composer does not block it. */
const enabled = (state: ComposerState) =>
  !composerBlocked(state, "", composePrompt(composerInput(state)));
const settle = (patch: Partial<ComposerState>) =>
  composerReducer(initialComposer, { type: "update", patch });
const custom = (text: string): AcousticSetting => ({
  mode: "room",
  preset: "empty_club",
  level: "high",
  text,
});

describe("the Acoustic Space caption in a composed run", () => {
  it("arrives verbatim, newlines and closing marks included", () => {
    for (const text of [
      "in a long hall,\n  slow tail;",
      "under a bridge:",
      "a stairwell, wet   concrete",
      'a "dead" room!',
    ]) {
      const acoustic = custom(text);
      const state = settle({
        generator: "video",
        model: "ltx-2.5-akuspace",
        acoustic,
        description: "A drummer warms up",
        slots: { scene: "", character: "", action: "", audio: "Sticks click" },
      });
      expect(enabled(state), text).toBe(true);
      const input = composerInput(state);
      expect(input.description).toContain(acousticCaption(acoustic));
      expect(() => validateInput(input), text).not.toThrow();
    }
  });
});

describe("chips at the gap's limit", () => {
  const full = "x".repeat(SLOT_LIMIT - 10);
  it("are disabled, and say why, when the phrase would not fit", () => {
    expect(chipInsertion(full, "rough stone surfaces", "fragment").fits).toBe(
      false,
    );
    expect(chipInsertion(full, "film grain", "fragment").fits).toBe(false);
    expect(chipInsertion("x".repeat(20), "film grain", "fragment").fits).toBe(
      true,
    );
    const html = renderToStaticMarkup(
      createElement(SlotChips, {
        slot: "scene",
        text: full,
        onInsert: () => {},
      }),
    );
    expect(html).toMatch(
      /<button type="button" class="slot-chip" disabled="" aria-label="Rough stone, unavailable: the Scene gap would pass 1,200 characters"/,
    );
    const room = renderToStaticMarkup(
      createElement(SlotChips, { slot: "scene", text: "", onInsert: () => {} }),
    );
    expect(room).not.toContain("disabled");
  });
});

/** A small seeded generator, so a failure reproduces. */
function random(seed: number) {
  let value = seed;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 2 ** 32;
    return value / 2 ** 32;
  };
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(next() * items.length)];
  return { next, pick };
}

const odd = [
  "",
  "A pier at dawn",
  "trailing comma,",
  "colon:",
  "two\nlines\n\n",
  '  quoted "line"  ',
  "ends with ellipsis…",
  "semicolon;",
  "(bracketed)",
  "tab\tand  spaces ",
];

describe("Generate is never enabled for a request the server refuses", () => {
  it("holds across generated gaps, chips, light and captions", () => {
    const { next, pick } = random(20261022);
    const models: VideoModel[] = ["ltx-2.5", "ltx-2.5-pro", "ltx-2.5-akuspace"];
    const lengths = [
      0,
      40,
      SLOT_LIMIT - 30,
      SLOT_LIMIT - 2,
      SLOT_LIMIT,
      SLOT_LIMIT + 1,
    ];
    const text = () => {
      const base = pick(odd);
      const length = pick(lengths);
      return length > base.length
        ? (base + " " + "word ".repeat(length)).slice(0, length)
        : base;
    };
    let tried = 0;
    let passed = 0;
    let composedWithCaption = 0;
    for (let run = 0; run < 1500; run++) {
      const slots = Object.fromEntries(
        ltxSlots.map(({ id }) => {
          let value = next() < 0.4 ? "" : text();
          // Chips as the UI offers them: only those that still fit.
          for (let n = Math.floor(next() * 4); n > 0; n--) {
            const examples = next() < 0.2;
            const group = pick(ltxVocabulary[id]);
            const insertion = examples
              ? chipInsertion(value, pick(ltxExamples[id]).text, "sentence")
              : chipInsertion(value, pick(group.chips).phrase, group.join);
            if (insertion.fits) value = insertion.text;
          }
          return [id, value];
        }),
      ) as LtxSlots;
      const light = Object.fromEntries(
        lightGroups.map((g) => [
          g.id,
          next() < 0.5 ? null : pick<{ id: string }>(g.terms).id,
        ]),
      ) as LightSelection;
      const lightEdits =
        next() < 0.2 && light.lighting
          ? {
              [light.lighting]: pick([
                "",
                "Soft lamplight.",
                "x".repeat(600),
                "x".repeat(601),
              ]),
            }
          : {};
      const model = pick(models);
      const section = pick(acousticSections);
      const acoustic: AcousticSetting = {
        mode: section.id,
        preset: pick(section.presets),
        level: pick(section.levels),
        ...(next() < 0.5
          ? {
              text: pick([
                "a long hall,\n tail;",
                "wet stone:",
                ' "dead" room ',
                "x".repeat(600),
              ]),
            }
          : {}),
      } as AcousticSetting;
      const camera = Object.fromEntries(
        cameraSections.map((s) => [
          s.id,
          next() < 0.4 ? null : pick<{ id: string }>(s.terms).id,
        ]),
      ) as CameraSelection;
      const state = settle({
        generator: "video",
        model,
        acoustic: model === "ltx-2.5-akuspace" ? acoustic : null,
        description:
          next() < 0.15 ? "" : text().slice(0, next() < 0.1 ? 1201 : 1200),
        camera,
        cameraEdits: {},
        cameraEnabled: next() < 0.8,
        slots,
        light,
        lightEdits,
      });
      tried++;
      if (!enabled(state)) continue;
      const input = composerInput(state);
      if (input.ltxPrompt && input.acoustic) composedWithCaption++;
      // The same rules the server applies, then the server's whole allowlist.
      if (input.ltxPrompt)
        expect(
          composedRefusal(input.description, input.ltxPrompt, input.acoustic),
        ).toBeNull();
      expect(() => validateInput(input), `run ${run}`).not.toThrow();
      passed++;
    }
    // Enough of each kind ran for the property to mean something.
    expect(tried).toBe(1500);
    expect(passed).toBeGreaterThan(400);
    expect(composedWithCaption).toBeGreaterThan(20);
  });
});
