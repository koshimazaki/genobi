import type { EffectControl, EffectPreset } from "./types";

type Definition = Omit<EffectPreset, "moduleHashes">;
const number = (
  key: string,
  label: string,
  min = 0,
  max = 1,
  step = 0.01,
  integer = false,
): EffectControl => ({ key, label, type: "number", min, max, step, integer });
const color = (key = "accent", label = "Accent"): EffectControl => ({
  key,
  label,
  type: "color",
});
const text = (key: string, label: string, maxLength = 80): EffectControl => ({
  key,
  label,
  type: "text",
  maxLength,
});
const credits = [
  {
    name: "Genobi",
    licence: "MIT",
    url: "https://github.com/koshimazaki/genobi",
  },
];
const common = {
  schemaVersion: "genobi.effect-preset.v1" as const,
  version: 1,
  readiness: "editable" as const,
  durationSeconds: 4,
  credits,
};
const bindings = (...keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, k]));

export const EFFECT_DEFINITIONS: Definition[] = [
  {
    ...common,
    id: "poster-window",
    name: "Poster window",
    family: "Poster & Temporal",
    description:
      "A contained posterized window, fine halftone and restrained jitter.",
    note: "Spatial treatment of the current picture. It does not offset source time.",
    input: "composite-below",
    controls: [
      number("mix", "Mix"),
      number("windowX", "Window X"),
      number("windowY", "Window Y"),
      number("windowSize", "Window size", 0.1, 0.9),
      number("levels", "Poster levels", 2, 8, 1, true),
      number("halftone", "Halftone"),
      number("jitter", "Jitter"),
      color(),
    ],
    defaults: {
      mix: 0.64,
      windowX: 0.5,
      windowY: 0.5,
      windowSize: 0.54,
      levels: 4,
      halftone: 0.75,
      jitter: 0.2,
      accent: "#b64c50",
    },
    layers: [
      {
        key: "poster",
        name: "Poster window",
        moduleId: "effects-poster-window",
        start: 0,
        duration: 1,
        parameters: {},
        bindings: bindings(
          "mix",
          "windowX",
          "windowY",
          "windowSize",
          "levels",
          "halftone",
          "jitter",
          "accent",
        ),
      },
    ],
  },
  {
    ...common,
    id: "cinematic-scan",
    name: "Cinematic scan",
    family: "Cinematic / HUD",
    description:
      "A quiet lens scan beneath independently editable monitor graphics.",
    note: "HUD readouts are authored graphics, not measured scene telemetry.",
    input: "composite-below",
    controls: [
      number("scanMix", "Scan mix"),
      number("hudMix", "HUD mix"),
      number("speed", "Speed", 0, 2),
      number("lines", "Scan lines"),
      number("distortion", "Lens distortion"),
      color(),
      text("label", "Label", 48),
    ],
    defaults: {
      scanMix: 0.3,
      hudMix: 0.75,
      speed: 0.5,
      lines: 0.25,
      distortion: 0.2,
      accent: "#9ce2bc",
      label: "FIELD MONITOR",
    },
    layers: [
      {
        key: "scan",
        name: "Cinematic scan",
        moduleId: "effects-scan",
        start: 0,
        duration: 1,
        parameters: {},
        bindings: {
          mix: "scanMix",
          ...bindings("speed", "lines", "distortion", "accent"),
        },
      },
      {
        key: "hud",
        name: "Field monitor HUD",
        moduleId: "effects-hud",
        start: 0,
        duration: 1,
        parameters: { font: "IBM Plex Mono" },
        bindings: { mix: "hudMix", ...bindings("speed", "accent", "label") },
      },
    ],
  },
  {
    ...common,
    id: "kinetic-title",
    name: "Kinetic title",
    family: "Kinetic",
    description:
      "Persistent geometric marks and editable type on one shared motion clock.",
    note: "Authored vector geometry is rendered into the composition; text and controls remain editable.",
    input: "none",
    controls: [
      text("text", "Title"),
      text("subtitle", "Subtitle", 120),
      color(),
      color("color", "Text colour"),
      number("mix", "Mix"),
      number("speed", "Speed", 0, 2),
      number("shapeCount", "Shapes", 3, 24, 1, true),
    ],
    defaults: {
      mix: 1,
      speed: 0.35,
      accent: "#d2f56a",
      color: "#f0f1e9",
      text: "MAKE IT MOVE",
      subtitle: "EDITABLE MOTION",
      shapeCount: 12,
    },
    layers: [
      {
        key: "title",
        name: "Kinetic title",
        moduleId: "effects-kinetic-title",
        start: 0,
        duration: 1,
        parameters: { font: "IBM Plex Mono" },
        bindings: bindings(
          "mix",
          "speed",
          "accent",
          "color",
          "text",
          "subtitle",
          "shapeCount",
        ),
      },
    ],
  },
  {
    ...common,
    id: "liquid-mirror",
    name: "Liquid mirror",
    family: "Fluid & Distortion",
    description: "Reflective folds with a gentle, configurable image ripple.",
    note: "Analytic image distortion. This is not a fluid simulation or a temporal water grid.",
    input: "composite-below",
    controls: [
      number("mix", "Mix"),
      number("ripple", "Ripple"),
      number("folds", "Folds", 2, 12, 1, true),
      number("speed", "Speed", 0, 2),
    ],
    defaults: { mix: 0.45, ripple: 0.3, folds: 6, speed: 0.35 },
    layers: [
      {
        key: "mirror",
        name: "Liquid mirror",
        moduleId: "effects-liquid-mirror",
        start: 0,
        duration: 1,
        parameters: {},
        bindings: bindings("mix", "ripple", "folds", "speed"),
      },
    ],
  },
];
